import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toCsv } from "../common/csv";
import type {
  ListQueryDto, UpdateUserDto, AdminTemplateDto, UpdateReportDto, CreatePayoutDto, UpdateQuoteDto,
} from "./admin.dto";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ---------- dashboard ----------
  async stats() {
    const [
      users, newUsers7, newUsers30, suspended,
      templates, published,
      salesAgg, openReports, newQuotes, pendingOrders,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: daysAgo(7) } } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: daysAgo(30) } } }),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.marketTemplate.count({ where: { deletedAt: null } }),
      this.prisma.marketTemplate.count({ where: { deletedAt: null, status: "published" } }),
      this.prisma.templatePurchase.aggregate({
        where: { status: "paid" },
        _sum: { price: true, platformFee: true, designerEarning: true },
        _count: true,
      }),
      this.prisma.templateReport.count({ where: { status: "open" } }),
      this.prisma.quoteRequest.count({ where: { status: "new" } }),
      this.prisma.order.count({ where: { status: "pending" } }),
    ]);

    // designer earnings still owed (not paid out, not frozen)
    const unpaidAgg = await this.prisma.templatePurchase.aggregate({
      where: { status: "paid", paidOut: false, template: { earningsFrozen: false } },
      _sum: { designerEarning: true },
    });

    return {
      users: { total: users, new7: newUsers7, new30: newUsers30, suspended },
      templates: { total: templates, published },
      sales: {
        count: salesAgg._count,
        gross: salesAgg._sum.price ?? 0,
        platformRevenue: salesAgg._sum.platformFee ?? 0,
        designerEarnings: salesAgg._sum.designerEarning ?? 0,
        unpaidToDesigners: unpaidAgg._sum.designerEarning ?? 0,
      },
      queue: { openReports, newQuotes, pendingOrders },
    };
  }

  /** daily sales for the last N days (for the chart) */
  async salesSeries(days = 30) {
    const from = daysAgo(days);
    const rows = await this.prisma.templatePurchase.findMany({
      where: { status: "paid", createdAt: { gte: from } },
      select: { createdAt: true, price: true, platformFee: true },
      orderBy: { createdAt: "asc" },
    });
    const map = new Map<string, { date: string; sales: number; gross: number; revenue: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i).toISOString().slice(0, 10);
      map.set(d, { date: d, sales: 0, gross: 0, revenue: 0 });
    }
    for (const r of rows) {
      const d = r.createdAt.toISOString().slice(0, 10);
      const e = map.get(d);
      if (e) { e.sales++; e.gross += r.price; e.revenue += r.platformFee; }
    }
    return [...map.values()];
  }

  async topDesigners(take = 5) {
    const rows = await this.prisma.templatePurchase.findMany({
      where: { status: "paid" },
      select: { designerEarning: true, template: { select: { designer: { select: { id: true, fullName: true, email: true } } } } },
    });
    const by = new Map<string, { id: string; name: string; email: string; sales: number; earnings: number }>();
    for (const r of rows) {
      const d = r.template.designer;
      const e = by.get(d.id) ?? { id: d.id, name: d.fullName ?? "-", email: d.email, sales: 0, earnings: 0 };
      e.sales++; e.earnings += r.designerEarning;
      by.set(d.id, e);
    }
    return [...by.values()].sort((a, b) => b.earnings - a.earnings).slice(0, take);
  }

  /** best-selling templates by revenue */
  async topTemplates(take = 5) {
    const rows = await this.prisma.templatePurchase.findMany({
      where: { status: "paid" },
      select: { price: true, template: { select: { id: true, name: true, previewUrl: true, category: true } } },
    });
    const by = new Map<string, { id: string; name: string; previewUrl: string | null; category: string | null; sales: number; gross: number }>();
    for (const r of rows) {
      const t = r.template;
      const e = by.get(t.id) ?? { id: t.id, name: t.name, previewUrl: t.previewUrl, category: t.category, sales: 0, gross: 0 };
      e.sales++; e.gross += r.price;
      by.set(t.id, e);
    }
    return [...by.values()].sort((a, b) => b.gross - a.gross).slice(0, take);
  }

  /** which sport/category actually sells */
  async topCategories() {
    const rows = await this.prisma.templatePurchase.findMany({
      where: { status: "paid" },
      select: { price: true, template: { select: { category: true } } },
    });
    const by = new Map<string, { category: string; sales: number; gross: number }>();
    for (const r of rows) {
      const c = r.template.category ?? "ไม่ระบุ";
      const e = by.get(c) ?? { category: c, sales: 0, gross: 0 };
      e.sales++; e.gross += r.price;
      by.set(c, e);
    }
    return [...by.values()].sort((a, b) => b.gross - a.gross);
  }

  // ---------- users ----------
  async listUsers(q: ListQueryDto) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.role) where.role = q.role;
    if (q.status === "suspended") where.suspendedAt = { not: null };
    if (q.q) where.OR = [
      { email: { contains: q.q, mode: "insensitive" } },
      { fullName: { contains: q.q, mode: "insensitive" } },
      { companyName: { contains: q.q, mode: "insensitive" } },
    ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
        select: {
          id: true, email: true, fullName: true, companyName: true, role: true, isVerified: true,
          suspendedAt: true, createdAt: true,
          _count: { select: { designs: true, orders: true, marketTemplates: true, templatePurchases: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getUser(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, fullName: true, phone: true, companyName: true, role: true,
        isVerified: true, suspendedAt: true, suspendReason: true, createdAt: true,
        marketTemplates: { where: { deletedAt: null }, select: { id: true, name: true, status: true, price: true, salesCount: true, takedownAt: true } },
        templatePurchases: { select: { id: true, price: true, createdAt: true, template: { select: { name: true } } } },
        termsAcceptances: { orderBy: { acceptedAt: "desc" }, take: 20 },
        _count: { select: { designs: true, orders: true } },
      },
    });
    if (!u) throw new NotFoundException("ไม่พบผู้ใช้");
    const earn = await this.prisma.templatePurchase.aggregate({
      where: { status: "paid", template: { designerId: id } },
      _sum: { designerEarning: true }, _count: true,
    });
    const unpaid = await this.prisma.templatePurchase.aggregate({
      where: { status: "paid", paidOut: false, template: { designerId: id, earningsFrozen: false } },
      _sum: { designerEarning: true },
    });
    return { ...u, earnings: { total: earn._sum.designerEarning ?? 0, sales: earn._count, unpaid: unpaid._sum.designerEarning ?? 0 } };
  }

  async updateUser(adminId: string, id: string, dto: UpdateUserDto) {
    if (id === adminId && (dto.role !== undefined || dto.suspended))
      throw new BadRequestException("เปลี่ยนสิทธิ์/ระงับบัญชีตัวเองไม่ได้");
    const data: Record<string, unknown> = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.suspended !== undefined) {
      data.suspendedAt = dto.suspended ? new Date() : null;
      data.suspendReason = dto.suspended ? (dto.suspendReason ?? null) : null;
    }
    const u = await this.prisma.user.update({
      where: { id }, data,
      select: { id: true, email: true, role: true, suspendedAt: true, suspendReason: true },
    });
    return u;
  }

  // ---------- templates / moderation ----------
  async listTemplates(q: ListQueryDto) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status === "takendown") where.takedownAt = { not: null };
    else if (q.status) where.status = q.status;
    if (q.q) where.OR = [
      { name: { contains: q.q, mode: "insensitive" } },
      { designer: { email: { contains: q.q, mode: "insensitive" } } },
    ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.marketTemplate.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
        select: {
          id: true, name: true, category: true, price: true, status: true, salesCount: true,
          previewUrl: true, featured: true, takedownAt: true, takedownReason: true, earningsFrozen: true, createdAt: true,
          designer: { select: { id: true, fullName: true, email: true } },
          _count: { select: { reports: true } },
        },
      }),
      this.prisma.marketTemplate.count({ where }),
    ]);
    return { items, total };
  }

  async updateTemplate(id: string, dto: AdminTemplateDto) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.featured !== undefined) data.featured = dto.featured;
    if (dto.earningsFrozen !== undefined) data.earningsFrozen = dto.earningsFrozen;
    if (dto.takedown !== undefined) {
      if (dto.takedown) {
        // remove from sale + withhold earnings (per terms 4.4)
        data.takedownAt = new Date();
        data.takedownReason = dto.takedownReason ?? null;
        data.status = "unlisted";
        if (dto.earningsFrozen === undefined) data.earningsFrozen = true;
      } else {
        data.takedownAt = null;
        data.takedownReason = null;
        if (dto.earningsFrozen === undefined) data.earningsFrozen = false;
      }
    }
    return this.prisma.marketTemplate.update({
      where: { id }, data,
      select: { id: true, name: true, status: true, featured: true, takedownAt: true, takedownReason: true, earningsFrozen: true },
    });
  }

  // ---------- reports queue ----------
  async listReports(q: ListQueryDto) {
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.templateReport.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
        select: {
          id: true, reason: true, detail: true, status: true, adminNote: true, createdAt: true, resolvedAt: true,
          reporter: { select: { id: true, email: true } },
          template: {
            select: {
              id: true, name: true, previewUrl: true, status: true, takedownAt: true, salesCount: true,
              designer: { select: { id: true, email: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.templateReport.count({ where }),
    ]);
    return { items, total };
  }

  async updateReport(id: string, dto: UpdateReportDto) {
    const r = await this.prisma.templateReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("ไม่พบรายงาน");
    const done = dto.status === "actioned" || dto.status === "dismissed";
    return this.prisma.templateReport.update({
      where: { id },
      data: { status: dto.status, adminNote: dto.adminNote, resolvedAt: done ? new Date() : null },
      select: { id: true, status: true, adminNote: true, resolvedAt: true },
    });
  }

  // ---------- payouts ----------
  /** designers with money owed (unpaid, non-frozen earnings) */
  async pendingPayouts() {
    const rows = await this.prisma.templatePurchase.findMany({
      where: { status: "paid", paidOut: false, template: { earningsFrozen: false } },
      select: { designerEarning: true, template: { select: { designer: { select: { id: true, fullName: true, email: true } } } } },
    });
    const by = new Map<string, { designerId: string; name: string; email: string; sales: number; amount: number }>();
    for (const r of rows) {
      const d = r.template.designer;
      const e = by.get(d.id) ?? { designerId: d.id, name: d.fullName ?? "-", email: d.email, sales: 0, amount: 0 };
      e.sales++; e.amount += r.designerEarning;
      by.set(d.id, e);
    }
    return [...by.values()].sort((a, b) => b.amount - a.amount);
  }

  /** mark a designer's outstanding earnings as paid (records a payout batch) */
  async createPayout(adminId: string, dto: CreatePayoutDto) {
    const pending = await this.prisma.templatePurchase.findMany({
      where: { status: "paid", paidOut: false, template: { designerId: dto.designerId, earningsFrozen: false } },
      select: { id: true, designerEarning: true },
    });
    if (pending.length === 0) throw new BadRequestException("ดีไซเนอร์รายนี้ไม่มียอดค้างจ่าย");
    const amount = pending.reduce((s, p) => s + p.designerEarning, 0);

    const payout = await this.prisma.designerPayout.create({
      data: { designerId: dto.designerId, amount, salesCount: pending.length, note: dto.note, createdBy: adminId },
      select: { id: true, amount: true, salesCount: true, paidAt: true },
    });
    await this.prisma.templatePurchase.updateMany({
      where: { id: { in: pending.map(p => p.id) } },
      data: { paidOut: true, payoutId: payout.id },
    });
    return { message: `บันทึกการจ่าย ฿${amount.toLocaleString()} แล้ว`, ...payout };
  }

  async listPayouts(q: ListQueryDto) {
    return this.prisma.designerPayout.findMany({
      orderBy: { paidAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
      select: { id: true, amount: true, salesCount: true, note: true, paidAt: true, designer: { select: { id: true, fullName: true, email: true } } },
    });
  }

  // ---------- quotes ----------
  async listQuotes(q: ListQueryDto) {
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quoteRequest.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 50, skip: q.skip ?? 0,
      }),
      this.prisma.quoteRequest.count({ where }),
    ]);
    return { items, total };
  }

  async updateQuote(id: string, dto: UpdateQuoteDto) {
    const found = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("ไม่พบคำขอราคา");
    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.adminNote !== undefined) data.adminNote = dto.adminNote;
    return this.prisma.quoteRequest.update({ where: { id }, data });
  }

  // ---------- admin audit trail ----------
  async auditLog(q: ListQueryDto) {
    const where: Record<string, unknown> = {};
    if (q.status) where.action = { contains: q.status, mode: "insensitive" }; // reuse `status` as an action filter
    if (q.q) where.OR = [
      { actorEmail: { contains: q.q, mode: "insensitive" } },
      { path: { contains: q.q, mode: "insensitive" } },
      { targetId: { contains: q.q, mode: "insensitive" } },
    ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAudit.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.take ?? 100, skip: q.skip ?? 0,
      }),
      this.prisma.adminAudit.count({ where }),
    ]);
    return { items, total };
  }

  /** distinct action names, for the filter chips */
  async auditActions() {
    const rows = await this.prisma.adminAudit.findMany({ distinct: ["action"], select: { action: true }, take: 50 });
    return rows.map(r => r.action).sort();
  }

  // ---------- deep analytics ----------

  /** how many users make it to each stage */
  async funnel() {
    const [users, withDesigns, withOrders, paidOrders, buyers] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, designs: { some: {} } } }),
      this.prisma.user.count({ where: { deletedAt: null, orders: { some: {} } } }),
      this.prisma.user.count({ where: { deletedAt: null, orders: { some: { status: { notIn: ["pending", "cancelled"] } } } } }),
      this.prisma.user.count({ where: { deletedAt: null, templatePurchases: { some: {} } } }),
    ]);
    const pct = (n: number) => (users === 0 ? 0 : Math.round((n / users) * 1000) / 10);
    return {
      stages: [
        { key: "signed_up", label: "สมัครสมาชิก", count: users, pct: 100 },
        { key: "designed", label: "สร้างดีไซน์", count: withDesigns, pct: pct(withDesigns) },
        { key: "ordered", label: "สร้างออเดอร์", count: withOrders, pct: pct(withOrders) },
        { key: "paid", label: "ชำระเงินแล้ว", count: paidOrders, pct: pct(paidOrders) },
      ],
      buyers: { count: buyers, pct: pct(buyers) },
    };
  }

  /** revenue by calendar month, template sales + production orders side by side */
  async monthlyRevenue(months = 12) {
    const from = new Date();
    from.setMonth(from.getMonth() - (months - 1), 1);
    from.setHours(0, 0, 0, 0);

    const [purchases, orders, refunds] = await this.prisma.$transaction([
      this.prisma.templatePurchase.findMany({
        where: { status: "paid", createdAt: { gte: from } },
        select: { createdAt: true, price: true, platformFee: true },
      }),
      this.prisma.order.findMany({
        where: { status: { notIn: ["pending", "cancelled"] }, createdAt: { gte: from } },
        select: { createdAt: true, total: true },
      }),
      this.prisma.refund.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, amount: true } }),
    ]);

    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const map = new Map<string, { month: string; templateGross: number; platformRevenue: number; orderGross: number; orderRefunds: number; orders: number; templateSales: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(from);
      d.setMonth(from.getMonth() + i);
      map.set(key(d), { month: key(d), templateGross: 0, platformRevenue: 0, orderGross: 0, orderRefunds: 0, orders: 0, templateSales: 0 });
    }
    for (const p of purchases) {
      const e = map.get(key(p.createdAt));
      if (e) { e.templateGross += p.price; e.platformRevenue += p.platformFee; e.templateSales++; }
    }
    for (const o of orders) {
      const e = map.get(key(o.createdAt));
      if (e) { e.orderGross += o.total; e.orders++; }
    }
    // money given back comes off the month it went out (orderGross is net of it)
    for (const r of refunds) {
      const e = map.get(key(r.createdAt));
      if (e) { e.orderRefunds += r.amount; e.orderGross -= r.amount; }
    }
    return [...map.values()];
  }

  /** signup cohort → how many of that month's users ever ordered */
  async cohorts(months = 6) {
    const from = new Date();
    from.setMonth(from.getMonth() - (months - 1), 1);
    from.setHours(0, 0, 0, 0);

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, createdAt: { gte: from } },
      select: { id: true, createdAt: true, _count: { select: { orders: true, templatePurchases: true } } },
    });

    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const map = new Map<string, { cohort: string; signups: number; ordered: number; bought: number }>();
    for (const u of users) {
      const k = key(u.createdAt);
      const e = map.get(k) ?? { cohort: k, signups: 0, ordered: 0, bought: 0 };
      e.signups++;
      if (u._count.orders > 0) e.ordered++;
      if (u._count.templatePurchases > 0) e.bought++;
      map.set(k, e);
    }
    return [...map.values()]
      .sort((a, b) => a.cohort.localeCompare(b.cohort))
      .map(c => ({
        ...c,
        orderedPct: c.signups ? Math.round((c.ordered / c.signups) * 1000) / 10 : 0,
        boughtPct: c.signups ? Math.round((c.bought / c.signups) * 1000) / 10 : 0,
      }));
  }

  // ---------- CSV export ----------
  async exportCsv(kind: "orders" | "sales" | "users" | "payouts" | "audit"): Promise<string> {
    if (kind === "orders") {
      const rows = await this.prisma.order.findMany({
        orderBy: { createdAt: "desc" }, take: 5000,
        select: { orderNo: true, status: true, subtotal: true, shippingFee: true, total: true, fabricSummary: true, createdAt: true, user: { select: { email: true } } },
      });
      return toCsv(["orderNo", "email", "status", "subtotal", "shippingFee", "total", "spec", "createdAt"],
        rows.map(r => [r.orderNo, r.user.email, r.status, r.subtotal, r.shippingFee, r.total, r.fabricSummary ?? "", r.createdAt.toISOString()]));
    }
    if (kind === "sales") {
      const rows = await this.prisma.templatePurchase.findMany({
        orderBy: { createdAt: "desc" }, take: 5000,
        select: {
          price: true, platformFee: true, designerEarning: true, commissionPct: true, paidOut: true, createdAt: true,
          buyer: { select: { email: true } },
          template: { select: { name: true, category: true, designer: { select: { email: true } } } },
        },
      });
      return toCsv(["date", "template", "category", "designer", "buyer", "price", "platformFee", "designerEarning", "commissionPct", "paidOut"],
        rows.map(r => [r.createdAt.toISOString(), r.template.name, r.template.category ?? "", r.template.designer.email, r.buyer.email, r.price, r.platformFee, r.designerEarning, r.commissionPct, r.paidOut]));
    }
    if (kind === "users") {
      const rows = await this.prisma.user.findMany({
        where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5000,
        select: { email: true, fullName: true, companyName: true, role: true, isVerified: true, suspendedAt: true, createdAt: true, _count: { select: { designs: true, orders: true } } },
      });
      return toCsv(["email", "fullName", "company", "role", "verified", "suspended", "designs", "orders", "createdAt"],
        rows.map(r => [r.email, r.fullName ?? "", r.companyName ?? "", r.role, r.isVerified, r.suspendedAt ? "yes" : "", r._count.designs, r._count.orders, r.createdAt.toISOString()]));
    }
    if (kind === "payouts") {
      const rows = await this.prisma.designerPayout.findMany({
        orderBy: { paidAt: "desc" }, take: 5000,
        select: { amount: true, salesCount: true, note: true, paidAt: true, designer: { select: { email: true, fullName: true } } },
      });
      return toCsv(["paidAt", "designer", "email", "amount", "salesCount", "note"],
        rows.map(r => [r.paidAt.toISOString(), r.designer.fullName ?? "", r.designer.email, r.amount, r.salesCount, r.note ?? ""]));
    }
    const rows = await this.prisma.adminAudit.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    return toCsv(["createdAt", "actor", "action", "method", "path", "targetId", "ok", "status", "ip"],
      rows.map(r => [r.createdAt.toISOString(), r.actorEmail ?? "", r.action, r.method, r.path, r.targetId ?? "", r.ok, r.status ?? "", r.ip ?? ""]));
  }

  // ---------- terms acceptance audit log ----------
  async termsLog(q: ListQueryDto) {
    const where: Record<string, unknown> = {};
    if (q.q) where.user = { email: { contains: q.q, mode: "insensitive" } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.termsAcceptance.findMany({
        where, orderBy: { acceptedAt: "desc" }, take: q.take ?? 100, skip: q.skip ?? 0,
        select: {
          id: true, kind: true, version: true, ref: true, ip: true, userAgent: true, acceptedAt: true,
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      this.prisma.termsAcceptance.count({ where }),
    ]);
    return { items, total };
  }
}
