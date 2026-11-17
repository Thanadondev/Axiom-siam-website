import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/decorators";
import { RateLimit, RateLimitGuard } from "../common/rate-limit.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
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
    return { remaining: this.patterns.remaining(user.id), daily: this.patterns.daily };
  }
}
