import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotifyService } from "../notify/notify.service";
import { priceOrder, priceTable, garmentOf, GARMENT_LABEL } from "./pricing";
import { NEXT_STATUS as NEXT, canTransition, requiresTracking, STATUS_TH } from "./status";
import type { CreateOrderDto, PriceQueryDto, UpdateOrderStatusDto, OrderListQueryDto, ProductionStepDto } from "./orders.dto";
import { planStep, stepForStatus, stepName, SHIP_STEP } from "./production-steps";
import { kitLook } from "./kit-look";
import { ledger } from "../payments/ledger";
import { readTaxInfo, sellerFromEnv, type TaxParty } from "./tax-invoice";
import { ErpSyncService } from "../erp/erp-sync.service";

const ORDER_SELECT = {
  id: true, orderNo: true, status: true, currency: true,
  subtotal: true, discount: true, shippingFee: true, total: true, depositAmount: true,
  fabricSummary: true, note: true, productionStep: true, createdAt: true, updatedAt: true,
} as const;

function makeOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AX-${ymd}-${rand}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private notify: NotifyService,
    private erp?: ErpSyncService,
  ) {}

  /** live price preview for the checkout page — no side effects */
  async quote(q: PriceQueryDto) {
    const cfg = await this.settings.pricing();
    return priceOrder({ totalQty: q.totalQty, fabric: q.fabric, trim: q.trim, reversible: q.reversible, garment: q.garment }, cfg);
  }

  async table() {
    return priceTable(await this.settings.pricing());
  }

  // ---------- create ----------
  async create(userId: string, dto: CreateOrderDto) {
    const cfg = await this.settings.pricing();
    const lines = dto.lines.filter(l => l.qty > 0);
    if (lines.length === 0) throw new BadRequestException("กรุณาระบุจำนวนอย่างน้อย 1 ไซส์");
    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    if (totalQty < cfg.minQty) throw new BadRequestException(`สั่งขั้นต่ำ ${cfg.minQty} ตัว`);

    // the address must belong to this user
    const addr = await this.prisma.address.findFirst({ where: { id: dto.shippingAddressId, userId } });
    if (!addr) throw new BadRequestException("ไม่พบที่อยู่จัดส่ง หรือไม่ใช่ที่อยู่ของคุณ");

    // if a saved design is referenced it must belong to this user; snapshot it
    let snapshot: unknown = dto.designSnapshot ?? {};
    if (dto.designId) {
      const d = await this.prisma.design.findFirst({ where: { id: dto.designId, userId } });
      if (!d) throw new BadRequestException("ไม่พบดีไซน์ หรือไม่ใช่ของคุณ");
      snapshot = dto.designSnapshot ?? d.stateJson;
    }

    // the garment is read from the design itself, never taken from the request
    const garment = garmentOf(snapshot);
    const p = priceOrder({ totalQty, fabric: dto.fabric, trim: dto.trim, reversible: dto.reversible, garment }, cfg);
    const fabricSummary = `${garment !== "jersey" ? `${GARMENT_LABEL[garment]} · ` : ""}${dto.fabric} · ขลิบ:${dto.trim}${dto.reversible ? " · 2 ชิ้น (reversible)" : ""}`;

    // prices are frozen into the order; later price changes never affect it
    const order = await this.prisma.order.create({
      data: {
        orderNo: makeOrderNo(),
        userId,
        status: "pending",
        subtotal: p.subtotal,
        shippingFee: p.shippingFee,
        total: p.total,
        depositAmount: p.depositAmount,
        fabricSummary,
        note: dto.note,
        shippingAddressId: addr.id,
        items: {
          create: lines.map(l => ({
            designId: dto.designId,
            designSnapshot: snapshot as any,
            size: l.size,
            qty: l.qty,
            unitPrice: p.unitPrice,
          })),
        },
        statusHistory: { create: { status: "pending", note: "สร้างออเดอร์", changedBy: userId } },
      },
      select: { ...ORDER_SELECT, items: { select: { id: true, size: true } } },
    });

    // attach roster rows (player name/number) to the matching size line
    if (dto.roster?.length) {
      const bySize = new Map(order.items.map(i => [i.size, i.id]));
      const rows = dto.roster
        .filter(r => bySize.has(r.size))
        .map(r => ({ orderItemId: bySize.get(r.size)!, playerName: r.playerName, number: r.number, size: r.size, qty: r.qty }));
      if (rows.length) await this.prisma.orderRoster.createMany({ data: rows });
    }

    await this.notify.pushAdmins(
      `ออเดอร์ใหม่ ${order.orderNo}`,
      `${totalQty} ตัว · ${fabricSummary} · ฿${p.total.toLocaleString()}`,
      `/orders/${order.id}`,
    );

    return { ...order, items: undefined, breakdown: p, message: `สร้างออเดอร์ ${order.orderNo} แล้ว` };
  }

  // ---------- read ----------
  async myOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId }, orderBy: { createdAt: "desc" },
      select: { ...ORDER_SELECT, _count: { select: { items: true } } },
    });
  }

  async getOne(id: string, userId: string, isAdmin = false) {
    let o = await this.findOne(id, isAdmin);
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (!isAdmin && o.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    // production tracking lives in the ERP: refresh an old copy before showing it
    if (this.erp && (await this.erp.refreshIfStale(o))) o = (await this.findOne(id, isAdmin)) ?? o;
    // what has been paid and what is due now (deposit, then the balance)
    const { taxInvoice, erpOrderNo, erpStatus, erpSyncedAt, ...rest } = o;
    return {
      ...rest,
      balance: ledger(o, o.payments, o.refunds),
      taxInfo: readTaxInfo(taxInvoice),
      // the company's own details for printing a tax invoice (null until set in .env)
      seller: sellerFromEnv(),
      // the ERP's steps and dates; its order number is for the team only
      erp: erpStatus ? { ...(erpStatus as object), syncedAt: erpSyncedAt, ...(isAdmin ? { orderNo: erpOrderNo } : {}) } : isAdmin && erpOrderNo ? { orderNo: erpOrderNo } : null,
    };
  }

  private findOne(id: string, isAdmin: boolean) {
    return this.prisma.order.findUnique({
      where: { id },
      select: {
        ...ORDER_SELECT, userId: true,
        user: { select: { id: true, email: true, fullName: true } },
        shippingAddress: true,
        // the frozen design is for the production board; customers see the preview
        items: { select: { id: true, size: true, qty: true, unitPrice: true, designId: true, roster: true, designSnapshot: isAdmin } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        payments: { select: { id: true, provider: true, amount: true, status: true, type: true, createdAt: true } },
        refunds: { select: { id: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        shipments: true,
        invoices: {
          select: { id: true, invoiceNo: true, amount: true, issuedAt: true, buyerName: true, buyerTaxId: true, buyerBranch: true, buyerAddress: true },
        },
        creditNotes: {
          select: { id: true, creditNo: true, invoiceId: true, amount: true, reason: true, issuedAt: true, buyerName: true, buyerTaxId: true, buyerBranch: true, buyerAddress: true },
          orderBy: { creditNo: "asc" },
        },
        taxInvoice: true,
        erpOrderNo: true, erpStatus: true, erpSyncedAt: true,
      },
    });
  }

  /**
   * The customer's details for a full tax invoice. Once a tax invoice has been
   * issued with them it can't change (a correction needs a credit note).
   */
  async setTaxInvoice(id: string, userId: string, dto: TaxParty, isAdmin = false) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, invoices: { select: { id: true, buyerTaxId: true } } },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (!isAdmin && o.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    if (o.status === "cancelled") throw new BadRequestException("ออเดอร์นี้ถูกยกเลิกแล้ว");
    const inv = o.invoices[0];
    if (inv?.buyerTaxId) throw new BadRequestException("ออกใบกำกับภาษีด้วยข้อมูลนี้ไปแล้ว แก้ไขไม่ได้ — กรุณาติดต่อทีมงาน");
    const info: TaxParty = { name: dto.name, taxId: dto.taxId, branch: dto.branch, address: dto.address };
    await this.prisma.order.update({ where: { id }, data: { taxInvoice: JSON.stringify(info) } });
    // already invoiced without a buyer: this turns that invoice into the full tax invoice
    if (inv) {
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { buyerName: info.name, buyerTaxId: info.taxId, buyerBranch: info.branch, buyerAddress: info.address },
      });
    }
    return { taxInfo: info, attached: Boolean(inv), message: inv ? "ออกใบกำกับภาษีแล้ว" : "บันทึกข้อมูลแล้ว — จะออกใบกำกับภาษีเมื่อชำระเงิน" };
  }

  /** customer cancels their own order — only while nothing has been produced */
  async cancel(id: string, userId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, payments: { where: { status: { in: ["paid", "submitted"] } }, select: { id: true } } },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (o.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    if (o.status !== "pending") throw new BadRequestException("ยกเลิกได้เฉพาะออเดอร์ที่ยังไม่ชำระเงิน");
    // money already in (or a slip waiting) needs a person: a refund isn't a button
    if (o.payments.length) throw new BadRequestException("ออเดอร์นี้มีการชำระเงินแล้วบางส่วน หรือมีสลิปรอตรวจ — กรุณาติดต่อทีมงานเพื่อยกเลิก");
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status: "cancelled" } }),
      this.prisma.orderStatusHistory.create({ data: { orderId: id, status: "cancelled", note: "ลูกค้ายกเลิก", changedBy: userId } }),
    ]);
    return { message: "ยกเลิกออเดอร์แล้ว" };
  }

  // ---------- admin ----------
  async adminList(q: OrderListQueryDto) {
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.q) where.OR = [
      { orderNo: { contains: q.q, mode: "insensitive" } },
      { erpOrderNo: { contains: q.q, mode: "insensitive" } },
      { user: { email: { contains: q.q, mode: "insensitive" } } },
    ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
        select: {
          ...ORDER_SELECT,
          erpOrderNo: true, erpSyncedAt: true,
          user: { select: { id: true, email: true, fullName: true } },
          items: { select: { size: true, qty: true } },
          payments: { select: { status: true, type: true, amount: true } },
          refunds: { select: { amount: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    // a small look summary per order (kit, colours, pattern, number) so the
    // production board can draw each shirt without loading full snapshots
    const snaps = items.length
      ? await this.prisma.orderItem.findMany({
          where: { orderId: { in: items.map(o => o.id) } },
          distinct: ["orderId"],
          select: { orderId: true, designSnapshot: true },
        })
      : [];
    const look = new Map(snaps.map(s => [s.orderId, kitLook(s.designSnapshot)]));
    return {
      items: items.map(({ payments, refunds, ...o }) => ({ ...o, balance: ledger(o, payments, refunds), look: look.get(o.id) ?? null })),
      total,
    };
  }

  async adminSetStatus(id: string, adminId: string, dto: UpdateOrderStatusDto) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true, status: true, orderNo: true, userId: true, total: true, depositAmount: true, productionStep: true,
        payments: { select: { status: true, type: true, amount: true } },
        refunds: { select: { amount: true } },
      },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (o.status === dto.status) throw new BadRequestException("สถานะเดิมอยู่แล้ว");
    // an order becomes paid only with the money on record: an approved slip, or a
    // payment recorded with its amount (POST /admin/orders/:id/payments)
    if (dto.status === "paid") {
      throw new BadRequestException("เปลี่ยนเป็น 'ชำระแล้ว' ด้วยการตรวจสลิป หรือปุ่ม 'บันทึกรับเงิน' (ใส่ยอดเงิน) — ไม่ใช่การเปลี่ยนสถานะเฉย ๆ");
    }
    // "คืนเงินแล้ว" is reached by recording the refund (with its amount), not by a label
    if (dto.status === "refunded") {
      throw new BadRequestException("ใช้ปุ่ม 'คืนเงิน' (ใส่ยอดที่คืน) — ระบบจะปิดออเดอร์เป็น 'คืนเงินแล้ว' เมื่อคืนครบ");
    }
    // a cancelled order holding the customer's money is a debt nobody tracks
    if (dto.status === "cancelled") {
      const l = ledger(o, o.payments, o.refunds);
      if (l.paid - l.refunded > 0) {
        throw new BadRequestException(`ออเดอร์นี้รับเงินไว้ ฿${(l.paid - l.refunded).toLocaleString()} — คืนเงินด้วยปุ่ม 'คืนเงิน' (ปิดออเดอร์ได้ในขั้นนั้น)`);
      }
    }
    // nothing leaves the factory with money still owed
    if (dto.status === "shipped") {
      const l = ledger(o, o.payments);
      if (l.outstanding > 0) throw new BadRequestException(`ยังค้างชำระ ฿${l.outstanding.toLocaleString()} — รับเงินให้ครบก่อนจัดส่ง`);
    }
    if (!canTransition(o.status, dto.status)) {
      const allowed = NEXT[o.status] ?? [];
      throw new BadRequestException(`เปลี่ยนสถานะจาก "${o.status}" ไป "${dto.status}" ไม่ได้ (ไปได้: ${allowed.join(", ") || "ไม่มี"})`);
    }

    if (requiresTracking(dto.status) && !dto.trackingNo)
      throw new BadRequestException("กรุณากรอกเลขพัสดุก่อนเปลี่ยนเป็น 'จัดส่งแล้ว'");

    // starting production puts the job on step 1; shipping is the last step
    const step = stepForStatus(dto.status, o.productionStep);
    const [order] = await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status: dto.status, productionStep: step }, select: ORDER_SELECT }),
      this.prisma.orderStatusHistory.create({
        data: { orderId: id, status: dto.status, step: step !== o.productionStep ? step : undefined, note: dto.note, changedBy: adminId },
      }),
    ]);

    // keep the shipment record in step with the order status
    if (dto.status === "shipped") {
      await this.prisma.shipment.create({
        data: { orderId: id, courier: dto.courier, trackingNo: dto.trackingNo, status: "shipped", shippedAt: new Date() },
      });
    } else if (dto.status === "delivered") {
      const s = await this.prisma.shipment.findFirst({ where: { orderId: id }, orderBy: { createdAt: "desc" } });
      if (s) await this.prisma.shipment.update({ where: { id: s.id }, data: { status: "delivered", deliveredAt: new Date() } });
    }

    // tell the customer
    const label = STATUS_TH[dto.status] ?? dto.status;
    await this.notify.push({
      userId: o.userId,
      title: `ออเดอร์ ${o.orderNo}: ${label}`,
      body: dto.status === "shipped" && dto.trackingNo
        ? `เลขพัสดุ ${dto.trackingNo}${dto.courier ? ` (${dto.courier})` : ""}`
        : dto.note || undefined,
      link: `/orders/${id}`,
      email: true,
    });

    return { ...order, message: `อัปเดต ${o.orderNo} เป็น ${dto.status}` };
  }

  /**
   * Move an order along the production line (steps 1–9). The first step also
   * starts production. The customer gets an in-app note at each step; the
   * emails stay for the status changes that matter (paid, shipped…).
   */
  async adminSetStep(id: string, adminId: string, dto: ProductionStepDto) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, orderNo: true, userId: true, productionStep: true },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    const plan = planStep(o.status, o.productionStep, dto.step);
    if (!plan.ok) throw new BadRequestException(plan.error);

    const [order] = await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status: plan.status, productionStep: plan.step }, select: ORDER_SELECT }),
      this.prisma.orderStatusHistory.create({
        data: { orderId: id, status: plan.status, step: plan.step, note: dto.note, changedBy: adminId },
      }),
    ]);

    await this.notify.push({
      userId: o.userId,
      title: `ออเดอร์ ${o.orderNo}: ขั้นที่ ${plan.step}/${SHIP_STEP} · ${stepName(plan.step)}`,
      body: dto.note || undefined,
      link: `/orders/${id}`,
    });

    return { ...order, message: `${o.orderNo} → ขั้น ${plan.step} · ${stepName(plan.step)}` };
  }
}
