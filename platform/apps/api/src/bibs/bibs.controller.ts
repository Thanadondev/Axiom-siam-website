import { BadRequestException, Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Public, Roles } from "../auth/decorators";
import { RateLimit, RateLimitGuard } from "../common/rate-limit.guard";
import { BibJobService } from "./bib-jobs.service";

const SheetSchema = z.object({
  design: z.unknown(),
  logoUrl: z.string().max(200).optional(),
  size: z.string().max(8).optional(),
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
    return this.bibs.sheet(p.data.design, p.data.logoUrl, p.data.size);
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
