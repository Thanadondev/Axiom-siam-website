import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotifyService } from "../notify/notify.service";
import { SettingsService } from "../settings/settings.service";
import { StorageService } from "./storage.service";
import { buildPromptPayPayload } from "./promptpay";
import { judgeSlip, ManualSlipReader, type SlipReader, type SlipFacts } from "./slip-policy";
import { MIN_CHARGE_BAHT } from "./money";

/**
 * Money by Thai bank transfer.
 *
 * The flow, and where trust lives:
 *   1. customer opens the order      -> we show a PromptPay QR + account number
 *   2. customer transfers, uploads a slip -> Payment(status=submitted). NOT paid.
 *   3. an admin looks at the slip    -> approve => order.paid, or reject with a reason
 *
 * An uploaded slip is a *claim*, never proof. Only step 3 moves an order to
 * `paid`, and only `approveSlip` may do it.
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

    if (!bank.enabled) throw new BadRequestException("ยังไม่เปิดรับชำระเงิน กรุณาติดต่อทีมงาน");
    if (order.status !== "pending") throw new BadRequestException("ออเดอร์นี้ชำระเงินแล้ว หรือถูกยกเลิกไปแล้ว");
    if (order.total < MIN_CHARGE_BAHT) throw new BadRequestException(`ยอดขั้นต่ำในการชำระเงินคือ ฿${MIN_CHARGE_BAHT}`);

    // a bad PromptPay id must not take the whole page down — the account
    // number below is enough to pay us
    let qr: string | null = null;
    if (bank.promptpayId) {
      try {
        qr = buildPromptPayPayload({ target: bank.promptpayId, type: bank.promptpayType, amount: order.total });
      } catch (e: any) {
        this.log.error(`PromptPay id ตั้งค่าไว้ไม่ถูกต้อง (${bank.promptpayId}): ${e.message}`);
      }
    }

    return {
      amount: order.total,
      orderNo: order.orderNo,
      qrPayload: qr,
      bank: { bankName: bank.bankName, accountNo: bank.accountNo, accountName: bank.accountName, note: bank.note },
    };
  }

  // ---------- 2. customer uploads a slip ----------
  async submitSlip(userId: string, orderId: string, file: { buffer: Buffer; mimetype: string; size: number }) {
    const order = await this.mineOrThrow(userId, orderId);
    if (order.status !== "pending") throw new BadRequestException("ออเดอร์นี้ชำระเงินแล้ว หรือถูกยกเลิกไปแล้ว");

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
      .read(file.buffer, { expected: order.total })
      .catch((e): SlipFacts => {
        this.log.warn(`slip reader failed, falling back to manual review: ${e.message}`);
        return {};
      });

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        provider: "bank_transfer",
        amount: order.total,
        type: "full",
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
      `฿${order.total.toLocaleString()} · กดตรวจสอบในหน้าแอดมิน`,
      `/admin?tab=payments`,
    );
    await this.notify.push({
      userId: order.userId,
      title: `ได้รับสลิปแล้ว — ${order.orderNo}`,
      body: "ทีมงานกำลังตรวจสอบ ปกติไม่เกิน 1 วันทำการ",
      link: `/orders/${orderId}`,
    });

    this.log.log(`slip submitted for ${order.orderNo} (payment ${payment.id})`);
    return { id: payment.id, status: payment.status, slipUrl };
  }

  // ---------- 3. admin decides ----------
  /** the ONLY path from unpaid to paid */
  async approveSlip(adminId: string, paymentId: string, override?: { amount?: number; ref?: string; transferredAt?: Date }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, orderNo: true, userId: true, status: true, total: true } } },
    });
    if (!payment) throw new NotFoundException("ไม่พบรายการชำระเงิน");
    if (payment.status !== "submitted") throw new BadRequestException(`รายการนี้สถานะ ${payment.status} แล้ว`);
    if (payment.order.status !== "pending") throw new BadRequestException("ออเดอร์นี้ชำระเงินแล้ว หรือถูกยกเลิกไปแล้ว");

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
        { expected: payment.order.total },
      );
      if (verdict.decision === "reject") throw new BadRequestException(verdict.reason);
    }

    const order = payment.order;
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
      this.prisma.order.update({ where: { id: order.id }, data: { status: "paid" } }),
      this.prisma.orderStatusHistory.create({
        data: { orderId: order.id, status: "paid", note: `อนุมัติสลิปโอนเงิน${ref ? ` (ref ${ref})` : ""}` },
      }),
    ]);

    await this.issueInvoice(order.id, order.total);

    await this.notify.push({
      userId: order.userId,
      title: `ยืนยันการชำระเงินแล้ว — ${order.orderNo}`,
      body: `฿${order.total.toLocaleString()} · เริ่มกระบวนการผลิตแล้ว`,
      link: `/orders/${order.id}`,
      email: true,
    });

    this.log.log(`order ${order.orderNo} paid ฿${order.total} (approved by ${adminId})`);
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
        id: true, amount: true, slipUrl: true, slipAmount: true, slipRef: true,
        slipUploadedAt: true, slipTransferredAt: true, rawPayload: true,
        order: { select: { id: true, orderNo: true, total: true, user: { select: { email: true, fullName: true } } } },
      },
    });
  }

  // ---------- customer polling ----------
  async paymentState(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, userId: true, status: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, provider: true, rejectReason: true, slipUrl: true, slipUploadedAt: true },
        },
      },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (order.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");

    const p = order.payments[0];
    return {
      orderStatus: order.status,
      paymentStatus: p?.status ?? "none",
      rejectReason: p?.rejectReason ?? null,
      slipUrl: p?.slipUrl ?? null,
      slipUploadedAt: p?.slipUploadedAt ?? null,
    };
  }

  // ---------- helpers ----------
  private async mineOrThrow(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true, userId: true, status: true, total: true },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (order.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    return order;
  }

  private async issueInvoice(orderId: string, amount: number) {
    const existing = await this.prisma.invoice.findFirst({ where: { orderId } });
    if (existing) return;
    const d = new Date();
    const invoiceNo = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await this.prisma.invoice
      .create({ data: { orderId, invoiceNo, amount, taxId: process.env.COMPANY_TAX_ID ?? null } })
      .catch(e => this.log.warn(`could not issue invoice for ${orderId}: ${e.message}`));
  }
}
