import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join, resolve } from "path";

/**
 * A team's own logo and name/number font, uploaded from the kit studio.
 *
 * Files are stored once by content hash (the same logo saved on ten designs is
 * one file) under UPLOAD_DIR/kit-assets/, and designs keep only the URL. They
 * are public-by-link like the slip images, and are what the factory prints, so
 * they are never overwritten (same hash = same bytes) or deleted here.
 */
export type KitAssetKind = "logo" | "font";

export const KIT_ASSET_LIMITS: Record<KitAssetKind, number> = {
  // the kit studio re-encodes logos to a 1024 px PNG; the bib designer keeps print resolution (up to 3000 px)
  logo: 8 * 1024 * 1024,
  font: 4 * 1024 * 1024,
};

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const FONT_TYPES: Record<string, string> = { "font/woff2": "woff2", "font/woff": "woff", "font/otf": "otf", "font/ttf": "ttf" };

/** the real type from the first bytes; a client-declared type is never trusted */
export function sniffKitAsset(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  const a = buf.subarray(0, 4).toString("latin1");
  if (buf[0] === 0x89 && a.slice(1) === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (a === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (a === "wOF2") return "font/woff2";
  if (a === "wOFF") return "font/woff";
  if (a === "OTTO") return "font/otf";
  if ((buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) || a === "true") return "font/ttf";
  return null;
}

/** throws a customer-readable message unless `buf` is an acceptable file of `kind`; returns its type */
export function validateKitAsset(kind: KitAssetKind, buf: Buffer): string {
  if (!buf?.length) throw new BadRequestException("ไฟล์ว่าง");
  if (buf.length > KIT_ASSET_LIMITS[kind]) {
    throw new BadRequestException(`ไฟล์ใหญ่เกิน ${KIT_ASSET_LIMITS[kind] / 1024 / 1024}MB`);
  }
  const mime = sniffKitAsset(buf);
  const table = kind === "logo" ? LOGO_TYPES : FONT_TYPES;
  if (!mime || !table[mime]) {
    throw new BadRequestException(kind === "logo" ? "รองรับโลโก้ PNG / JPG / WEBP" : "รองรับฟอนต์ .ttf .otf .woff .woff2");
  }
  return mime;
}

/** a data URL (or bare base64) → bytes */
export function decodeDataUrl(data: string): Buffer {
  const b64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  if (!/^[A-Za-z0-9+/=\s]*$/.test(b64)) throw new BadRequestException("ไฟล์ไม่ถูกต้อง");
  return Buffer.from(b64, "base64");
}

/** a file name safe to show and to suggest on download */
export function cleanFileName(name: string, fallback: string): string {
  const n = String(name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim().slice(0, 80);
  return n || fallback;
}

@Injectable()
export class KitAssetStore {
  private readonly log = new Logger("KitAssets");
  private readonly root = resolve(process.env.UPLOAD_DIR ?? "./uploads", "kit-assets");

  /** stores the file (once per content) and returns its public path */
  async save(kind: KitAssetKind, buf: Buffer): Promise<{ url: string; mime: string; bytes: number; sha: string }> {
    const mime = validateKitAsset(kind, buf);
    const ext = (kind === "logo" ? LOGO_TYPES : FONT_TYPES)[mime];
    const sha = createHash("sha256").update(buf).digest("hex");
    const dir = join(this.root, kind === "logo" ? "logos" : "fonts");
    const file = join(dir, `${sha}.${ext}`);
    if (!resolve(file).startsWith(this.root)) throw new BadRequestException("เส้นทางไฟล์ไม่ถูกต้อง");
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(file, buf, { flag: "wx" }); // never overwrite: same name means same bytes
      this.log.log(`saved ${kind} ${sha.slice(0, 12)}.${ext} (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
    }
    return { url: `/uploads/kit-assets/${kind === "logo" ? "logos" : "fonts"}/${sha}.${ext}`, mime, bytes: buf.length, sha };
  }
}
