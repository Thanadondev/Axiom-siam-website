import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { linkWarnings } from "./link-check";
import { Prisma } from "@axiom/db";
import { PrismaService } from "../prisma/prisma.service";
import { NotifyService } from "../notify/notify.service";
import { planStep, stepName, SHIP_STEP } from "../orders/production-steps";
import { erpConfig, fetchErpStatus, type ErpConfig } from "./erp.client";
import { normalizeErpNo, snapshot, webStep, type ErpSnapshot, type ErpStatus } from "./production-status";

/** orders the ERP can still move: paid, design approved, or on the floor */
const ON_FLOOR = ["paid", "approved", "in_production"];
/** an opened order is refreshed from the ERP when its copy is older than this */
const STALE_MS = 2 * 60_000;

const SYNC_SELECT = {
  id: true, orderNo: true, userId: true, status: true, productionStep: true,
  erpOrderNo: true, erpStatus: true, erpSyncedAt: true,
} as const;
type SyncRow = { id: string; orderNo: string; userId: string; status: string; productionStep: number; erpOrderNo: string | null; erpStatus: unknown };

export interface SyncResult { ok: boolean; step?: number; erpStep?: number; moved?: boolean; error?: string; message: string }

/**
 * Production tracking comes from the factory's ERP: an admin links a web
 * order to its ERP order number once, and from then on the step the customer
 * sees follows the ERP — refreshed when the order is opened, every few minutes
 * in the background, or on demand from the production board.
 */
@Injectable()
export class ErpSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("ERP");
  private timer?: NodeJS.Timeout;
  private running = false;
  /** swapped in tests */
  fetchImpl: typeof fetch = (...a) => fetch(...a);
  cfg: ErpConfig | null = erpConfig();

  constructor(private prisma: PrismaService, private notify: NotifyService) {}

  onModuleInit() {
    if (!this.cfg || this.cfg.syncMinutes <= 0 || process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.syncActive().catch(e => this.log.warn(`sync failed: ${e?.message ?? e}`)), this.cfg.syncMinutes * 60_000);
    this.timer.unref?.();
    this.log.log(`production status from ${this.cfg.baseUrl} every ${this.cfg.syncMinutes} min`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  get enabled() {
    return Boolean(this.cfg);
  }

  /** an admin links (or, with a blank number, unlinks) the web order and its ERP order */
  async link(id: string, adminId: string, raw: string | null | undefined, force = false): Promise<SyncResult & { erpOrderNo: string | null }> {
    const o = await this.prisma.order.findUnique({ where: { id }, select: SYNC_SELECT });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    const no = raw ? normalizeErpNo(raw) : "";
    if (!no) {
      await this.prisma.order.update({ where: { id }, data: { erpOrderNo: null, erpStatus: Prisma.DbNull, erpSyncedAt: null } });
      return { ok: true, erpOrderNo: null, message: `เลิกผูก ${o.orderNo} กับ ERP แล้ว` };
    }
    if (!this.cfg) throw new BadRequestException("ยังไม่ได้ตั้ง ERP_BASE_URL ใน .env ของ API");
    const taken = await this.prisma.order.findFirst({ where: { erpOrderNo: no, NOT: { id } }, select: { orderNo: true } });
    if (taken) throw new BadRequestException(`เลข ERP ${no} ผูกกับออเดอร์ ${taken.orderNo} อยู่แล้ว`);

    const r = await fetchErpStatus(this.cfg, no, this.fetchImpl);
    if (!r.ok) throw new BadRequestException(r.error);

    // does the job look like this order? If not, ask before the customer sees its progress
    if (!force) {
      const facts = await this.prisma.order.findUnique({ where: { id }, select: { createdAt: true, items: { select: { qty: true } } } });
      const qty = Array.isArray(facts?.items) ? facts.items.reduce((n: number, i: { qty: number }) => n + i.qty, 0) : null;
      const warnings = linkWarnings({ createdAt: facts?.createdAt ?? null, qty }, r.status);
      if (warnings.length) {
        throw new ConflictException({ message: `เลข ERP ${no} อาจไม่ใช่งานของ ${o.orderNo} — ตรวจก่อนผูก`, warnings, needsConfirm: true });
      }
    }
    await this.prisma.order.update({ where: { id }, data: { erpOrderNo: no } });
    const res = await this.apply({ ...o, erpOrderNo: no }, r.status, adminId);
    return { ...res, erpOrderNo: no, message: `ผูกกับ ERP ${no} แล้ว · ${res.message}` };
  }

  /** fetch one order's status from the ERP and apply it */
  async syncOne(id: string, by: string | null = null): Promise<SyncResult> {
    const o = await this.prisma.order.findUnique({ where: { id }, select: SYNC_SELECT });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (!o.erpOrderNo) return { ok: false, error: "not_linked", message: "ออเดอร์นี้ยังไม่ได้ผูกกับเลขออเดอร์ใน ERP" };
    if (!this.cfg) return { ok: false, error: "disabled", message: "ยังไม่ได้ตั้ง ERP_BASE_URL ใน .env ของ API" };
    const r = await fetchErpStatus(this.cfg, o.erpOrderNo, this.fetchImpl);
    if (!r.ok) return { ok: false, error: r.error, message: r.error };
    return this.apply(o, r.status, by);
  }

  /** ask the ERP about a job by its number (null when no ERP is set up) */
  async lookup(no: string) {
    if (!this.cfg) return null;
    return fetchErpStatus(this.cfg, normalizeErpNo(no), this.fetchImpl);
  }

  /** when an order is opened: a quick refresh if its copy is old (errors only logged) */
  async refreshIfStale(o: { id: string; status: string; erpOrderNo?: string | null; erpSyncedAt?: Date | null }) {
    if (!this.cfg || !o.erpOrderNo || !ON_FLOOR.includes(o.status)) return false;
    if (o.erpSyncedAt && Date.now() - new Date(o.erpSyncedAt).getTime() < STALE_MS) return false;
    try {
      const r = await this.syncOne(o.id);
      if (!r.ok) this.log.warn(`${o.erpOrderNo}: ${r.message}`);
      return r.ok;
    } catch (e: any) {
      this.log.warn(`${o.erpOrderNo}: ${e?.message ?? e}`);
      return false;
    }
  }

  /** every linked order still on the floor — the background job and the board's button */
  async syncActive(by: string | null = null) {
    if (!this.cfg) throw new BadRequestException("ยังไม่ได้ตั้ง ERP_BASE_URL ใน .env ของ API");
    if (this.running) return { checked: 0, moved: 0, failed: [] as string[], message: "กำลังซิงก์อยู่" };
    this.running = true;
    try {
      const rows = await this.prisma.order.findMany({
        where: { erpOrderNo: { not: null }, status: { in: ON_FLOOR as any } },
        select: { id: true, orderNo: true },
      });
      let moved = 0;
      const failed: string[] = [];
      for (const row of rows) {
        const r = await this.syncOne(row.id, by).catch((e: any) => ({ ok: false, message: e?.message ?? String(e) }) as SyncResult);
        if (!r.ok) failed.push(`${row.orderNo}: ${r.message}`);
        else if (r.moved) moved++;
      }
      return {
        checked: rows.length, moved, failed,
        message: `ซิงก์ ${rows.length} ออเดอร์ · เลื่อนขั้น ${moved}${failed.length ? ` · ไม่สำเร็จ ${failed.length}` : ""}`,
      };
    } finally {
      this.running = false;
    }
  }

  /** keep the ERP's answer on the order and move the step to match it */
  private async apply(o: SyncRow, erp: ErpStatus, by: string | null): Promise<SyncResult> {
    const snap = snapshot(erp);
    const prev = (o.erpStatus ?? null) as ErpSnapshot | null;
    const target = webStep(snap.step);
    const cache = { erpStatus: snap as unknown as Prisma.InputJsonValue, erpSyncedAt: new Date() };
    const { status, productionStep: from } = o;

    const plan = target > 0 && target !== from ? planStep(status, from, target) : null;
    let moved = false;
    if (plan?.ok) {
      await this.prisma.$transaction([
        this.prisma.order.update({ where: { id: o.id }, data: { ...cache, status: plan.status, productionStep: plan.step } }),
        this.prisma.orderStatusHistory.create({
          data: { orderId: o.id, status: plan.status, step: plan.step, note: `อัปเดตจาก ERP (${o.erpOrderNo})`, changedBy: by },
        }),
      ]);
      moved = true;
      // a correction backwards is recorded but not announced
      if (plan.step > from) {
        await this.notify.push({
          userId: o.userId,
          title: `ออเดอร์ ${o.orderNo}: ขั้นที่ ${plan.step}/${SHIP_STEP} · ${stepName(plan.step)}`,
          link: `/orders/${o.id}`,
        });
      }
    } else {
      await this.prisma.order.update({ where: { id: o.id }, data: cache });
    }

    // finished in the ERP: shipping on the web still needs the tracking number
    if (snap.step === SHIP_STEP && prev?.step !== SHIP_STEP && ON_FLOOR.includes(status)) {
      await this.notify.pushAdmins(
        `ERP: ${o.orderNo} ผลิตเสร็จ/จัดส่งแล้ว`,
        `ERP ${o.erpOrderNo} แจ้งว่าครบ 10 ขั้น — บันทึกเลขพัสดุบนเว็บเพื่อปิดออเดอร์`,
        `/admin/production`,
      );
    }

    const step = plan?.ok ? plan.step : from;
    const why = status === "pending" && target > 0 ? " (ยังไม่ชำระเงินบนเว็บ จึงยังไม่เลื่อนขั้น)" : "";
    return {
      ok: true, step, erpStep: snap.step, moved,
      message: moved
        ? `${o.orderNo} → ขั้น ${step} · ${stepName(step)} (ตาม ERP)`
        : `${o.orderNo} ตรงกับ ERP แล้ว · ERP ขั้น ${snap.step || "-"}${why}`,
    };
  }
}
