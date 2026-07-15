import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { promises as fs } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";

/**
 * Where slip images live.
 *
 * Local disk for now, behind a method so swapping in S3/R2 later is one class.
 * Slips are financial records: they are never deleted here, only written.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger("Storage");
  /** default sits next to the web app's static dir so Next can serve it */
  private readonly root = resolve(process.env.UPLOAD_DIR ?? "./uploads");

  /** we accept what a phone's screenshot produces, and nothing else */
  private static readonly ALLOWED: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
  };
  static readonly MAX_BYTES = 8 * 1024 * 1024;

  /**
   * Sniff the real type from magic bytes. A browser-supplied mimetype is just
   * a string the client chose — trusting it is how you end up storing a .php
   * with a .jpg name.
   */
  static sniff(buf: Buffer): string | null {
    if (buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
    if (buf.slice(4, 8).toString("ascii") === "ftyp") {
      const brand = buf.slice(8, 12).toString("ascii");
      if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1")) return "image/heic";
    }
    return null;
  }

  /** throws unless this really is an image we accept, at a sane size */
  static validate(buf: Buffer, declaredMime?: string): string {
    if (!buf?.length) throw new BadRequestException("ไฟล์ว่าง");
    if (buf.length > StorageService.MAX_BYTES) {
      throw new BadRequestException(`ไฟล์ใหญ่เกิน ${StorageService.MAX_BYTES / 1024 / 1024}MB`);
    }
    const actual = StorageService.sniff(buf);
    if (!actual || !StorageService.ALLOWED[actual]) {
      throw new BadRequestException("รองรับเฉพาะรูปภาพ JPG / PNG / WEBP / HEIC เท่านั้น");
    }
    // a mismatch is worth noting but the sniffed type is what we trust
    if (declaredMime && declaredMime !== actual) {
      new Logger("Storage").warn(`mimetype mismatch: client said ${declaredMime}, bytes say ${actual}`);
    }
    return actual;
  }

  async saveSlip(orderId: string, buf: Buffer, declaredMime?: string): Promise<string> {
    const mime = StorageService.validate(buf, declaredMime);
    const ext = StorageService.ALLOWED[mime];

    // orderId is a uuid from our DB, but never build a path from input
    // without pinning it — one "../" would escape the upload dir
    const safeOrder = orderId.replace(/[^a-zA-Z0-9-]/g, "");
    const dir = join(this.root, "slips", safeOrder);
    if (!resolve(dir).startsWith(resolve(this.root))) throw new BadRequestException("เส้นทางไฟล์ไม่ถูกต้อง");

    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await fs.writeFile(join(dir, name), buf);

    this.log.log(`saved slip ${safeOrder}/${name} (${(buf.length / 1024).toFixed(0)}KB, ${mime})`);
    return `/uploads/slips/${safeOrder}/${name}`;
  }
}
