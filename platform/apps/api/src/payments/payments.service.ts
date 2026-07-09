import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { NotifyService } from "../notify/notify.service";
import { StripeService } from "./stripe.service";
import { bahtToSatang, verifyPaidAmount, MIN_CHARGE_BAHT } from "./money";

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

@Injectable()
export class PaymentsService {
  private readonly log = new Logger("Payments");

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private notify: NotifyService,
  ) {}

  status() {
    return { enabled: this.stripe.enabled, livemode: this.stripe.enabled && this.stripe.livemode };
  }

  // ---------- 1. customer starts a payment ----------
  async createCheckout(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, userId: true, status: true, total: true, fabricSummary: true,
        user: { select: { email: true } },
        items: { select: { size: true, qty: true } },
      },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (order.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    if (order.status !== "pending") throw new BadRequestException("ออเดอร์นี้ชำระเงินแล้ว หรือถูกยกเลิกไปแล้ว");
    if (order.total < MIN_CHARGE_BAHT) throw new BadRequestException(`ยอดขั้นต่ำในการชำระเงินคือ ฿${MIN_CHARGE_BAHT}`);

    const qty = order.items.reduce((s, i) => s + i.qty, 0);

    const session = await this.stripe.stripe.checkout.sessions.create(
      {
        mode: "payment",
        // cards for everyone, PromptPay QR for Thai customers
        payment_method_types: ["card", "promptpay"],
        customer_email: order.user.email,
        client_reference_id: order.id,
        // the webhook trusts THIS, not the query string on the return URL
        metadata: { orderId: order.id, orderNo: order.orderNo },
        payment_intent_data: { metadata: { orderId: order.id, orderNo: order.orderNo } },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "thb",
              // Stripe wants satang; our DB stores whole baht
              unit_amount: bahtToSatang(order.total),
              product_data: {
                name: `เสื้อกีฬาสั่งผลิต ${qty} ตัว · ${order.orderNo}`,
                description: order.fabricSummary ?? undefined,
              },
            },
          },
        ],
        success_url: `${SITE()}/orders/${order.id}?paid=1`,
        cancel_url: `${SITE()}/orders/${order.id}?canceled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 นาที
      },
      // safe to retry: the same order never creates two sessions in one minute
      { idempotencyKey: `order-${order.id}-${Math.floor(Date.now() / 60_000)}` },
    );

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "stripe",
        providerRef: session.id,
        amount: order.total,
        type: "full",
        status: "pending",
      },
    }).catch(e => this.log.warn(`could not record pending payment: ${e.message}`));

    return { url: session.url, sessionId: session.id, amount: order.total };
  }

  // ---------- 2. Stripe tells us what happened ----------
  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await this.fulfil(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        await this.markFailed(event.data.object as Stripe.Checkout.Session, event.type);
        break;
      default:
        this.log.debug(`ignoring ${event.type}`);
    }
    return { received: true };
  }

  /** the only place an order becomes `paid` through Stripe */
  private async fulfil(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.orderId ?? session.client_reference_id ?? undefined;
    if (!orderId) {
      this.log.error(`session ${session.id} has no orderId — cannot fulfil`);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNo: true, userId: true, status: true, total: true },
    });
    if (!order) {
      this.log.error(`session ${session.id} references unknown order ${orderId}`);
      return;
    }

    // idempotent: Stripe retries webhooks, and `completed` + `async_payment_succeeded`
    // can both arrive for a PromptPay payment
    if (order.status !== "pending") {
      this.log.log(`order ${order.orderNo} already ${order.status} — ignoring ${session.id}`);
      return;
    }

    // A valid signature proves the event came from Stripe — NOT that the
    // customer paid the right amount in the right currency. Check the money.
    const money = verifyPaidAmount(session, order.total);
    if (!money.ok) {
      this.log.error(`REFUSING to fulfil ${order.orderNo}: ${money.reason}`);
      await this.prisma.payment.updateMany({
        where: { orderId: order.id, providerRef: session.id },
        data: { status: "failed", rawPayload: { reason: money.reason } as any },
      });
      await this.notify.pushAdmins(
        `⚠ ชำระเงินไม่ตรงยอด: ${order.orderNo}`,
        `${money.reason} — ตรวจสอบใน Stripe Dashboard ก่อนดำเนินการ`,
        `/orders/${order.id}`,
      );
      return;
    }

    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { status: "paid" } }),
      this.prisma.orderStatusHistory.create({
        data: { orderId: order.id, status: "paid", note: `ชำระผ่าน Stripe (${paymentIntentId ?? session.id})` },
      }),
      // PaymentStatus enum: pending | paid | failed | refunded
      this.prisma.payment.updateMany({
        where: { orderId: order.id, providerRef: session.id },
        data: { status: "paid", providerRef: paymentIntentId ?? session.id, rawPayload: { sessionId: session.id } as any },
      }),
    ]);

    // invoice, once
    const existing = await this.prisma.invoice.findFirst({ where: { orderId: order.id } });
    if (!existing) {
      const d = new Date();
      const invoiceNo = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      await this.prisma.invoice.create({
        data: { orderId: order.id, invoiceNo, amount: order.total, taxId: process.env.COMPANY_TAX_ID ?? null },
      }).catch(() => undefined);
    }

    await this.notify.push({
      userId: order.userId,
      title: `ชำระเงินสำเร็จ — ${order.orderNo}`,
      body: `฿${order.total.toLocaleString()} · เริ่มกระบวนการผลิตแล้ว`,
      link: `/orders/${order.id}`,
      email: true,
    });
    await this.notify.pushAdmins(`💰 รับชำระเงิน ${order.orderNo}`, `฿${order.total.toLocaleString()}`, `/orders/${order.id}`);

    this.log.log(`order ${order.orderNo} paid ฿${order.total}`);
  }

  private async markFailed(session: Stripe.Checkout.Session, reason: string) {
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (!orderId) return;
    await this.prisma.payment.updateMany({
      where: { orderId, providerRef: session.id, status: "pending" },
      data: { status: "failed", rawPayload: { reason } as any },
    });
    this.log.log(`payment for order ${orderId} ${reason}`);
  }

  /** the return page polls this — the webhook may land a second later */
  async paymentState(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, provider: true } } },
    });
    if (!order) throw new NotFoundException("ไม่พบออเดอร์");
    if (order.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    return { orderStatus: order.status, paymentStatus: order.payments[0]?.status ?? "none" };
  }
}
