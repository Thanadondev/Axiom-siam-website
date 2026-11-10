import { Injectable, BadRequestException, NotFoundException, PayloadTooLargeException, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import { join, resolve } from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../payments/storage.service";
import { cleanZipName, isZipStart, signOrderFileUrl } from "./order-file-link";

/** the biggest job in the factory's own folder was a 378 MB zip */
export const ORDER_ZIP_MAX_BYTES = 500 * 1024 * 1024;
/** uploaded but never ordered: cleared after this long */
const ORPHAN_AFTER_MS = 7 * 24 * 60 * 60_000;

/**
 * The customer's print files (a .zip of Illustrator artwork) on disk, under
 * UPLOAD_DIR/order-files/<user>/<file id>.zip — paths are built from ids only,
 * never from anything the customer sent. The zip is stored as it came: the
 * server never opens it (the factory's team does, in Illustrator).
 */
@Injectable()
export class OrderFilesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("OrderFiles");
  private readonly root = resolve(process.env.UPLOAD_DIR ?? "./uploads", "order-files");
  private sweep: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    const run = () => this.sweepOrphans().catch(e => this.log.warn(`sweep failed: ${e?.message ?? e}`));
    setTimeout(run, 60_000).unref?.();
    this.sweep = setInterval(run, 6 * 60 * 60_000);
    this.sweep.unref?.();
  }
  onModuleDestroy() { if (this.sweep) clearInterval(this.sweep); }

  private dirFor(userId: string) {
    const dir = join(this.root, userId.replace(/[^a-zA-Z0-9-]/g, ""));
    if (!resolve(dir).startsWith(this.root)) throw new BadRequestException("เส้นทางไฟล์ไม่ถูกต้อง");
    return dir;
  }

  /** the absolute path of a stored file (paths in the DB are relative to the root) */
  abs(rel: string): string | null {
    const p = resolve(this.root, rel);
    return p.startsWith(this.root + "/") || p.startsWith(this.root + "\\") ? p : null;
  }

  /**
   * Streams the request body to disk: never the whole file in memory. It must be a zip
   * (by its first bytes, not its name or type) and at most ORDER_ZIP_MAX_BYTES.
   */
  async saveZip(userId: string, body: Readable, rawName: unknown, declaredBytes?: number) {
    if (declaredBytes !== undefined && declaredBytes > ORDER_ZIP_MAX_BYTES) throw new PayloadTooLargeException("ไฟล์ใหญ่เกิน 500 MB");
    const id = randomUUID();
    const dir = this.dirFor(userId);
    await fs.mkdir(dir, { recursive: true });
    const part = join(dir, `${id}.part`);

    let bytes = 0;
    let head = Buffer.alloc(0);
    const hash = createHash("sha256");
    const guard = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > ORDER_ZIP_MAX_BYTES) return cb(new PayloadTooLargeException("ไฟล์ใหญ่เกิน 500 MB"));
        if (head.length < 4) {
          head = Buffer.concat([head, chunk.subarray(0, 4 - head.length)]);
          if (head.length === 4 && !isZipStart(head)) return cb(new BadRequestException("ไฟล์นี้ไม่ใช่ .zip"));
        }
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try {
      await pipeline(body, guard, createWriteStream(part));
    } catch (e) {
      await fs.rm(part, { force: true });
      throw e instanceof BadRequestException || e instanceof PayloadTooLargeException ? e : new BadRequestException("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
    if (!isZipStart(head) || bytes < 22) {
      await fs.rm(part, { force: true });
      throw new BadRequestException("ไฟล์นี้ไม่ใช่ .zip");
    }
    if (declaredBytes !== undefined && declaredBytes !== bytes) {
      await fs.rm(part, { force: true });
      throw new BadRequestException("ไฟล์มาไม่ครบ ลองอัปโหลดใหม่อีกครั้ง");
    }
    const rel = `${dir.slice(this.root.length + 1)}/${id}.zip`.replace(/\\/g, "/");
    await fs.rename(part, join(this.root, rel));

    const row = await this.prisma.orderFile.create({
      data: { id, userId, name: cleanZipName(rawName), bytes, sha256: hash.digest("hex"), path: rel },
      select: { id: true, name: true, bytes: true, createdAt: true },
    });
    this.log.log(`saved ${rel} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    return row;
  }

  /** the picture of the job (from the .jpg inside the zip, taken out by the browser) */
  async savePreview(userId: string, id: string, buf: Buffer) {
    const f = await this.prisma.orderFile.findFirst({ where: { id, userId }, select: { id: true, path: true, previewPath: true } });
    if (!f) throw new NotFoundException("ไม่พบไฟล์");
    const mime = StorageService.validate(buf);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : null;
    if (!ext) throw new BadRequestException("ภาพตัวอย่างต้องเป็น JPG, PNG หรือ WEBP");
    const rel = f.path.replace(/\.zip$/, `-preview.${ext}`);
    const abs = this.abs(rel);
    if (!abs) throw new BadRequestException("เส้นทางไฟล์ไม่ถูกต้อง");
    await fs.writeFile(abs, buf);
    if (f.previewPath && f.previewPath !== rel) { const old = this.abs(f.previewPath); if (old) await fs.rm(old, { force: true }); }
    await this.prisma.orderFile.update({ where: { id }, data: { previewPath: rel } });
    return { id, preview: true };
  }

  /** a stored file's row, for serving a signed link */
  find(id: string) {
    return this.prisma.orderFile.findUnique({ where: { id }, select: { id: true, name: true, path: true, previewPath: true } });
  }

  /** files left behind by an upload that never became an order */
  async sweepOrphans(now = Date.now()) {
    const old = await this.prisma.orderFile.findMany({
      where: { orderId: null, createdAt: { lt: new Date(now - ORPHAN_AFTER_MS) } },
      select: { id: true, path: true, previewPath: true },
      take: 200,
    });
    for (const f of old) {
      for (const rel of [f.path, f.previewPath]) { const p = rel && this.abs(rel); if (p) await fs.rm(p, { force: true }); }
      await this.prisma.orderFile.delete({ where: { id: f.id } });
    }
    if (old.length) this.log.log(`cleared ${old.length} upload(s) that never became an order`);
    return old.length;
  }
}

/** what an order shows of its files: name, size and signed links */
export function orderFileView(f: { id: string; name: string; bytes: number; createdAt: Date; previewPath: string | null }, now = Date.now()) {
  return {
    id: f.id,
    name: f.name,
    bytes: f.bytes,
    createdAt: f.createdAt,
    downloadUrl: signOrderFileUrl(f.id, "zip", now),
    previewUrl: f.previewPath ? signOrderFileUrl(f.id, "preview", now) : null,
  };
}
