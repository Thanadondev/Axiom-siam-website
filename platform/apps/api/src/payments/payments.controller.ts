import { Body, Controller, Get, Param, Post, Query, Res, UseGuards, BadRequestException, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public, CurrentUser, type AuthUser } from "../auth/decorators";
import { RateLimit } from "../common/rate-limit.guard";
import { PaymentsService } from "./payments.service";
import { StorageService } from "./storage.service";
import { SubmitSlipSchema } from "./payments.dto";
import { verifySlipLink } from "./slip-link";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly storage: StorageService) {}

  /**
   * A slip image, by a signed link the API handed to its owner or an admin
   * (slip-link.ts). Slips are not served as public files.
   */
  @Public()
  @Get("slip")
  slip(@Query("f") f: string, @Query("exp") exp: string, @Query("sig") sig: string, @Res() res: Response) {
    const file = verifySlipLink(f, exp, sig);
    const path = file ? this.storage.slipPath(file) : null;
    if (!path) throw new NotFoundException("ลิงก์สลิปหมดอายุหรือไม่ถูกต้อง");
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.sendFile(path, err => { if (err && !res.headersSent) res.status(404).end(); });
  }

  /** the order page hides the pay panel when no account is configured */
  @Public()
  @Get("status")
  status() {
    return this.payments.status();
  }

  /** QR + account details for this order */
  @UseGuards(JwtAuthGuard)
  @Get("orders/:id/methods")
  methods(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payments.payMethods(user.id, id);
  }

  /**
   * Customer submits proof of transfer.
   *
   * The image arrives base64 in JSON rather than multipart: slips are small
   * phone screenshots and this keeps us off an extra upload dependency.
   * Rate-limited because it writes files to disk.
   */
  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 10, windowMs: 60 * 60_000 })
  @Post("orders/:id/slip")
  async submitSlip(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const parsed = SubmitSlipSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");

    const { image } = parsed.data;
    const b64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      throw new BadRequestException("ไฟล์รูปไม่ถูกต้อง");
    }
    // validate here too, so a bad file never reaches the service
    const mime = StorageService.validate(buffer);

    return this.payments.submitSlip(user.id, id, { buffer, mimetype: mime, size: buffer.length });
  }

  /** the order page polls this while a slip is under review */
  @UseGuards(JwtAuthGuard)
  @Get("orders/:id/state")
  state(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payments.paymentState(user.id, id);
  }
}
