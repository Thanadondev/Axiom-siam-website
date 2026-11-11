import { Injectable, Inject, Optional, BadRequestException, NotFoundException, PayloadTooLargeException, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { resolve } from "path";
import { PassThrough, Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../payments/storage.service";
import { cleanZipName, isZipStart, signOrderFileUrl } from "./order-file-link";
import { LocalStore, S3Store, s3ConfigFromEnv, pathFor, keyOf, inBucket, type BlobStore } from "./blob-store";

/** the biggest job in the factory's own folder was a 378 MB zip */
export const ORDER_ZIP_MAX_BYTES = 500 * 1024 * 1024;
/** a store handed in (tests); without one, the bucket from .env or the disk */
export const BLOB_STORE = Symbol("BLOB_STORE");
/** uploaded but never ordered: cleared after this long */
const ORPHAN_AFTER_MS = 7 * 24 * 60 * 60_000;

/**
 * The customer's print files (a .zip of Illustrator artwork) and the job's
 * picture. Stored by blob-store.ts: an S3-compatible bucket when one is set up
 * in .env (R2 / S3 / MinIO), otherwise UPLOAD_DIR/order-files on disk. Keys are
 * built from ids only, never from anything the customer sent. The zip is stored
 * as it came: the server never opens it (the factory's team does, in Illustrator).
 */
@Injectable()
export class OrderFilesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("OrderFiles");
  private sweep: NodeJS.Timeout | null = null;
  /** where new files go */
  readonly store: BlobStore;
  /** files saved on disk before a bucket was set up are still read from disk */
  private readonly disk: LocalStore;
  private readonly bucket: S3Store | null;

  constructor(private prisma: PrismaService, @Optional() @Inject(BLOB_STORE) store?: BlobStore) {
    this.disk = new LocalStore(resolve(process.env.UPLOAD_DIR ?? "./uploads", "order-files"));
    const s3 = s3ConfigFromEnv();
    this.bucket = store?.kind === "s3" ? (store as S3Store) : s3 ? new S3Store(s3) : null;
    this.store = store ?? this.bucket ?? this.disk;
  }

  onModuleInit() {
    this.log.log(this.store.kind === "s3" ? "print files go to the S3 bucket" : "print files go to disk (UPLOAD_DIR/order-files)");
    if (process.env.NODE_ENV === "test") return;
    const run = () => this.sweepOrphans().catch(e => this.log.warn(`sweep failed: ${e?.message ?? e}`));
    setTimeout(run, 60_000).unref?.();
    this.sweep = setInterval(run, 6 * 60 * 60_000);
    this.sweep.unref?.();
  }
  onModuleDestroy() { if (this.sweep) clearInterval(this.sweep); }

  /** the store a saved path lives in */
  private storeOf(path: string): BlobStore {
    if (!inBucket(path)) return this.store.kind === "local" ? this.store : this.disk;
    const s = this.store.kind === "s3" ? this.store : this.bucket;
    if (!s) throw new NotFoundException("ไฟล์นี้อยู่ใน S3 แต่ API ยังไม่ได้ตั้งค่า S3");
    return s;
  }

  /**
   * Streams the request body to storage: never the whole file in memory. It must be a zip
   * (by its first bytes, not its name or type) and at most ORDER_ZIP_MAX_BYTES.
   */
  async saveZip(userId: string, body: Readable, rawName: unknown, declaredBytes?: number) {
    if (declaredBytes !== undefined && declaredBytes > ORDER_ZIP_MAX_BYTES) throw new PayloadTooLargeException("ไฟล์ใหญ่เกิน 500 MB");
    const id = randomUUID();
    const key = `${userId.replace(/[^a-zA-Z0-9-]/g, "")}/${id}.zip`;

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
    // the checks run as the bytes go through; storage reads what passes
    const checked = new PassThrough();
    const [reading, writing] = await Promise.allSettled([
      pipeline(body, guard, checked),
      this.store.putStream(key, checked, "application/zip"),
    ]);
    const fail = async (e: unknown) => {
      await this.store.remove(key).catch(() => {});
      throw e;
    };
    if (reading.status === "rejected") {
      const e = reading.reason;
      return fail(e instanceof BadRequestException || e instanceof PayloadTooLargeException ? e : new BadRequestException("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง"));
    }
    if (writing.status === "rejected") {
      this.log.error(`storing ${key} failed: ${writing.reason?.message ?? writing.reason}`);
      return fail(new BadRequestException("บันทึกไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"));
    }
    if (!isZipStart(head) || bytes < 22) return fail(new BadRequestException("ไฟล์นี้ไม่ใช่ .zip"));
    if (declaredBytes !== undefined && declaredBytes !== bytes) return fail(new BadRequestException("ไฟล์มาไม่ครบ ลองอัปโหลดใหม่อีกครั้ง"));

    const row = await this.prisma.orderFile.create({
      data: { id, userId, name: cleanZipName(rawName), bytes, sha256: hash.digest("hex"), path: pathFor(this.store, key) },
      select: { id: true, name: true, bytes: true, createdAt: true },
    });
    this.log.log(`saved ${pathFor(this.store, key)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    return row;
  }

  /** the picture of the job (from the .jpg inside the zip, taken out by the browser) */
  async savePreview(userId: string, id: string, buf: Buffer) {
    const f = await this.prisma.orderFile.findFirst({ where: { id, userId }, select: { id: true, path: true, previewPath: true } });
    if (!f) throw new NotFoundException("ไม่พบไฟล์");
    const mime = StorageService.validate(buf);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : null;
    if (!ext) throw new BadRequestException("ภาพตัวอย่างต้องเป็น JPG, PNG หรือ WEBP");
    // beside its zip, in the same store
    const store = this.storeOf(f.path);
    const key = keyOf(f.path).replace(/\.zip$/, `-preview.${ext}`);
    await store.putBuffer(key, buf, mime);
    const path = pathFor(store, key);
    if (f.previewPath && f.previewPath !== path) await this.storeOf(f.previewPath).remove(keyOf(f.previewPath)).catch(() => {});
    await this.prisma.orderFile.update({ where: { id }, data: { previewPath: path } });
    return { id, preview: true };
  }

  /**
   * A job package the website built itself (a bib designed on the web: bibs/),
   * stored like an upload and attached to its order straight away, with its
   * order sheet as the picture.
   */
  async saveGenerated(userId: string, orderId: string, name: string, zip: Buffer, preview: Buffer) {
    if (!isZipStart(zip)) throw new Error("generated job is not a zip");
    const id = randomUUID();
    const key = `${userId.replace(/[^a-zA-Z0-9-]/g, "")}/${id}.zip`;
    await this.store.putBuffer(key, zip, "application/zip");
    const previewKey = key.replace(/\.zip$/, "-preview.jpg");
    await this.store.putBuffer(previewKey, preview, "image/jpeg");
    return this.prisma.orderFile.create({
      data: {
        id, userId, orderId, name: cleanZipName(name), bytes: zip.length,
        sha256: createHash("sha256").update(zip).digest("hex"),
        path: pathFor(this.store, key), previewPath: pathFor(this.store, previewKey),
      },
      select: { id: true, name: true, bytes: true, createdAt: true },
    });
  }

  /** a file and its picture, gone from storage and the order */
  async remove(id: string) {
    const f = await this.prisma.orderFile.findUnique({ where: { id }, select: { id: true, path: true, previewPath: true } });
    if (!f) return;
    for (const p of [f.path, f.previewPath]) if (p) await this.storeOf(p).remove(keyOf(p)).catch(e => this.log.warn(`couldn't remove ${p}: ${e?.message ?? e}`));
    await this.prisma.orderFile.delete({ where: { id } });
  }

  /** a stored file's bytes, wherever it lives (to copy into the job folder on the NAS) */
  openStored(path: string) {
    return this.storeOf(path).open(keyOf(path));
  }

  /** how to hand one part of a stored file to the browser that holds a valid signed link */
  async target(id: string, kind: "zip" | "preview") {
    const f = await this.prisma.orderFile.findUnique({ where: { id }, select: { id: true, name: true, path: true, previewPath: true } });
    const path = f && (kind === "zip" ? f.path : f.previewPath);
    if (!f || !path) throw new NotFoundException("ไม่พบไฟล์");
    const contentType = kind === "zip" ? "application/zip"
      : path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const how = await this.storeOf(path).serve(keyOf(path), { downloadName: kind === "zip" ? f.name : undefined, contentType });
    return { ...how, name: f.name, contentType };
  }

  /** files left behind by an upload that never became an order */
  async sweepOrphans(now = Date.now()) {
    const old = await this.prisma.orderFile.findMany({
      where: { orderId: null, createdAt: { lt: new Date(now - ORPHAN_AFTER_MS) } },
      select: { id: true, path: true, previewPath: true },
      take: 200,
    });
    for (const f of old) {
      for (const p of [f.path, f.previewPath]) if (p) await this.storeOf(p).remove(keyOf(p)).catch(e => this.log.warn(`couldn't remove ${p}: ${e?.message ?? e}`));
      await this.prisma.orderFile.delete({ where: { id: f.id } });
    }
    if (old.length) this.log.log(`cleared ${old.length} upload(s) that never became an order`);
    return old.length;
  }
}

/** what an order shows of its files: name, size and signed links */
export function orderFileView(
  f: { id: string; name: string; bytes: number; createdAt: Date; previewPath: string | null; nasPath?: string | null; nasAt?: Date | null },
  now = Date.now(),
  admin = false,
) {
  return {
    // for the team: where the copy sits in the job folders on the NAS (relative to NAS_JOBS_DIR)
    ...(admin ? { nas: f.nasPath ? { path: f.nasPath, at: f.nasAt ?? null } : null } : {}),
    id: f.id,
    name: f.name,
    bytes: f.bytes,
    createdAt: f.createdAt,
    downloadUrl: signOrderFileUrl(f.id, "zip", now),
    previewUrl: f.previewPath ? signOrderFileUrl(f.id, "preview", now) : null,
  };
}
