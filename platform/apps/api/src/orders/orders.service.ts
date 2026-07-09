import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotifyService } from "../notify/notify.service";
import { priceOrder, priceTable } from "./pricing";
import { NEXT_STATUS as NEXT, canTransition, requiresTracking, STATUS_TH } from "./status";
import type { CreateOrderDto, PriceQueryDto, UpdateOrderStatusDto, OrderListQueryDto } from "./orders.dto";

const ORDER_SELECT = {
  id: true, orderNo: true, status: true, currency: true,
  subtotal: true, discount: true, shippingFee: true, total: true, depositAmount: true,
  fabricSummary: true, note: true, createdAt: true, updatedAt: true,
} as const;

function makeOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AX-${ymd}-${rand}`;
}

function makeInvoiceNo() {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `INV-${ym}-${rand}`;
}

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private notify: NotifyService) {}

  /** live price preview for the checkout page — no side effects */
  async quote(q: PriceQueryDto) {
    const cfg = await this.settings.pricing();
    return priceOrder({ totalQty: q.totalQty, fabric: q.fabric, trim: q.trim, reversible: q.reversible }, cfg);
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

    const p = priceOrder({ totalQty, fabric: dto.fabric, trim: dto.trim, reversible: dto.reversible }, cfg);
    const fabricSummary = `${dto.fabric} · ขลิบ:${dto.trim}${dto.reversible ? " · 2 ชิ้น (reversible)" : ""}`;

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
    const o = await this.prisma.order.findUnique({
      where: { id },
      select: {
        ...ORDER_SELECT, userId: true,
        user: { select: { id: true, email: true, fullName: true } },
        shippingAddress: true,
        items: { select: { id: true, size: true, qty: true, unitPrice: true, designId: true, roster: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        payments: { select: { id: true, provider: true, amount: true, status: true, type: true, createdAt: true } },
        shipments: true,
        invoices: { select: { id: true, invoiceNo: true, amount: true, issuedAt: true } },
      },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (!isAdmin && o.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    return o;
  }

  /** customer cancels their own order — only while nothing has been produced */
  async cancel(id: string, userId: string) {
    const o = await this.prisma.order.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (o.userId !== userId) throw new ForbiddenException("ออเดอร์นี้ไม่ใช่ของคุณ");
    if (o.status !== "pending") throw new BadRequestException("ยกเลิกได้เฉพาะออเดอร์ที่ยังไม่ชำระเงิน");
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
      { user: { email: { contains: q.q, mode: "insensitive" } } },
    ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
        select: {
          ...ORDER_SELECT,
          user: { select: { id: true, email: true, fullName: true } },
          items: { select: { size: true, qty: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total };
  }

  async adminSetStatus(id: string, adminId: string, dto: UpdateOrderStatusDto) {
    const o = await this.prisma.order.findUnique({ where: { id }, select: { id: true, status: true, orderNo: true, userId: true, total: true } });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (o.status === dto.status) throw new BadRequestException("สถานะเดิมอยู่แล้ว");
    if (!canTransition(o.status, dto.status)) {
      const allowed = NEXT[o.status] ?? [];
      throw new BadRequestException(`เปลี่ยนสถานะจาก "${o.status}" ไป "${dto.status}" ไม่ได้ (ไปได้: ${allowed.join(", ") || "ไม่มี"})`);
    }

    if (requiresTracking(dto.status) && !dto.trackingNo)
      throw new BadRequestException("กรุณากรอกเลขพัสดุก่อนเปลี่ยนเป็น 'จัดส่งแล้ว'");

    const [order] = await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status: dto.status }, select: ORDER_SELECT }),
      this.prisma.orderStatusHistory.create({ data: { orderId: id, status: dto.status, note: dto.note, changedBy: adminId } }),
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

    // paid → issue the invoice once (idempotent)
    if (dto.status === "paid") {
      const existing = await this.prisma.invoice.findFirst({ where: { orderId: id } });
      if (!existing) {
        await this.prisma.invoice.create({
          data: { orderId: id, invoiceNo: makeInvoiceNo(), amount: o.total, taxId: process.env.COMPANY_TAX_ID ?? null },
        }).catch(() => undefined);
      }
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
}
