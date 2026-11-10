import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { sizeLabel, safeName, jobFolderName } from "./nas-export";

describe("a job folder's name, the way the team names them", () => {
  it("sizes run together, XL apart: (SML XL), (ML), (L)", () => {
    expect(sizeLabel(["M", "L"])).toBe("ML");
    expect(sizeLabel(["XL", "S", "L", "M"])).toBe("SML XL");
    expect(sizeLabel(["L"])).toBe("L");
    expect(sizeLabel(["XL"])).toBe("XL");
  });

  it("web order, product, sizes, team", () => {
    expect(jobFolderName({ orderNo: "AX-261110-6U5T", product: "bib_r", sizes: ["M", "L"], team: "J-Field Axis" })).toBe("AX-261110-6U5T R-bib (ML) J-Field Axis");
    expect(jobFolderName({ orderNo: "AX-1", product: "bib_n", sizes: ["S", "M", "L", "XL"], team: "長和町MBC" })).toBe("AX-1 N-bib (SML XL) 長和町MBC");
    expect(jobFolderName({ orderNo: "AX-2", product: null, sizes: [], team: null })).toBe("AX-2");
  });

  it("nothing Windows or the NAS refuses: no \\ / : * ? \" < > |, no trailing dot or space", () => {
    expect(safeName('FC "Tokyo" A/B: 2026?')).toBe("FC Tokyo A B 2026");
    expect(safeName("team. ")).toBe("team");
    expect(safeName("..\\..\\etc")).toBe("..   ..  etc".replace(/\s+/g, " "));
    expect(safeName("a".repeat(300))).toHaveLength(120);
  });
});

describe("copying a paid order's zip into its job folder on the NAS", () => {
  let up: string, nas: string;
  let OrderFilesService: typeof import("./order-files.service").OrderFilesService;
  let NasExportService: typeof import("./nas-export").NasExportService;
  let files: any[], order: any;
  const pick = (row: any, select?: any) => (select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : row);
  const prisma: any = {
    orderFile: {
      create: async ({ data, select }: any) => { const r = { ...data, orderId: null, previewPath: null, nasPath: null, nasAt: null, createdAt: new Date() }; files.push(r); return pick(r, select); },
      findMany: async ({ where }: any) => files.filter(f => f.nasAt === null && f.orderId && where.order.status.in.includes(order.status)).map(f => ({ orderId: f.orderId })),
      update: async ({ where, data }: any) => Object.assign(files.find(f => f.id === where.id), data),
    },
    order: {
      findUnique: async ({ where }: any) => where.id !== order.id ? null : ({
        orderNo: order.orderNo, status: order.status, user: order.user, items: order.items,
        files: files.filter(f => f.orderId === order.id).map(f => ({ id: f.id, name: f.name, path: f.path, nasAt: f.nasAt, nasPath: f.nasPath })),
      }),
    },
  };
  const zip = (n = 50_000) => { const b = Buffer.alloc(n, 7); b.write("PK\u0003\u0004", 0, "latin1"); return b; };

  beforeAll(async () => {
    up = mkdtempSync(join(tmpdir(), "axiom-up-"));
    nas = mkdtempSync(join(tmpdir(), "axiom-nas-"));
    process.env.UPLOAD_DIR = up;
    process.env.NAS_JOBS_DIR = join(nas, "_webjobs");
    ({ OrderFilesService } = await import("./order-files.service"));
    ({ NasExportService } = await import("./nas-export"));
  });
  afterAll(() => { rmSync(up, { recursive: true, force: true }); rmSync(nas, { recursive: true, force: true }); delete process.env.NAS_JOBS_DIR; });
  beforeEach(() => {
    files = [];
    order = {
      id: "o-1", orderNo: "AX-261110-6U5T", status: "paid",
      user: { fullName: "Taro", companyName: "J-Field Axis" },
      items: [{ size: "M", qty: 10, designSnapshot: { kind: "file-order", product: "bib_r" } }, { size: "L", qty: 5, designSnapshot: {} }],
    };
    rmSync(join(nas, "_webjobs"), { recursive: true, force: true });
    mkdirSync(join(nas, "_webjobs"));
  });

  async function upload(name: string) {
    const store = new OrderFilesService(prisma);
    const body = zip();
    const row = await store.saveZip("11111111-1111-4111-8111-111111111111", Readable.from([body]), encodeURIComponent(name));
    files.find(f => f.id === row.id).orderId = order.id;
    return { store, body, id: row.id };
  }

  it("puts the zip, as it came, in '<order> <product> (<sizes>) <team>' — and only once", async () => {
    const { store, body, id } = await upload("HF-100 (N) 4379 J-Field Axis R bib (ML).zip");
    const nasSvc = new NasExportService(prisma, store);
    const r = await nasSvc.exportOrder(order.id);
    expect(r).toEqual({ ok: true, folder: "AX-261110-6U5T R-bib (ML) J-Field Axis", copied: 1 });
    const dir = join(nas, "_webjobs", "AX-261110-6U5T R-bib (ML) J-Field Axis");
    expect(readdirSync(dir)).toEqual(["HF-100 (N) 4379 J-Field Axis R bib (ML).zip"]); // no .part left, nothing else
    expect(readFileSync(join(dir, "HF-100 (N) 4379 J-Field Axis R bib (ML).zip")).equals(body)).toBe(true);
    expect(files.find(f => f.id === id)).toMatchObject({ nasPath: join("AX-261110-6U5T R-bib (ML) J-Field Axis", "HF-100 (N) 4379 J-Field Axis R bib (ML).zip") });
    expect(files.find(f => f.id === id).nasAt).toBeInstanceOf(Date);
    // again (the button, or the sweep): nothing new
    expect(await nasSvc.exportOrder(order.id)).toMatchObject({ ok: true, copied: 0 });
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it("not before it's paid, and not when the NAS can't be reached — then the next sweep does it", async () => {
    const { store, id } = await upload("job.zip");
    const nasSvc = new NasExportService(prisma, store);
    order.status = "pending";
    expect(await nasSvc.exportOrder(order.id)).toEqual({ ok: false, error: "ออเดอร์นี้ยังไม่ชำระเงิน" });
    expect(await nasSvc.sweep()).toEqual({ copied: 0, failed: 0 });

    order.status = "paid";
    rmSync(join(nas, "_webjobs"), { recursive: true, force: true }); // the share isn't there
    const away = await nasSvc.exportOrder(order.id);
    expect(away.ok).toBe(false);
    expect((away as any).error).toMatch(/เข้าถึง .*_webjobs ไม่ได้/);
    expect(existsSync(join(nas, "_webjobs"))).toBe(false); // never creates the share itself
    expect(files.find(f => f.id === id).nasAt).toBeNull();

    mkdirSync(join(nas, "_webjobs")); // back
    expect(await nasSvc.sweep()).toEqual({ copied: 1, failed: 0 });
    expect(files.find(f => f.id === id).nasAt).toBeInstanceOf(Date);
    expect(await nasSvc.sweep()).toEqual({ copied: 0, failed: 0 });
  });
});
