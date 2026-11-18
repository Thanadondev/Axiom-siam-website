import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/decorators";
import { RateLimit, RateLimitGuard } from "../common/rate-limit.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "../settings/settings.service";
import { UpdateAiSchema, type UpdateAiDto } from "../settings/settings.dto";
import { AiPatternsService } from "./ai-patterns.service";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const PatternRequestSchema = z.object({
  prompt: z.string().trim().min(2, "บอกลายที่อยากได้สักหน่อย").max(300),
  body: hex.optional(),
  trim: hex.optional(),
  count: z.number().int().min(1).max(4).optional(),
});

/** the advanced designer's "✨ ให้ AI ออกแบบลาย": a customer's words in, pattern recipes out */
@Controller("ai")
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class AiController {
  constructor(private readonly patterns: AiPatternsService) {}

  @RateLimit({ limit: 10, windowMs: 60_000 })
  @Post("patterns")
  design(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(PatternRequestSchema)) body: z.infer<typeof PatternRequestSchema>) {
    return this.patterns.design(user.id, body);
  }

  @Get("patterns/quota")
  quota(@CurrentUser() user: AuthUser) {
    return this.patterns.quota(user.id);
  }
}

/** /admin → ✨ AI: what it costs, who uses it, on/off and the limits */
@Controller("admin/ai")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AiAdminController {
  constructor(private readonly patterns: AiPatternsService, private readonly settings: SettingsService) {}

  @Get()
  report() {
    return this.patterns.report();
  }

  @Patch("settings")
  save(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(UpdateAiSchema)) dto: UpdateAiDto) {
    return this.settings.saveAi(dto, me.id);
  }
}
