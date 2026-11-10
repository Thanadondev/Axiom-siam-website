import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Readable } from "stream";
import { createHash } from "crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { S3Store, contentDisposition, keyOf } from "./blob-store";

/**
 * Against a real S3-compatible server. Runs only when one is given, e.g. Adobe S3Mock:
 *   docker run -d -p 9190:9090 -e initialBuckets=axiom-order-files-test adobe/s3mock:4.10.0
 *   S3_TEST_ENDPOINT=http://localhost:9190 S3_TEST_BUCKET=axiom-order-files-test npx vitest run src/orders/blob-store.s3.spec.ts
 */
const ENDPOINT = process.env.S3_TEST_ENDPOINT;
const BUCKET = process.env.S3_TEST_BUCKET ?? "axiom-order-files-test";
const USER = "11111111-1111-4111-8111-111111111111";

const store = ENDPOINT
  ? new S3Store({ bucket: BUCKET, region: "us-east-1", endpoint: ENDPOINT, accessKeyId: process.env.S3_TEST_KEY ?? "test", secretAccessKey: process.env.S3_TEST_SECRET ?? "test", prefix: "order-files/" })
  : null;
const exists = async (key: string) => store!.client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: `order-files/${key}` })).then(() => true, () => false);
const objects = async (prefix: string) => ((await store!.client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `order-files/${prefix}` }))).Contents ?? []).map(o => o.Key);
/** a stream of `mb` megabytes, a chunk at a time, starting like a zip */
function zipStream(mb: number, failAt?: number) {
  let sent = 0;
  const hash = createHash("sha256");
  const s = new Readable({
    read() {
      if (failAt !== undefined && sent >= failAt * 1024 * 1024) { this.destroy(new Error("connection dropped")); return; }
      if (sent >= mb * 1024 * 1024) { this.push(null); return; }
      const c = Buffer.alloc(1024 * 1024, sent / (1024 * 1024));
      if (sent === 0) c.write("PK\u0003\u0004", 0, "latin1");
      hash.update(c); sent += c.length; this.push(c);
    },
  });
  return { s, sha: () => hash.digest("hex") };
}

describe.skipIf(!ENDPOINT)("print files in an S3 bucket", () => {
  it("a 25 MB zip goes up in parts and comes back byte for byte by a short-lived link, under the customer's name", async () => {
    const key = `${USER}/aaaaaaaa-0000-4000-8000-000000000001.zip`;
    const z = zipStream(25);
    await store!.putStream(key, z.s, "application/zip");
    const want = z.sha();
    const t = await store!.serve(key, { downloadName: "HF-181 長和町MBC R BIb.zip", contentType: "application/zip" });
    expect("url" in t).toBe(true);
    const res = await fetch((t as { url: string }).url);
    expect(res.status).toBe(200);
    expect(createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex")).toBe(want);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''HF-181%20%E9%95%B7%E5%92%8C%E7%94%BAMBC%20R%20BIb.zip");
    await store!.remove(key);
    expect(await exists(key)).toBe(false);
  }, 120_000);

  it("an upload cut off half way leaves nothing in the bucket", async () => {
    const key = `${USER}/aaaaaaaa-0000-4000-8000-000000000002.zip`;
    await expect(store!.putStream(key, zipStream(30, 12).s, "application/zip")).rejects.toThrow();
    expect(await exists(key)).toBe(false);
  }, 120_000);
});

describe.skipIf(!ENDPOINT)("ordering with a zip, stored in the bucket", () => {
  let dir: string;
  let OrderFilesService: typeof import("./order-files.service").OrderFilesService;
  let files: any[] = [];
  const pick = (row: any, select?: any) => (select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : row);
  const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
  const prisma: any = {
    orderFile: {
      create: async ({ data, select }: any) => { const r = { ...data, orderId: null, previewPath: null, createdAt: new Date() }; files.push(r); return pick(r, select); },
      findFirst: async ({ where, select }: any) => { const r = files.find(f => match(f, where)); return r ? pick(r, select) : null; },
      findUnique: async ({ where, select }: any) => { const r = files.find(f => f.id === where.id); return r ? pick(r, select) : null; },
      findMany: async ({ where }: any) => files.filter(f => f.orderId === where.orderId && f.createdAt < where.createdAt.lt),
      update: async ({ where, data }: any) => Object.assign(files.find(f => f.id === where.id), data),
      delete: async ({ where }: any) => { files = files.filter(f => f.id !== where.id); },
    },
  };
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "axiom-s3-"));
    process.env.UPLOAD_DIR = dir;
    ({ OrderFilesService } = await import("./order-files.service"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("saves to the bucket (path s3:…), keeps the picture beside it, serves both by redirect, refuses a non-zip without leaving anything", async () => {
    const svc = new OrderFilesService(prisma, store!);
    const z = zipStream(3);
    const row = await svc.saveZip(USER, z.s, encodeURIComponent("チーム.zip"));
    const saved = files.find(f => f.id === row.id);
    expect(saved.path).toBe(`s3:${USER}/${row.id}.zip`);
    expect(await exists(keyOf(saved.path))).toBe(true);

    await svc.savePreview(USER, row.id, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]));
    expect(saved.previewPath).toBe(`s3:${USER}/${row.id}-preview.jpg`);
    const pic = await svc.target(row.id, "preview");
    expect("url" in pic).toBe(true);
    const img = await fetch((pic as any).url);
    expect([...new Uint8Array(await img.arrayBuffer()).slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

    const before = (await objects(USER)).length;
    await expect(svc.saveZip(USER, Readable.from([Buffer.from("%PDF-1.7 not a zip".repeat(100))]), "x.zip")).rejects.toThrow(/ไม่ใช่ .zip/);
    expect((await objects(USER)).length).toBe(before);

    // a week later, never ordered: gone from the bucket too
    expect(await svc.sweepOrphans(Date.now() + 8 * 24 * 60 * 60_000)).toBe(1);
    expect(await objects(USER)).toEqual([]);
  }, 120_000);

  it("a file saved on disk before the bucket was set up is still served from disk", async () => {
    const svc = new OrderFilesService(prisma, store!);
    const id = "bbbbbbbb-0000-4000-8000-000000000003";
    mkdirSync(join(dir, "order-files", USER), { recursive: true });
    writeFileSync(join(dir, "order-files", USER, `${id}.zip`), Buffer.from("PK\u0003\u0004 old"));
    files.push({ id, userId: USER, orderId: "o-1", name: "old.zip", bytes: 8, sha256: "x", path: `${USER}/${id}.zip`, previewPath: null, createdAt: new Date() });
    const t = await svc.target(id, "zip");
    expect(t).toMatchObject({ path: join(dir, "order-files", USER, `${id}.zip`), name: "old.zip" });
  });
});

describe("the name a download gets", () => {
  it("keeps Japanese and Thai for browsers that read filename*, with a plain fallback", () => {
    expect(contentDisposition("งาน ทีม.zip")).toBe(`attachment; filename="___ ___.zip"; filename*=UTF-8''%E0%B8%87%E0%B8%B2%E0%B8%99%20%E0%B8%97%E0%B8%B5%E0%B8%A1.zip`);
    expect(contentDisposition('a"b.zip')).toBe(`attachment; filename="a_b.zip"; filename*=UTF-8''a%22b.zip`);
  });
});
