import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotifyService } from "../notify/notify.service";
import { splitPrice, previewFingerprint } from "./commission";
import type { CreateTemplateDto, UpdateTemplateDto, BrowseQueryDto, ReportTemplateDto } from "./market.dto";

const CARD_SELECT = {
  id: true, name: true, description: true, category: true, tags: true, price: true,
  previewUrl: true, status: true, salesCount: true, createdAt: true,
  designer: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class MarketService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private notify: NotifyService) {}

  // ---------- public browse ----------
  async browse(query: BrowseQueryDto) {
    const where: Record<string, unknown> = { status: "published", deletedAt: null };
    if (query.category) where.category = query.category;
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { tags: { has: query.q } },
    ];
    const sortBy =
      query.sort === "popular" ? { salesCount: "desc" as const } :
      query.sort === "price_asc" ? { price: "asc" as const } :
      query.sort === "price_desc" ? { price: "desc" as const } :
      { createdAt: "desc" as const };
    const orderBy = [{ featured: "desc" as const }, sortBy]; // featured templates first
    const [items, total] = await this.prisma.$transaction([
      this.prisma.marketTemplate.findMany({ where, orderBy, take: query.take ?? 24, skip: query.skip ?? 0, select: CARD_SELECT }),
      this.prisma.marketTemplate.count({ where }),
    ]);
    return { items, total, commissionPct: (await this.settings.market()).commissionPct };
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

  /** public designer profile: bio + their published templates + totals */
  async designerProfile(id: string) {
    const d = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, suspendedAt: null },
      select: { id: true, fullName: true, companyName: true, bio: true, createdAt: true },
    });
    if (!d) throw new NotFoundException("ไม่พบดีไซเนอร์");
    const items = await this.prisma.marketTemplate.findMany({
      where: { designerId: id, status: "published", deletedAt: null, takedownAt: null },
      orderBy: [{ featured: "desc" }, { salesCount: "desc" }],
      select: CARD_SELECT,
    });
    const totalSales = items.reduce((s, t) => s + t.salesCount, 0);
    return { ...d, items, stats: { templates: items.length, totalSales } };
  }

  // ---------- designer side ----------
  async create(designerId: string, dto: CreateTemplateDto, meta?: { ip?: string; userAgent?: string }) {
    const status = dto.status ?? "draft";
    // publishing to the marketplace requires accepting the seller terms (copyright/IP)
    if (status === "published" && !dto.agreedTerms)
      throw new BadRequestException("กรุณายอมรับข้อตกลง & เงื่อนไขลิขสิทธิ์ก่อนเผยแพร่ขาย");
    // fingerprint the artwork so an identical re-upload can be spotted
    const previewHash = previewFingerprint(dto.previewUrl);

    const tpl = await this.prisma.marketTemplate.create({
      data: {
        designerId, name: dto.name, description: dto.description, category: dto.category,
        tags: dto.tags ?? [], price: dto.price, previewUrl: dto.previewUrl,
        stateJson: dto.stateJson, status, previewHash,
      },
      select: { id: true, name: true, status: true, price: true },
    });

    // same image already on the marketplace under a different designer? flag it.
    if (previewHash) {
      const clash = await this.prisma.marketTemplate.findFirst({
        where: { previewHash, id: { not: tpl.id }, deletedAt: null, designerId: { not: designerId } },
        select: { id: true, name: true, designer: { select: { email: true } } },
      });
      if (clash) {
        await this.prisma.templateReport.create({
          data: {
            templateId: tpl.id, reporterId: null, reason: "copyright",
            detail: `ตรวจพบอัตโนมัติ: ภาพเหมือนกันทุกไบต์กับลาย "${clash.name}" ของ ${clash.designer.email}`,
          },
        }).catch(() => undefined);
        await this.notify.pushAdmins(
          `⚠ ตรวจพบลายซ้ำ: "${tpl.name}"`,
          `ภาพเหมือน "${clash.name}" ของ ${clash.designer.email} ทุกไบต์`,
          "/admin",
        );
      }
    }
    if (dto.agreedTerms) {
      // audit log — proof the seller accepted the terms at publish time
      const { termsVersion } = await this.settings.market();
      await this.prisma.termsAcceptance.create({
        data: { userId: designerId, kind: "seller_publish", version: termsVersion, ref: tpl.id, ip: meta?.ip, userAgent: meta?.userAgent },
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
    const { commissionPct } = await this.settings.market();
    return { items, earnings: { total: agg._sum.designerEarning ?? 0, sales: agg._count, commissionPct } };
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
    // the commission rate in force *right now* is frozen onto the purchase row
    const { commissionPct } = await this.settings.market();
    const { platformFee, designerEarning } = splitPrice(t.price, commissionPct);
    const [purchase] = await this.prisma.$transaction([
      this.prisma.templatePurchase.create({
        data: { templateId: id, buyerId, price: t.price, platformFee, designerEarning, commissionPct, status: "paid" },
        select: { id: true },
      }),
      this.prisma.marketTemplate.update({ where: { id }, data: { salesCount: { increment: 1 } } }),
    ]);
    // tell the designer they made a sale
    await this.notify.push({
      userId: t.designerId,
      title: `ขายลายได้! "${t.name}"`,
      body: `คุณได้รับ ฿${designerEarning.toLocaleString()} (หักค่าบริการ ${commissionPct}%)`,
      link: "/account",
      email: true,
    });

    return { message: "ซื้อสำเร็จ", purchaseId: purchase.id, price: t.price, designerEarning, platformFee };
  }

  async myPurchases(buyerId: string) {
    const rows = await this.prisma.templatePurchase.findMany({
      where: { buyerId }, orderBy: { createdAt: "desc" },
      select: { id: true, price: true, createdAt: true, template: { select: { id: true, name: true, previewUrl: true, category: true, designer: { select: { fullName: true } } } } },
    });
    return rows.map(r => ({ purchaseId: r.id, price: r.price, boughtAt: r.createdAt, ...r.template }));
  }

  // ---------- abuse report (any visitor) ----------
  async report(id: string, dto: ReportTemplateDto, reporterId?: string) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true } });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    await this.prisma.templateReport.create({
      data: { templateId: id, reporterId: reporterId ?? null, reason: dto.reason, detail: dto.detail },
    });
    await this.notify.pushAdmins(`🚩 รายงานละเมิด: "${t.name}"`, `เหตุผล: ${dto.reason}`, "/admin");
    return { message: "ส่งรายงานแล้ว ทีมงานจะตรวจสอบโดยเร็ว" };
  }

  // load the design into the editor — only owner (buyer) or the designer
  async getState(userId: string, id: string) {
    const t = await this.prisma.marketTemplate.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, designerId: true, stateJson: true } });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    if (t.designerId !== userId) {
      const p = await this.prisma.templatePurchase.findUnique({ where: { templateId_buyerId: { templateId: id, buyerId: userId } } });
      if (!p) throw new ForbiddenException("ต้องซื้อเทมเพลตก่อนถึงจะเปิดใช้ได้");
    }
    return { id: t.id, name: t.name, stateJson: t.stateJson, watermark: false };
  }

  /**
   * State for the marketplace's live colour preview — open to guests.
   *
   * Deliberate trade-off: to show the design on any colour we must hand the
   * browser the real vector state, so anyone who opens devtools can lift it.
   * `watermark: true` makes the editor stamp the preview, which stops casual
   * copying but is NOT real protection. Only publish here what you accept
   * being seen; the money is in printing the shirt, not in the JSON.
   */
  async getPreviewState(userId: string | undefined, id: string) {
    const t = await this.prisma.marketTemplate.findFirst({
      where: { id, deletedAt: null, takedownAt: null },
      select: { id: true, name: true, designerId: true, stateJson: true, status: true },
    });
    if (!t) throw new NotFoundException("ไม่พบเทมเพลต");
    // an unpublished draft is only previewable by its own designer
    if (t.status !== "published" && t.designerId !== userId) throw new NotFoundException("ไม่พบเทมเพลต");

    let owned = t.designerId === userId;
    if (!owned && userId) {
      const p = await this.prisma.templatePurchase.findUnique({
        where: { templateId_buyerId: { templateId: id, buyerId: userId } },
      });
      owned = !!p;
    }
    return { id: t.id, name: t.name, stateJson: t.stateJson, watermark: !owned };
  }
}
