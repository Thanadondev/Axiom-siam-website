import { createWriteStream, promises as fs } from "fs";
import { dirname, resolve } from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import { S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Where the customer's print files live: the API's disk, or an S3-compatible
 * bucket (Cloudflare R2, AWS S3, MinIO). Keys look like "<user>/<file>.zip".
 *
 * The bucket is used when S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY
 * are all set (S3_ENDPOINT for R2 / MinIO, S3_REGION, default "auto");
 * otherwise the disk under UPLOAD_DIR/order-files. A stored file's DB path says
 * which ("s3:<key>" or "<key>"), so files saved on disk before the bucket was
 * set up keep working.
 */
export interface BlobStore {
  kind: "local" | "s3";
  /** stores the stream under the key; rejects (and keeps nothing) if the stream errors */
  putStream(key: string, body: Readable, contentType: string): Promise<void>;
  putBuffer(key: string, buf: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** how to hand it to a browser: a file to send, or a short-lived URL to redirect to */
  serve(key: string, opts: { downloadName?: string; contentType: string }): Promise<{ path: string } | { url: string }>;
}

/** keys are built from ids by us; still, nothing that could climb out of the folder */
const safeKey = (key: string) => {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9-]+(\.[a-z]+|-preview\.[a-z]+)$/.test(key)) throw new Error(`bad storage key: ${key}`);
  return key;
};

export class LocalStore implements BlobStore {
  kind = "local" as const;
  constructor(private root: string) {}
  private abs(key: string) { return resolve(this.root, safeKey(key)); }

  async putStream(key: string, body: Readable) {
    const abs = this.abs(key), part = `${abs}.part`;
    await fs.mkdir(dirname(abs), { recursive: true });
    try {
      await pipeline(body, createWriteStream(part));
      await fs.rename(part, abs);
    } catch (e) {
      await fs.rm(part, { force: true });
      throw e;
    }
  }
  async putBuffer(key: string, buf: Buffer) {
    const abs = this.abs(key);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
  }
  async remove(key: string) {
    const abs = this.abs(key);
    await fs.rm(abs, { force: true });
    await fs.rm(`${abs}.part`, { force: true });
  }
  async serve(key: string) { return { path: this.abs(key) }; }
}

export interface S3Config { bucket: string; region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string; prefix: string }

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3Config | null {
  const bucket = env.S3_BUCKET?.trim(), id = env.S3_ACCESS_KEY_ID?.trim(), secret = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !id || !secret) return null;
  return {
    bucket, accessKeyId: id, secretAccessKey: secret,
    region: env.S3_REGION?.trim() || "auto",
    endpoint: env.S3_ENDPOINT?.trim() || undefined,
    prefix: "order-files/",
  };
}

/** a short-lived link for the browser to fetch the file from the bucket directly */
export const S3_LINK_TTL_S = 10 * 60;

export class S3Store implements BlobStore {
  kind = "s3" as const;
  readonly client: S3Client;
  constructor(private cfg: S3Config, client?: S3Client) {
    this.client = client ?? new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      // R2 and MinIO address buckets by path; AWS works either way
      forcePathStyle: Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  private key(key: string) { return this.cfg.prefix + safeKey(key); }

  async putStream(key: string, body: Readable, contentType: string) {
    // multipart: a few hundred MB never sits in memory, parts go up as they arrive
    const up = new Upload({
      client: this.client,
      params: { Bucket: this.cfg.bucket, Key: this.key(key), Body: body, ContentType: contentType },
      partSize: 8 * 1024 * 1024,
      queueSize: 4,
      leavePartsOnError: false,
    });
    const stop = () => { void up.abort().catch(() => {}); };
    body.once("error", stop);
    try { await up.done(); } finally { body.off("error", stop); }
  }
  async putBuffer(key: string, buf: Buffer, contentType: string) {
    await new Upload({ client: this.client, params: { Bucket: this.cfg.bucket, Key: this.key(key), Body: buf, ContentType: contentType } }).done();
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(key) }));
  }
  async serve(key: string, opts: { downloadName?: string; contentType: string }) {
    const cmd = new GetObjectCommand({
      Bucket: this.cfg.bucket,
      Key: this.key(key),
      ResponseContentType: opts.contentType,
      ...(opts.downloadName ? { ResponseContentDisposition: contentDisposition(opts.downloadName) } : {}),
    });
    return { url: await getSignedUrl(this.client, cmd, { expiresIn: S3_LINK_TTL_S }) };
  }
}

/** attachment with the customer's name, Japanese and Thai included (RFC 6266 / 5987) */
export function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

/** "s3:<key>" for a file in the bucket, "<key>" for one on disk */
export const S3_PATH = "s3:";
export const pathFor = (store: BlobStore, key: string) => (store.kind === "s3" ? S3_PATH + key : key);
export const keyOf = (path: string) => (path.startsWith(S3_PATH) ? path.slice(S3_PATH.length) : path);
export const inBucket = (path: string) => path.startsWith(S3_PATH);
