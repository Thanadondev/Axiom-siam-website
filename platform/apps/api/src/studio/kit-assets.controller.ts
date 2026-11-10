import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RateLimit } from "../common/rate-limit.guard";
import { KIT_ASSET_LIMITS, KitAssetStore, cleanFileName, decodeDataUrl } from "./kit-asset-store";

const UploadSchema = z.object({
  kind: z.enum(["logo", "font"]),
  name: z.string().max(200).optional(),
  // base64 inflates by ~4/3: reject an oversized body before decoding it
  data: z.string().min(40, "ไฟล์ไม่ถูกต้อง").max(Math.ceil(KIT_ASSET_LIMITS.font * 1.4), "ไฟล์ใหญ่เกินไป"),
});

/**
 * The kit studio uploads a team's logo / font here when a design is saved, and
 * keeps only the returned URL in the design.
 */
@Controller("kit-assets")
export class KitAssetsController {
  constructor(private readonly store: KitAssetStore) {}

  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 60, windowMs: 60 * 60_000 })
  @Post()
  async upload(@Body() body: unknown) {
    const p = UploadSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
    const buf = decodeDataUrl(p.data.data);
    const saved = await this.store.save(p.data.kind, buf);
    return { kind: p.data.kind, name: cleanFileName(p.data.name ?? "", p.data.kind === "logo" ? "logo.png" : "font"), url: saved.url, bytes: saved.bytes };
  }
}
