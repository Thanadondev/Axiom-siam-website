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

/** the first bytes each kind of picture starts with: a file named .jpg that isn't one is refused */
function looksLike(mime: string, data: string) {
  const b = Buffer.from(data.slice(0, 32), "base64");
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
}
/** a picture of a pattern the customer likes, shrunk in the browser (about 1024 px); only the AI sees it, the site keeps none */
export const RefImageSchema = z
  .object({
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    // base64, at most about 1.5 MB of picture
    data: z.string().min(16).max(2_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, "ไฟล์รูปไม่ถูกต้อง"),
  })
  .refine(i => looksLike(i.mime, i.data), "ไฟล์รูปไม่ถูกต้อง ใช้ JPG, PNG หรือ WebP");

export const PatternRequestSchema = z
  .object({
    prompt: z.string().trim().max(300).default(""),
    body: hex.optional(),
    trim: hex.optional(),
    count: z.number().int().min(1).max(4).optional(),
    image: RefImageSchema.optional(),
  })
  // words, a picture, or both
  .refine(r => r.prompt.length >= 2 || !!r.image, { message: "บอกลายที่อยากได้สักหน่อย หรือแนบรูปตัวอย่าง", path: ["prompt"] });

/** the advanced designer's "✨ ให้ AI ออกแบบลาย": a customer's words (and a picture they like) in, pattern recipes out */
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
