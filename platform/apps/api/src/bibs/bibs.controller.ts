import { BadRequestException, Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Public, Roles } from "../auth/decorators";
import { RateLimit, RateLimitGuard } from "../common/rate-limit.guard";
import { BibJobService } from "./bib-jobs.service";
import { kitBibDesign, kitLogoUrl, kitOnBib } from "./kit";
import { BIB_SIZES } from "./template";

const SheetSchema = z.object({
  design: z.unknown().optional(),
  logoUrl: z.string().max(200).optional(),
  size: z.string().max(8).optional(),
  /** or a design from the 3D studio (/shop/bib, its flat view): drawn as its orders print */
  kit: z.unknown().optional(),
  /** its names and numbers; none = the one on the kit, size M */
  rows: z.array(z.object({ name: z.string().max(20).default(""), number: z.string().max(3).default(""), size: z.enum(BIB_SIZES) })).max(500).optional(),
});

/** the bib designer's live order sheet (/order/bib), drawn from the same shapes as the print files */
@Controller("bibs")
export class BibsController {
  constructor(private readonly bibs: BibJobService) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 240, windowMs: 10 * 60_000 })
  @Post("sheet")
  sheet(@Body() body: unknown) {
    const p = SheetSchema.safeParse(body);
    if (!p.success) throw new BadRequestException("ข้อมูลไม่ถูกต้อง");
    const { kit, rows, size } = p.data;
    if (kit !== undefined) {
      if (!kitOnBib(kit)) throw new BadRequestException("เสื้อทรงนี้ยังไม่มีภาพแบบแบน");
      const one = [{ name: (kit.name ?? "").trim().slice(0, 20), number: (kit.number ?? "").replace(/\D/g, "").slice(0, 3), size: "M" as const }];
      const list = rows?.length ? rows.map(r => ({ ...r, number: r.number.replace(/\D/g, "") })) : one;
      return this.bibs.sheet(kitBibDesign(kit, list), kitLogoUrl(kit), size);
    }
    return this.bibs.sheet(p.data.design, p.data.logoUrl, size);
  }
}

/**
 * The advanced designer sends a design's print data here when the team orders
 * (every shape outlined, on the bib's pattern), and keeps the returned id in the design.
 */
@Controller("designer-prints")
export class DesignerPrintsController {
  constructor(private readonly bibs: BibJobService) {}

  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 60 * 60_000 })
  @Post()
  save(@Body() body: unknown) {
    return this.bibs.savePrint(body);
  }
}

/** the team builds a web-designed bib's print files again (after a failure, or a fix to the generator) */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/orders")
export class AdminBibsController {
  constructor(private readonly bibs: BibJobService) {}

  @Post(":id/bib-job")
  rebuild(@Param("id") id: string) {
    return this.bibs.attach(id);
  }
}
