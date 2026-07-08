import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTemplateDto, UpdateTemplateDto, BrowseQueryDto } from "./market.dto";

// platform commission (%). Rest goes to the designer. Configurable via env.
const COMMISSION_PCT = Math.min(100, Math.max(0, Number(process.env.MARKET_COMMISSION_PCT ?? 30)));
// bump this string when the seller terms change (recorded per acceptance)
export const TERMS_VERSION = process.env.MARKET_TERMS_VERSION ?? "1.0 (2026-07-08)";

const CARD_SELECT = {
  id: true, name: true, description: true, category: true, tags: true, price: true,
  previewUrl: true, status: true, salesCount: true, createdAt: true,
  designer: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class MarketService {
  constructor(private prisma: PrismaService) {}

  // ---------- public browse ----------
  async browse(query: BrowseQueryDto) {
    const where: Record<string, unknown> = { status: "published", deletedAt: null };
    if (query.category) where.category = query.category;
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { tags: { has: query.q } },
    ];
    const orderBy =
      query.sort === "popular" ? { salesCount: "desc" as const } :
      query.sort === "price_asc" ? { price: "asc" as const } :
      query.sort === "price_desc" ? { price: "desc" as const } :
      { createdAt: "desc" as const };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.marketTemplate.findMany({ where, orderBy, take: query.take ?? 24, skip: query.skip ?? 0, select: CARD_SELECT }),
      this.prisma.marketTemplate.count({ where }),
    ]);
    return { items, total, commissionPct: COMMISSION_PCT };
  }

  async categories() {
    const rows = await this.prisma.marketTemplate.findMany({
      where: { status: "published", deletedAt: null, category: { not: null } },
      distinct: ["category"], select: { category: true },
    });
    return rows.map(r => r.category).filter(Boolean);
  }

  async getPublic(id: string, userId?: string) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, deletedAt: null }, select: CARD_SELECT });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    let owned = false;
    if (userId) {
      const p = await this.prisma.templatePurchase.findUnique({ where: { templateId_buyerId: { templateId: id, buyerId: userId } } });
      owned = !!p || t.designer.id === userId;
    }
    return { ...t, owned };
  }

  // ---------- designer side ----------
  async create(designerId: string, dto: CreateTemplateDto, meta?: { ip?: string; userAgent?: string }) {
    const status = dto.status ?? "draft";
    // publishing to the marketplace requires accepting the seller terms (copyright/IP)
    if (status === "published" && !dto.agreedTerms)
      throw new BadRequestException("กรุณายอมรับข้อตกลง & เงื่อนไขลิขสิทธิ์ก่อนเผยแพร่ขาย");
    const tpl = await this.prisma.marketTemplate.create({
      data: {
        designerId, name: dto.name, description: dto.description, category: dto.category,
        tags: dto.tags ?? [], price: dto.price, previewUrl: dto.previewUrl,
        stateJson: dto.stateJson, status,
      },
      select: { id: true, name: true, status: true, price: true },
    });
    if (dto.agreedTerms) {
      // audit log — proof the seller accepted the terms at publish time
      await this.prisma.termsAcceptance.create({
        data: { userId: designerId, kind: "seller_publish", version: TERMS_VERSION, ref: tpl.id, ip: meta?.ip, userAgent: meta?.userAgent },
      }).catch(() => undefined);
    }
    return tpl;
  }

  private async ownTemplate(designerId: string, id: string) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, designerId, deletedAt: null } });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต หรือไม่ใช่ของคุณ");
    return t;
  }

  async update(designerId: string, id: string, dto: UpdateTemplateDto) {
    await this.ownTemplate(designerId, id);
    const data: Record<string, unknown> = {};
    for (const k of ["name", "description", "category", "tags", "price", "previewUrl", "stateJson", "status"] as const)
      if (dto[k] !== undefined) data[k] = dto[k];
    return this.prisma.marketTemplate.update({ where: { id }, data, select: { id: true, name: true, status: true, price: true } });
  }

  async remove(designerId: string, id: string) {
    await this.ownTemplate(designerId, id);
    await this.prisma.marketTemplate.update({ where: { id }, data: { status: "unlisted", deletedAt: new Date() } });
    return { message: "ลบเทมเพลตแล้ว" };
  }

  async myListings(designerId: string) {
    const items = await this.prisma.marketTemplate.findMany({
      where: { designerId, deletedAt: null }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, price: true, status: true, salesCount: true, previewUrl: true, category: true, createdAt: true },
    });
    const agg = await this.prisma.templatePurchase.aggregate({
      where: { template: { designerId }, status: "paid" },
      _sum: { designerEarning: true }, _count: true,
    });
    return { items, earnings: { total: agg._sum.designerEarning ?? 0, sales: agg._count, commissionPct: COMMISSION_PCT } };
  }

  // ---------- purchase (MVP: stubbed payment) ----------
  async purchase(buyerId: string, id: string) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    if (t.status !== "published") throw new BadRequestException("เทมเพลตนี้ยังไม่เปิดขาย");
    if (t.designerId === buyerId) throw new BadRequestException("เทมเพลตของคุณเอง ไม่ต้องซื้อ");
    const existing = await this.prisma.templatePurchase.findUnique({ where: { templateId_buyerId: { templateId: id, buyerId } } });
    if (existing) return { message: "คุณมีเทมเพลตนี้อยู่แล้ว", purchaseId: existing.id, alreadyOwned: true };

    // TODO: verify real payment via gateway before this point. MVP = mark paid.
    const platformFee = Math.round((t.price * COMMISSION_PCT) / 100);
    const designerEarning = t.price - platformFee;
    const [purchase] = await this.prisma.$transaction([
      this.prisma.templatePurchase.create({
        data: { templateId: id, buyerId, price: t.price, platformFee, designerEarning, commissionPct: COMMISSION_PCT, status: "paid" },
        select: { id: true },
      }),
      this.prisma.marketTemplate.update({ where: { id }, data: { salesCount: { increment: 1 } } }),
    ]);
    return { message: "ซื้อสำเร็จ", purchaseId: purchase.id, price: t.price, designerEarning, platformFee };
  }

  async myPurchases(buyerId: string) {
    const rows = await this.prisma.templatePurchase.findMany({
      where: { buyerId }, orderBy: { createdAt: "desc" },
      select: { id: true, price: true, createdAt: true, template: { select: { id: true, name: true, previewUrl: true, category: true, designer: { select: { fullName: true } } } } },
    });
    return rows.map(r => ({ purchaseId: r.id, price: r.price, boughtAt: r.createdAt, ...r.template }));
  }

  // load the design into the editor — only owner (buyer) or the designer
  async getState(userId: string, id: string) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, designerId: true, stateJson: true } });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    if (t.designerId !== userId) {
      const p = await this.prisma.templatePurchase.findUnique({ where: { templateId_buyerId: { templateId: id, buyerId: userId } } });
      if (!p) throw new ForbiddenException("ต้องซื้อเทมเพลตก่อนถึงจะเปิดใช้ได้");
    }
    return { id: t.id, name: t.name, stateJson: t.stateJson };
  }
}
