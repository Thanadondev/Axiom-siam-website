import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotifyService } from "../notify/notify.service";
import { SettingsService } from "../settings/settings.service";
import { StorageService } from "./storage.service";
import { buildPromptPayPayload } from "./promptpay";
import { judgeSlip, ManualSlipReader, type SlipReader, type SlipFacts } from "./slip-policy";
import { MIN_CHARGE_BAHT } from "./money";
import { ledger, upfrontCovered, DUE_TH, type Ledger } from "./ledger";
import { signSlipUrl } from "./slip-link";
import { issueInvoice, issueCreditNote } from "./invoices";
import { readTaxInfo } from "../orders/tax-invoice";

const CLOSED = ["cancelled", "refunded", "completed"];
const METHOD_TH: Record<string, string> = { cash: "เงินสด", transfer: "โอน (นอกระบบ)", cheque: "เช็ค", other: "อื่น ๆ" };

/**
 * Money by Thai bank transfer.
 *
 * The flow, and where trust lives:
 *   1. customer opens the order      -> we show a PromptPay QR + account number
 *   2. customer transfers, uploads a slip -> Payment(status=submitted). NOT paid.
 *   3. an admin looks at the slip    -> approve => order.paid, or reject with a reason
 *
 * An uploaded slip is a *claim*, never proof. Only confirmed money moves an
 * order to `paid`: an approved slip (approveSlip) or a payment an admin
 * records by hand with its amount (recordManual) — never a bare status change.
 *
 * With a deposit (pricing.depositPct < 100) the deposit is due while the order
 * is pending and moves it to `paid`; the balance is due before it ships.
 * lib: ledger.ts works out what is due.
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger("Payments");
  /** swap for a SlipOK/EasySlip reader later — judgeSlip stays the same */
  private readonly reader: SlipReader = new ManualSlipReader();

  constructor(
    private prisma: PrismaService,
    private notify: NotifyService,
    private settings: SettingsService,
    private storage: StorageService,
  ) {}

  async status() {
    const bank = await this.settings.bank();
    return {
      enabled: bank.enabled && Boolean(bank.promptpayId || bank.accountNo),
      method: "bank_transfer" as const,
      autoVerify: this.reader.enabled,
    };
  }

  // ---------- 1. how to pay ----------
  /** account details + a QR encoding the exact amount owed */
  async payMethods(userId: string, orderId: string) {
    const order = await this.mineOrThrow(userId, orderId);
    const bank = await this.settings.bank();
    const l = await this.ledgerOf(order);

    if (!bank.enabled) throw new BadRequestException("ยังไม่เปิดรับชำระเงิน กรุณาติดต่อทีมงาน");
    if (l.due <= 0) throw new BadRequestException("ออเดอร์นี้ไม่มียอดที่ต้องชำระตอนนี้ (ชำระแล้ว หรือถูกยกเลิก)");
    if (l.due < MIN_CHARGE_BAHT) throw new BadRequestException(`ยอดขั้นต่ำในการชำระเงินคือ ฿${MIN_CHARGE_BAHT}`);

    // a bad PromptPay id must not take the whole page down — the account
    // number below is enough to pay us
    let qr: string | null = null;
    if (bank.promptpayId) {
      try {
        qr = buildPromptPayPayload({ target: bank.promptpayId, type: bank.promptpayType, amount: l.due });
      } catch (e: any) {
        this.log.error(`PromptPay id ตั้งค่าไว้ไม่ถูกต้อง (${bank.promptpayId}): ${e.message}`);
      }
    }

    return {
      amount: l.due,
      kind: l.kind,
      total: l.total,
      paid: l.paid,
      outstanding: l.outstanding,
      orderNo: order.orderNo,
      qrPayload: qr,
      bank: {
        bankName: bank.bankName, accountNo: bank.accountNo, accountName: bank.accountName, note: bank.note,
        // for a transfer from abroad (teams in Japan): blank until an admin fills them in
        bankNameEn: bank.bankNameEn ?? "", accountNameEn: bank.accountNameEn ?? "", swift: bank.swift ?? "",
      },
    };
  }

  // ---------- 2. customer uploads a slip ----------
  async submitSlip(userId: string, orderId: string, file: { buffer: Buffer; mimetype: string; size: number }) {
    const order = await this.mineOrThrow(userId, orderId);
    const l = await this.ledgerOf(order);
    if (l.due <= 0 || !l.kind) throw new BadRequestException("ออเดอร์นี้ไม่มียอดที่ต้องชำระตอนนี้ (ชำระแล้ว หรือถูกยกเลิก)");

    // one slip in review at a time — otherwise a customer can spam the queue
    const inReview = await this.prisma.payment.findFirst({
      where: { orderId, status: "submitted" },
      select: { id: true },
    });
    if (inReview) throw new BadRequestException("มีสลิปที่รอตรวจสอบอยู่แล้ว กรุณารอทีมงานตรวจสอบ");

    const hash = createHash("sha256").update(file.buffer).digest("hex");

    // the same image paying two orders is the cheapest fraud there is
    const dupe = await this.prisma.payment.findFirst({
      where: { slipHash: hash, status: { in: ["submitted", "paid"] } },
      select: { orderId: true },
    });
    if (dupe) {
      this.log.warn(`slip hash ${hash.slice(0, 12)} re-used: order ${orderId} vs ${dupe.orderId}`);
      throw new BadRequestException("รูปสลิปนี้เคยถูกใช้ไปแล้ว กรุณาแนบสลิปการโอนจริงของออเดอร์นี้");
    }

    const slipUrl = await this.storage.saveSlip(orderId, file.buffer, file.mimetype);

    // ManualSlipReader reads nothing today; a real reader would fill these in.
    // The annotation matters: without it the catch widens the type to
    // `SlipFacts | {}` and every field access below stops compiling.
    const facts: SlipFacts = await this.reader
      .read(file.buffer, { expected: l.due })
      .catch((e): SlipFacts => {
        this.log.warn(`slip reader failed, falling back to manual review: ${e.message}`);
        return {};
      });

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        provider: "bank_transfer",
        amount: l.due, // what this slip is for: the deposit, the balance or everything
        type: l.kind,
        status: "submitted",
        slipUrl,
        slipHash: hash,
        slipUploadedAt: new Date(),
        slipAmount: facts.amount ?? null,
        slipRef: facts.ref ?? null,
        slipTransferredAt: facts.transferredAt ?? null,
        rawPayload: { reader: this.reader.name, facts: facts as any },
      },
    });

    await this.notify.pushAdmins(
      `🧾 สลิปใหม่รอตรวจ — ${order.orderNo}`,
      `${DUE_TH[l.kind]} ฿${l.due.toLocaleString()} · กดตรวจสอบในหน้าแอดมิน`,
      `/admin?tab=payments`,
    );
    await this.notify.push({
      userId: order.userId,
      title: `ได้รับสลิปแล้ว — ${order.orderNo}`,
      body: "ทีมงานกำลังตรวจสอบ ปกติไม่เกิน 1 วันทำการ",
      link: `/orders/${orderId}`,
    });

    this.log.log(`slip submitted for ${order.orderNo} (payment ${payment.id})`);
    return { id: payment.id, status: payment.status, slipUrl: signSlipUrl(slipUrl) };
  }

  // ---------- 3. admin decides ----------
  /** the ONLY path from unpaid to paid */
  async approveSlip(adminId: string, paymentId: string, override?: { amount?: number; ref?: string; transferredAt?: Date }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            id: true, orderNo: true, userId: true, status: true, total: true, depositAmount: true,
            payments: { select: { id: true, status: true, type: true, amount: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException("ไม่พบรายการชำระเงิน");
    if (payment.status !== "submitted") throw new BadRequestException(`รายการนี้สถานะ ${payment.status} แล้ว`);
    if (CLOSED.includes(payment.order.status)) throw new BadRequestException("ออเดอร์นี้ปิดหรือถูกยกเลิกไปแล้ว");

    // what the admin typed in wins over what the reader guessed
    const ref = override?.ref ?? payment.slipRef ?? null;
    const amount = override?.amount ?? payment.slipAmount ?? null;

    // even a human approval goes through the rules — this catches the
    // "approved a duplicate at 2am" mistake
    if (ref) {
      const used = await this.prisma.payment.findFirst({
        where: { slipRef: ref, status: "paid", NOT: { id: paymentId } },
        select: { order: { select: { orderNo: true } } },
      });
      if (used) throw new BadRequestException(`เลขอ้างอิงสลิปนี้ถูกใช้กับออเดอร์ ${used.order.orderNo} ไปแล้ว`);
    }
    if (amount != null) {
      const verdict = judgeSlip(
        { amount, ref, transferredAt: override?.transferredAt ?? payment.slipTransferredAt },
        { expected: payment.amount },
      );
      if (verdict.decision === "reject") throw new BadRequestException(verdict.reason);
    }

    const order = payment.order;
    // with this slip counted: does the order now go to production?
    const after = order.payments.map(p => (p.id === paymentId ? { ...p, status: "paid" } : p));
    const starts = order.status === "pending" && upfrontCovered(order, after);
    const l = ledger({ ...order, status: starts ? "paid" : order.status }, after);
    const what = DUE_TH[(payment.type as "deposit" | "full" | "balance")] ?? "ยอด";
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: "paid",
          slipRef: ref,
          slipAmount: amount,
          slipTransferredAt: override?.transferredAt ?? payment.slipTransferredAt,
          providerRef: ref,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectReason: null,
        },
      }),
      ...(starts ? [this.prisma.order.update({ where: { id: order.id }, data: { status: "paid" } })] : []),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: starts ? "paid" : order.status,
          note: `อนุมัติสลิป${what} ฿${payment.amount.toLocaleString()}${ref ? ` (ref ${ref})` : ""}${l.outstanding ? ` · ค้างชำระ ฿${l.outstanding.toLocaleString()}` : " · ชำระครบ"}`,
          changedBy: adminId,
        },
      }),
    ]);

    await this.issueInvoice(order.id, order.total);

    await this.notify.push({
      userId: order.userId,
      title: `ยืนยันการชำระ${what}แล้ว — ${order.orderNo}`,
      body: l.outstanding
        ? `฿${payment.amount.toLocaleString()} · เริ่มผลิตแล้ว · ส่วนที่เหลือ ฿${l.outstanding.toLocaleString()} ชำระก่อนจัดส่ง`
        : `฿${payment.amount.toLocaleString()} · ชำระครบแล้ว${starts ? " · เริ่มกระบวนการผลิตแล้ว" : ""}`,
      link: `/orders/${order.id}`,
      email: true,
    });

    this.log.log(`order ${order.orderNo}: ${payment.type} ฿${payment.amount} approved by ${adminId}`);
    return { ok: true };
  }

  async rejectSlip(adminId: string, paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, orderNo: true, userId: true } } },
    });
    if (!payment) throw new NotFoundException("ไม่พบรายการชำระเงิน");
    if (payment.status !== "submitted") throw new BadRequestException(`รายการนี้สถานะ ${payment.status} แล้ว`);

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: "rejected", rejectReason: reason, reviewedBy: adminId, reviewedAt: new Date() },
    });

    // the order stays `pending`, so the customer can simply upload a better slip
    await this.notify.push({
      userId: payment.order.userId,
      title: `สลิปไม่ผ่านการตรวจสอบ — ${payment.order.orderNo}`,
      body: `${reason} — กรุณาแนบสลิปใหม่ในหน้าออเดอร์`,
      link: `/orders/${payment.order.id}`,
      email: true,
    });

    this.log.log(`slip ${paymentId} rejected by ${adminId}: ${reason}`);
    return { ok: true };
  }

  // ---------- review queue ----------
  async pendingSlips(take = 50) {
    return this.prisma.payment.findMany({
      where: { status: "submitted" },
      orderBy: { slipUploadedAt: "asc" }, // oldest first — nobody waits forever
      take,
      select: {
        id: true, amount: true, type: true, slipUrl: true, slipAmount: true, slipRef: true,
        slipUploadedAt: true, slipTransferredAt: true, rawPayload: true,
        order: { select: { id: true, orderNo: true, total: true, user: { select: { email: true, fullName: true } } } },
      },
    }).then(rows => rows.map(r => ({ ...r, slipUrl: signSlipUrl(r.slipUrl) })));
  }

  // ---------- customer polling ----------
  async paymentState(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, userId: true, status: true, total: true, depositAmount: true,
        payments: {
          orderBy: { createdAt: "desc" },
          select: { status: true, type: true, amount: true, provider: true, rejectReason: true, slipUrl: true, slipUploadedAt: true },
        },
      },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (order.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");

    const p = order.payments[0];
    const l = ledger(order, order.payments);
    return {
      orderStatus: order.status,
      paymentStatus: p?.status ?? "none",
      paymentType: p?.type ?? null,
      rejectReason: p?.rejectReason ?? null,
      slipUrl: signSlipUrl(p?.slipUrl),
      slipUploadedAt: p?.slipUploadedAt ?? null,
      due: l.due,
      kind: l.kind,
      paid: l.paid,
      outstanding: l.outstanding,
    };
  }

  // ---------- money an admin received outside the slip flow ----------
  /**
   * Cash, a cheque, a transfer that came in without a slip: recorded with its
   * amount and a note, so the books still add up. This — not a status change —
   * is how an order paid that way becomes `paid`.
   */
  async recordManual(adminId: string, orderId: string, dto: { amount: number; method: string; ref?: string; note: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, userId: true, status: true, total: true, depositAmount: true,
        payments: { select: { id: true, status: true, type: true, amount: true } },
      },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (CLOSED.includes(order.status)) throw new BadRequestException("ออเดอร์นี้ปิดหรือถูกยกเลิกไปแล้ว");
    const before = ledger(order, order.payments);
    if (before.outstanding <= 0) throw new BadRequestException("ออเดอร์นี้ชำระครบแล้ว");
    if (dto.amount > before.outstanding) {
      throw new BadRequestException(`รับเกินยอดค้าง (ค้าง ฿${before.outstanding.toLocaleString()}) — บันทึกเฉพาะยอดของออเดอร์นี้`);
    }
    const inReview = order.payments.some(p => p.status === "submitted");
    if (inReview) throw new BadRequestException("มีสลิปของลูกค้ารอตรวจอยู่ — ตรวจสลิปนั้นก่อน จะได้ไม่รับเงินซ้ำ");
    const ref = dto.ref?.trim() || null;
    if (ref) {
      const used = await this.prisma.payment.findFirst({
        where: { providerRef: ref, status: "paid" },
        select: { order: { select: { orderNo: true } } },
      });
      if (used) throw new BadRequestException(`เลขอ้างอิงนี้ถูกบันทึกกับออเดอร์ ${used.order.orderNo} ไปแล้ว`);
    }

    const type = order.status === "pending" ? (before.kind === "deposit" ? "deposit" : "full") : "balance";
    const after = [...order.payments, { id: "new", status: "paid", type, amount: dto.amount }];
    const starts = order.status === "pending" && upfrontCovered(order, after);
    const l = ledger({ ...order, status: starts ? "paid" : order.status }, after);
    const method = METHOD_TH[dto.method] ?? dto.method;

    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          orderId: order.id,
          provider: "manual",
          providerRef: ref,
          amount: dto.amount,
          type: type as any,
          status: "paid",
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rawPayload: { method: dto.method, note: dto.note },
        },
      }),
      ...(starts ? [this.prisma.order.update({ where: { id: order.id }, data: { status: "paid" } })] : []),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: starts ? "paid" : order.status,
          note: `รับเงิน ฿${dto.amount.toLocaleString()} (${method}${ref ? ` · ref ${ref}` : ""}) — ${dto.note}${l.outstanding ? ` · ค้างชำระ ฿${l.outstanding.toLocaleString()}` : " · ชำระครบ"}`,
          changedBy: adminId,
        },
      }),
    ]);

    if (starts || !l.outstanding) await this.issueInvoice(order.id, order.total);
    await this.notify.push({
      userId: order.userId,
      title: `ได้รับชำระเงินแล้ว — ${order.orderNo}`,
      body: `฿${dto.amount.toLocaleString()}${l.outstanding ? ` · ค้างชำระ ฿${l.outstanding.toLocaleString()}` : " · ชำระครบแล้ว"}${starts ? " · เริ่มกระบวนการผลิตแล้ว" : ""}`,
      link: `/orders/${order.id}`,
      email: true,
    });
    this.log.log(`order ${order.orderNo}: manual ${dto.method} ฿${dto.amount} recorded by ${adminId}`);
    return { id: payment.id, orderStatus: starts ? "paid" : order.status, ...l, message: `บันทึกรับเงิน ฿${dto.amount.toLocaleString()} แล้ว` };
  }

  // ---------- money given back ----------
  /**
   * A refund, recorded against the order with its reason. When it brings every
   * baht back and the admin says so (close), the order ends as `refunded` —
   * the only way to get there.
   */
  async recordRefund(adminId: string, orderId: string, dto: { amount: number; method: string; ref?: string; reason: string; close?: boolean }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, userId: true, status: true, total: true, depositAmount: true,
        payments: { select: { status: true, type: true, amount: true } },
        refunds: { select: { amount: true } },
      },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (["refunded", "cancelled"].includes(order.status)) throw new BadRequestException("ออเดอร์นี้ปิดไปแล้ว");
    if (order.payments.some(p => p.status === "submitted")) {
      throw new BadRequestException("มีสลิปของลูกค้ารอตรวจอยู่ — ตรวจสลิปนั้นก่อน");
    }
    const l = ledger(order, order.payments, order.refunds);
    const held = l.paid - l.refunded;
    if (held <= 0) throw new BadRequestException("ออเดอร์นี้ไม่มีเงินที่รับไว้ให้คืน");
    if (dto.amount > held) throw new BadRequestException(`คืนได้ไม่เกินที่รับไว้ ฿${held.toLocaleString()}`);
    if (dto.close && dto.amount !== held) {
      throw new BadRequestException(`ปิดออเดอร์เป็น 'คืนเงินแล้ว' ได้เมื่อคืนครบ ฿${held.toLocaleString()} เท่านั้น`);
    }
    const ref = dto.ref?.trim() || null;
    const method = { transfer: "โอนคืน", cash: "เงินสด", other: "อื่น ๆ" }[dto.method] ?? dto.method;
    const left = held - dto.amount;

    const [refund] = await this.prisma.$transaction([
      this.prisma.refund.create({
        data: { orderId: order.id, amount: dto.amount, reason: `${dto.reason} · ${method}`, providerRef: ref },
      }),
      ...(dto.close ? [this.prisma.order.update({ where: { id: order.id }, data: { status: "refunded" } })] : []),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: dto.close ? "refunded" : order.status,
          note: `คืนเงิน ฿${dto.amount.toLocaleString()} (${method}${ref ? ` · ref ${ref}` : ""}) — ${dto.reason}`,
          changedBy: adminId,
        },
      }),
    ]);

    // the invoice's value comes down with the money: a credit note (ใบลดหนี้) for it
    const cn = await issueCreditNote(this.prisma, {
      orderId: order.id, refundId: (refund as { id: string }).id, amount: dto.amount, reason: dto.reason, whole: dto.close,
    }).catch(e => { this.log.warn(`could not issue a credit note for ${order.orderNo}: ${e.message}`); return null; });

    await this.notify.push({
      userId: order.userId,
      title: `คืนเงินแล้ว — ${order.orderNo}`,
      body: `฿${dto.amount.toLocaleString()} · ${dto.reason}${cn ? ` · ใบลดหนี้ ${cn.creditNo}` : ""}`,
      link: `/orders/${order.id}`,
      email: true,
    });
    this.log.log(`order ${order.orderNo}: refund ฿${dto.amount} by ${adminId}${dto.close ? " (closed)" : ""}`);
    return {
      ok: true, held: left, orderStatus: dto.close ? "refunded" : order.status, creditNote: cn,
      message: `บันทึกคืนเงิน ฿${dto.amount.toLocaleString()} แล้ว${cn ? ` · ออกใบลดหนี้ ${cn.creditNo} (฿${cn.amount.toLocaleString()})` : ""}`,
    };
  }

  // ---------- helpers ----------
  private async mineOrThrow(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true, userId: true, status: true, total: true, depositAmount: true },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (order.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    return order;
  }

  private async ledgerOf(order: { id: string; status: string; total: number; depositAmount: number }): Promise<Ledger> {
    const payments = await this.prisma.payment.findMany({ where: { orderId: order.id }, select: { status: true, type: true, amount: true } });
    return ledger(order, payments);
  }

  private async issueInvoice(orderId: string, amount: number) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { taxInvoice: true } });
    await issueInvoice(this.prisma, orderId, amount, new Date(), readTaxInfo(o?.taxInvoice))
      .catch(e => this.log.warn(`could not issue invoice for ${orderId}: ${e.message}`));
  }

}
