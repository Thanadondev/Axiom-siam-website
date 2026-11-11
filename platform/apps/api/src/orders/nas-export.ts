import { Injectable, Logger, NotFoundException, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { createWriteStream, promises as fs } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { PrismaService } from "../prisma/prisma.service";
import { OrderFilesService } from "./order-files.service";
import { keyOf } from "./blob-store";

/**
 * The graphics team works from job folders on the NAS (\\SynologyNAS\Axiom Siam),
 * one folder per job. Once a bib order by zip is paid, a copy of the customer's zip
 * goes into its own folder under NAS_JOBS_DIR (the team's @graphic\_webjobs):
 *
 *   AX-261110-6U5T R-bib (ML) J-Field Axis\HF-100 (N) 4379 J-Field Axis R bib (ML).zip
 *
 * The zip as it came (not unzipped). Written as ".part" then renamed, so the team
 * never opens half a file. When the NAS is away, it's tried again every couple of
 * minutes; the production board can also send it now. Off when NAS_JOBS_DIR is unset.
 */

/** sizes as the team writes them in job names: "S", "ML", "SML XL", "XL"; then XXL and the specials (SPM, SPL) */
export function sizeLabel(sizes: string[]) {
  const has = new Set(sizes);
  const small = ["S", "M", "L"].filter(s => has.has(s)).join("");
  return [small, ...["XL", "XXL", "SPM", "SPL"].filter(s => has.has(s))].filter(Boolean).join(" ");
}

/** a folder or file name Windows and the NAS accept: no \ / : * ? " < > |, no trailing dots or spaces */
export function safeName(raw: string, max = 120) {
  const s = raw.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return (s.length > max ? s.slice(0, max).trim() : s) || "order";
}

const PRODUCT: Record<string, string> = { bib_n: "N-bib", bib_r: "R-bib" };

/** "AX-261110-6U5T R-bib (ML) J-Field Axis" */
export function jobFolderName(o: { orderNo: string; product?: string | null; sizes: string[]; team?: string | null }) {
  const parts = [o.orderNo, o.product ? PRODUCT[o.product] ?? o.product : "", o.sizes.length ? `(${sizeLabel(o.sizes)})` : "", o.team ?? ""];
  return safeName(parts.filter(Boolean).join(" "));
}

/** an order that has been paid for: from "paid" on, not cancelled or refunded */
const PAID_ON = ["paid", "approved", "in_production", "shipped", "delivered", "completed"] as const;

@Injectable()
export class NasExportService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("NAS");
  private timer?: NodeJS.Timeout;
  private running = false;
  /** the NAS folder new jobs go into; null = off */
  readonly root: string | null = process.env.NAS_JOBS_DIR?.trim() || null;

  constructor(private prisma: PrismaService, private files: OrderFilesService) {}

  onModuleInit() {
    if (!this.root || process.env.NODE_ENV === "test") return;
    this.log.log(`paid orders' zips are copied to ${this.root}`);
    const run = () => void this.sweep().catch(e => this.log.warn(`sweep failed: ${e?.message ?? e}`));
    setTimeout(run, 15_000).unref?.();
    this.timer = setInterval(run, 2 * 60_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** every paid order whose zip isn't on the NAS yet */
  async sweep() {
    if (!this.root || this.running) return { copied: 0, failed: 0 };
    this.running = true;
    let copied = 0, failed = 0;
    try {
      const waiting = await this.prisma.orderFile.findMany({
        where: { nasAt: null, orderId: { not: null }, order: { status: { in: [...PAID_ON] } } },
        select: { orderId: true },
        take: 50,
      });
      for (const orderId of [...new Set(waiting.map(w => w.orderId!))]) {
        const r = await this.exportOrder(orderId).catch(e => ({ ok: false as const, error: String(e?.message ?? e) }));
        if (r.ok) copied++; else failed++;
      }
      if (failed) this.log.warn(`${failed} order(s) not copied to the NAS yet — will try again`);
    } finally { this.running = false; }
    return { copied, failed };
  }

  /** copies one paid order's zip(s) into its job folder; safe to call again */
  async exportOrder(orderId: string): Promise<{ ok: true; folder: string; copied: number } | { ok: false; error: string }> {
    if (!this.root) return { ok: false, error: "ยังไม่ได้ตั้ง NAS_JOBS_DIR ใน .env ของ API" };
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNo: true, status: true,
        user: { select: { fullName: true, companyName: true } },
        items: { select: { size: true, qty: true, designSnapshot: true } },
        files: { select: { id: true, name: true, path: true, nasAt: true, nasPath: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (!(PAID_ON as readonly string[]).includes(o.status)) return { ok: false, error: "ออเดอร์นี้ยังไม่ชำระเงิน" };
    if (!o.files.length) return { ok: false, error: "ออเดอร์นี้ไม่มีไฟล์งาน" };

    const snap = o.items[0]?.designSnapshot as { product?: string; team?: string } | null;
    const folder = jobFolderName({
      orderNo: o.orderNo,
      product: snap?.product ?? null,
      sizes: o.items.filter(i => i.qty > 0).map(i => i.size),
      // a bib designed on the web carries the team's own name; otherwise the customer's
      team: snap?.team || o.user.companyName || o.user.fullName,
    });
    // the NAS folder is there (we never create the share or _webjobs ourselves)
    if (!(await fs.stat(this.root).then(s => s.isDirectory(), () => false))) return { ok: false, error: `ส่งเข้า NAS ไม่ได้: เข้าถึง ${this.root} ไม่ได้` };
    try {
      const dir = join(this.root, folder);
      await fs.mkdir(dir, { recursive: true });
      let copied = 0;
      for (const f of o.files) {
        if (f.nasAt) continue;
        const name = safeName(f.name, 150).replace(/(\.zip)?$/i, ".zip");
        const dest = join(dir, name);
        const exists = await fs.stat(dest).then(s => s.isFile(), () => false);
        if (!exists) {
          const part = `${dest}.part`;
          try {
            await pipeline(await this.files.openStored(f.path), createWriteStream(part));
            await fs.rename(part, dest);
          } catch (e) {
            await fs.rm(part, { force: true });
            throw e;
          }
          copied++;
        }
        await this.prisma.orderFile.update({ where: { id: f.id }, data: { nasPath: join(folder, name), nasAt: new Date() } });
      }
      this.log.log(`${o.orderNo} → ${folder} (${copied} file${copied === 1 ? "" : "s"})`);
      return { ok: true, folder, copied };
    } catch (e: any) {
      return { ok: false, error: `ส่งเข้า NAS ไม่ได้: ${e?.message ?? e}` };
    }
  }
}
