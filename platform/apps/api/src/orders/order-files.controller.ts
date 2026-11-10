import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public, CurrentUser, type AuthUser } from "../auth/decorators";
import { RateLimitGuard, RateLimit } from "../common/rate-limit.guard";
import { OrderFilesService } from "./order-files.service";
import { verifyOrderFileLink } from "./order-file-link";

const PreviewSchema = z.object({ image: z.string().min(16).max(12_000_000) });

/**
 * The customer's own print files, for ordering bibs by file:
 *   POST /order-files                 the .zip itself, as the raw request body (application/zip)
 *   POST /order-files/:id/preview     a picture of the job (base64 JSON, like a slip)
 *   GET  /order-files/:id/zip|preview a signed link handed out with the order
 * The upload comes first; POST /orders { fileId } attaches it to the order.
 */
@Controller("order-files")
export class OrderFilesController {
  constructor(private readonly files: OrderFilesService) {}

  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60 * 60_000 })
  @Post()
  upload(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(type)) {
      throw new BadRequestException("ส่งไฟล์เป็น .zip เท่านั้น");
    }
    const len = req.headers["content-length"] !== undefined ? Number(req.headers["content-length"]) : undefined;
    return this.files.saveZip(user.id, req, req.headers["x-file-name"], Number.isFinite(len) ? len : undefined);
  }

  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60 * 60_000 })
  @Post(":id/preview")
  preview(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const p = PreviewSchema.safeParse(body);
    if (!p.success) throw new BadRequestException("ภาพตัวอย่างไม่ถูกต้อง");
    const b64 = p.data.image.includes(",") ? p.data.image.slice(p.data.image.indexOf(",") + 1) : p.data.image;
    return this.files.savePreview(user.id, id, Buffer.from(b64, "base64"));
  }

  @Public()
  @Get(":id/:kind")
  async serve(@Param("id") id: string, @Param("kind") kind: string, @Query("exp") exp: string, @Query("sig") sig: string, @Res() res: Response) {
    if (!verifyOrderFileLink(id, kind, exp, sig)) throw new NotFoundException("ลิงก์หมดอายุหรือไม่ถูกต้อง");
    const f = await this.files.find(id);
    const path = f && (kind === "zip" ? this.files.abs(f.path) : f.previewPath ? this.files.abs(f.previewPath) : null);
    if (!f || !path) throw new NotFoundException("ไม่พบไฟล์");
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    const done = (err?: Error) => { if (err && !res.headersSent) res.status(404).end(); };
    if (kind === "zip") res.download(path, f.name, done);
    else res.sendFile(path, done);
  }
}
