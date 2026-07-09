import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimitGuard, RateLimit } from "../common/rate-limit.guard";
import { CurrentUser, type AuthUser } from "../auth/decorators";
import { MarketService } from "./market.service";
import {
  CreateTemplateSchema, UpdateTemplateSchema, BrowseQuerySchema, ReportTemplateSchema,
  type CreateTemplateDto, type UpdateTemplateDto, type BrowseQueryDto, type ReportTemplateDto,
} from "./market.dto";

@Controller("templates")
export class MarketController {
  constructor(private readonly market: MarketService, private readonly jwt: JwtService) {}

  private async optionalUserId(req: Request): Promise<string | undefined> {
    const h = req.headers.authorization;
    if (h && h.startsWith("Bearer ")) {
      try {
        const payload = await this.jwt.verifyAsync(h.slice(7), { secret: process.env.JWT_ACCESS_SECRET });
        return (payload as { sub: string }).sub;
      } catch { /* guest */ }
    }
    return undefined;
  }

  // ---------- public ----------
  @Get()
  browse(@Query(new ZodValidationPipe(BrowseQuerySchema)) q: BrowseQueryDto) {
    return this.market.browse(q);
  }

  @Get("categories")
  categories() {
    return this.market.categories();
  }

  @Get("designer/:id")
  designerProfile(@Param("id") id: string) {
    return this.market.designerProfile(id);
  }

  // ---------- authed (specific routes before ":id") ----------
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: Request, @CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateTemplateSchema)) dto: CreateTemplateDto) {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || undefined;
    return this.market.create(user.id, dto, { ip, userAgent: req.headers["user-agent"] });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/listings")
  myListings(@CurrentUser() user: AuthUser) {
    return this.market.myListings(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/purchases")
  myPurchases(@CurrentUser() user: AuthUser) {
    return this.market.myPurchases(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/buy")
  buy(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.market.purchase(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/state")
  state(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.market.getState(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(UpdateTemplateSchema)) dto: UpdateTemplateDto) {
    return this.market.update(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.market.remove(user.id, id);
  }

  // anyone (logged-in or guest) can report a template for copyright/abuse
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60 * 60_000 }) // stops report-spam brigading
  @Post(":id/report")
  async report(@Req() req: Request, @Param("id") id: string, @Body(new ZodValidationPipe(ReportTemplateSchema)) dto: ReportTemplateDto) {
    return this.market.report(id, dto, await this.optionalUserId(req));
  }

  // public detail last (uses optional auth to flag ownership)
  @Get(":id")
  async detail(@Req() req: Request, @Param("id") id: string) {
    return this.market.getPublic(id, await this.optionalUserId(req));
  }
}
