import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { createHash } from "crypto";

/** a customer uploads their print-file zip, then orders bibs with it */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADDR = "33333333-3333-4333-8333-333333333333";
let dir: string;
let OrderFilesService: typeof import("./order-files.service").OrderFilesService;
let orderFileView: typeof import("./order-files.service").orderFileView;
let OrdersService: typeof import("./orders.service").OrdersService;
let CreateOrderSchema: typeof import("./orders.dto").CreateOrderSchema;

// an in-memory stand-in for the two tables these touch
let files: any[] = [];
let orders: any[] = [];
let rosterRows: any[] = [];
const prisma: any = {
  orderFile: {
    create: async ({ data, select }: any) => { const row = { orderId: null, previewPath: null, ...data, createdAt: new Date() }; files.push(row); return pick(row, select); },
    findFirst: async ({ where, select }: any) => { const r = files.find(f => match(f, where)); return r ? pick(r, select) : null; },
    findUnique: async ({ where, select }: any) => { const r = files.find(f => f.id === where.id); return r ? pick(r, select) : null; },
    findMany: async ({ where }: any) => files.filter(f => f.orderId === where.orderId && f.createdAt < where.createdAt.lt),
    update: async ({ where, data }: any) => Object.assign(files.find(f => f.id === where.id), data),
    updateMany: async ({ where, data }: any) => { const hit = files.filter(f => match(f, where)); hit.forEach(f => Object.assign(f, data)); return { count: hit.length }; },
    delete: async ({ where }: any) => { files = files.filter(f => f.id !== where.id); },
  },
  address: { findFirst: async ({ where }: any) => (where.id === ADDR && where.userId === USER ? { id: ADDR } : null) },
  design: { findFirst: async () => null },
  order: {
    create: async ({ data }: any) => { const o = { id: `order-${orders.length + 1}`, orderNo: `AX-TEST-${orders.length + 1}`, createdAt: new Date(2026, 10, 11), ...data, items: data.items.create.map((i: any, k: number) => ({ id: `item-${k}`, ...i })) }; orders.push(o); return o; },
    findUnique: async ({ where }: any) => { const o = orders.find(x => x.id === where.id); return o ? { ...o, files: files.filter(f => f.orderId === o.id) } : null; },
  },
  orderRoster: { createMany: async ({ data }: any) => { rosterRows.push(...data); return { count: data.length }; } },
  $transaction: async (fn: any) => fn(prisma),
};
const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
const pick = (row: any, select?: any) => (select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : row);
let agentCfg = { agentEnabled: true, agentName: "Axiom Japan (Osaka)", agentAddress: "1-2-3 Namba, Osaka", agentPhone: "+81 6 0000 0000", agentFee: 400 };
const settings: any = { pricing: async () => (await import("./pricing")).DEFAULT_PRICING, delivery: async () => agentCfg };
const notify: any = { pushAdmins: async () => {} };

const zip = (bytes = 2048) => { const b = Buffer.alloc(bytes, 7); b.write("PK\u0003\u0004", 0, "latin1"); return b; };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
// a file order sends no fabric or trim: a bib has neither
const order = (over: Record<string, unknown> = {}) =>
  ({ lines: [{ size: "M", qty: 10 }, { size: "L", qty: 5 }], shippingAddressId: ADDR, ...over }) as any;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "axiom-order-files-"));
  process.env.UPLOAD_DIR = dir;
  ({ OrderFilesService, orderFileView } = await import("./order-files.service"));
  ({ OrdersService } = await import("./orders.service"));
  ({ CreateOrderSchema } = await import("./orders.dto"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => { files = []; orders = []; rosterRows = []; });

describe("uploading the zip", () => {
  it("streams it to disk under the customer's folder, named by id, with its size and sha256", async () => {
    const store = new OrderFilesService(prisma);
    const body = zip(300_000);
    const row = await store.saveZip(USER, Readable.from([body.subarray(0, 1000), body.subarray(1000)]), encodeURIComponent("HF-100 (N) 4379 J-Field Axis R bib (ML).zip"), body.length);
    expect(row).toMatchObject({ name: "HF-100 (N) 4379 J-Field Axis R bib (ML).zip", bytes: 300_000 });
    const saved = files[0];
    expect(saved.path).toBe(`${USER}/${row.id}.zip`);
    expect(saved.sha256).toBe(createHash("sha256").update(body).digest("hex"));
    expect(readFileSync(join(dir, "order-files", saved.path)).equals(body)).toBe(true);
    expect(existsSync(join(dir, "order-files", USER, `${row.id}.part`))).toBe(false);
  });

  it("refuses what isn't a zip, a file that arrives short, and anything over 500 MB — and leaves nothing behind", async () => {
    const store = new OrderFilesService(prisma);
    await expect(store.saveZip(USER, Readable.from([Buffer.from("%PDF-1.7 an Illustrator file")]), "x.zip")).rejects.toThrow(/ไม่ใช่ .zip/);
    await expect(store.saveZip(USER, Readable.from([zip(5000)]), "x.zip", 9000)).rejects.toThrow(/มาไม่ครบ/);
    await expect(store.saveZip(USER, Readable.from([zip()]), "x.zip", 600 * 1024 * 1024)).rejects.toThrow(/500 MB/);
    expect(files).toHaveLength(0);
    const left = existsSync(join(dir, "order-files", USER)) ? require("fs").readdirSync(join(dir, "order-files", USER)).filter((n: string) => n.endsWith(".part")) : [];
    expect(left).toEqual([]);
  });

  it("keeps a picture of the job, only for its owner, and only a real image", async () => {
    const store = new OrderFilesService(prisma);
    const row = await store.saveZip(USER, Readable.from([zip()]), "a.zip");
    await expect(store.savePreview(OTHER, row.id, JPEG)).rejects.toThrow(/ไม่พบไฟล์/);
    await expect(store.savePreview(USER, row.id, Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow();
    await store.savePreview(USER, row.id, JPEG);
    expect(files[0].previewPath).toBe(`${USER}/${row.id}-preview.jpg`);
    expect(orderFileView({ ...files[0] }).previewUrl).toMatch(new RegExp(`^/api/v1/order-files/${row.id}/preview\\?exp=\\d+&sig=`));
  });

  it("clears uploads that never became an order after a week, and keeps ordered ones", async () => {
    const store = new OrderFilesService(prisma);
    const a = await store.saveZip(USER, Readable.from([zip()]), "a.zip");
    const b = await store.saveZip(USER, Readable.from([zip()]), "b.zip");
    files.find(f => f.id === b.id).orderId = "order-x";
    const later = Date.now() + 8 * 24 * 60 * 60_000;
    expect(await store.sweepOrphans(later)).toBe(1);
    expect(files.map(f => f.id)).toEqual([b.id]);
    expect(existsSync(join(dir, "order-files", USER, `${a.id}.zip`))).toBe(false);
    expect(existsSync(join(dir, "order-files", USER, `${b.id}.zip`))).toBe(true);
  });
});

describe("ordering bibs with the zip", () => {
  it("the order asks for both the zip and what it's for, and not a web design as well", () => {
    expect(CreateOrderSchema.safeParse(order({ fileId: "44444444-4444-4444-8444-444444444444" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse(order({ product: "bib_r" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse(order({ fileId: "44444444-4444-4444-8444-444444444444", product: "bib_r", designId: "55555555-5555-4555-8555-555555555555" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse(order({ fileId: "44444444-4444-4444-8444-444444444444", product: "bib_x" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse(order({ fileId: "44444444-4444-4444-8444-444444444444", product: "bib_n" })).success).toBe(true);
  });

  it("a design made on the web still has to say its fabric and trim", () => {
    expect(CreateOrderSchema.safeParse(order()).success).toBe(false);
    expect(CreateOrderSchema.safeParse(order({ fabric: "mesh" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse(order({ fabric: "mesh", trim: "none" })).success).toBe(true);
  });

  it("prices it at the bib's set price, records the file on the order, and claims the zip", async () => {
    const store = new OrderFilesService(prisma);
    const up = await store.saveZip(USER, Readable.from([zip()]), "HF-424 R bibs.zip");
    const svc = new OrdersService(prisma, settings, notify);
    const res = await svc.create(USER, order({ fileId: up.id, product: "bib_r" }));
    expect(res.breakdown).toMatchObject({ unitPrice: 245, subtotal: 245 * 15, garment: "bib_r" });
    const o = orders[0];
    expect(o.fabricSummary).toBe("R-bib (2 ด้าน) · ไฟล์ลูกค้า");
    expect(o.items[0].designSnapshot).toEqual({ kind: "file-order", product: "bib_r", fileId: up.id, fileName: "HF-424 R bibs.zip" });
    expect(files[0].orderId).toBe(o.id);
  });

  it("to the agent in Japan: no address, the agent's fee, and the agent kept on the order as it was", async () => {
    const store = new OrderFilesService(prisma);
    const up = await store.saveZip(USER, Readable.from([zip()]), "jp.zip");
    const svc = new OrdersService(prisma, settings, notify);
    const res = await svc.create(USER, order({ fileId: up.id, product: "bib_r", delivery: "agent", shippingAddressId: undefined }));
    expect(res.breakdown).toMatchObject({ subtotal: 245 * 15, shippingFee: 400, total: 245 * 15 + 400 });
    const o = orders[0];
    expect(o.shippingAddressId).toBeNull();
    expect(o.delivery).toEqual({ mode: "agent", name: "Axiom Japan (Osaka)", address: "1-2-3 Namba, Osaka", phone: "+81 6 0000 0000" });
    expect(o.statusHistory.create.note).toMatch(/ส่งรวมผ่านตัวแทนญี่ปุ่น \(Axiom Japan \(Osaka\)\)/);
  });

  it("the agent option only exists when it's set up, and only for orders by file", async () => {
    agentCfg = { ...agentCfg, agentEnabled: false };
    const store = new OrderFilesService(prisma);
    const up = await store.saveZip(USER, Readable.from([zip()]), "jp.zip");
    const svc = new OrdersService(prisma, settings, notify);
    await expect(svc.create(USER, order({ fileId: up.id, product: "bib_r", delivery: "agent", shippingAddressId: undefined }))).rejects.toThrow(/ยังไม่เปิดส่งผ่านตัวแทน/);
    expect(await svc.deliveryOptions()).toEqual({ agent: null });
    agentCfg = { ...agentCfg, agentEnabled: true };
    expect(await svc.deliveryOptions()).toEqual({ agent: { name: "Axiom Japan (Osaka)", fee: 400 } });
    expect(CreateOrderSchema.safeParse(order({ fabric: "mesh", trim: "none", delivery: "agent", shippingAddressId: undefined })).success).toBe(false); // a web design
    expect(CreateOrderSchema.safeParse(order({ fileId: "44444444-4444-4444-8444-444444444444", product: "bib_n", shippingAddressId: undefined })).success).toBe(false); // no address, no agent
    expect(CreateOrderSchema.safeParse(order({ fileId: "44444444-4444-4444-8444-444444444444", product: "bib_n", delivery: "agent", shippingAddressId: undefined })).success).toBe(true);
  });

  it("someone else's zip, or one already on an order, can't be used", async () => {
    const store = new OrderFilesService(prisma);
    const up = await store.saveZip(OTHER, Readable.from([zip()]), "theirs.zip");
    const svc = new OrdersService(prisma, settings, notify);
    await expect(svc.create(USER, order({ fileId: up.id, product: "bib_n" }))).rejects.toThrow(/ไม่พบไฟล์ที่อัปโหลด/);
    const mine = await store.saveZip(USER, Readable.from([zip()]), "mine.zip");
    await svc.create(USER, order({ fileId: mine.id, product: "bib_n" }));
    await expect(svc.create(USER, order({ fileId: mine.id, product: "bib_n" }))).rejects.toThrow(/ใช้กับออเดอร์อื่นไปแล้ว/);
    expect(orders).toHaveLength(1);
  });
});

describe("ordering bibs designed on the web", () => {
  // a 2×2 PNG, stored where the kit studio's upload puts logos
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEIGBkZGBgYAEUUA/0nH5SQAAAAAElFTkSuQmCC", "base64");
  const SHA = "a".repeat(64);
  const side = (body: string, rib = true) => ({ body, ink: "#fff200", inkOutline: "#2e3192", ...(rib ? { rib: { neck: "#231f20", arm: "#231f20", hem: "#231f20" } } : {}) });
  const bib = (over: Record<string, unknown> = {}) => ({
    product: "bib_r", team: "SAGINUMA FC", sides: [side("#662d91"), side("#ffffff", false)],
    roster: [{ name: "TAICHI", number: "48", size: "M" }, { name: "SORA", number: "2", size: "M" }, { name: "SHUN", number: "1", size: "XXL" }],
    ...over,
  });
  const webOrder = (over: Record<string, unknown> = {}) => ({ bib: bib(), shippingAddressId: ADDR, ...over }) as any;
  const services = async () => {
    const { BibJobService } = await import("../bibs/bib-jobs.service");
    const store = new OrderFilesService(prisma);
    const bibs = new BibJobService(prisma, store);
    return { store, bibs, svc: new OrdersService(prisma, settings, notify, undefined, bibs) };
  };

  it("the order takes the design instead of lines, fabric and trim; not with a zip as well", () => {
    expect(CreateOrderSchema.safeParse(webOrder()).success).toBe(true);
    expect(CreateOrderSchema.safeParse(webOrder({ delivery: "agent", shippingAddressId: undefined })).success).toBe(true);
    expect(CreateOrderSchema.safeParse(webOrder({ fileId: "44444444-4444-4444-8444-444444444444", product: "bib_r" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse(webOrder({ bib: bib({ sides: [side("#662d91")] }) })).success).toBe(false); // R-bib: two sides
    expect(CreateOrderSchema.safeParse(webOrder({ logoUrl: "/uploads/../../etc/passwd" })).success).toBe(false);
    expect(CreateOrderSchema.safeParse({ shippingAddressId: ADDR, fabric: "mesh", trim: "none" }).success).toBe(false); // no lines, no design
  });

  it("counts the bibs from the name list, prices them as bibs, and attaches the print files it builds", async () => {
    const { svc } = await services();
    const res = await svc.create(USER, CreateOrderSchema.parse(webOrder()));
    expect(res.breakdown).toMatchObject({ unitPrice: 245, subtotal: 245 * 3, garment: "bib_r" });
    const o = orders[0];
    expect(o.fabricSummary).toBe("R-bib (2 ด้าน) · ออกแบบบนเว็บ");
    expect(o.items.map((i: any) => [i.size, i.qty])).toEqual([["M", 2], ["XXL", 1]]);
    expect(o.items[0].designSnapshot).toMatchObject({ kind: "bib-design", product: "bib_r", team: "SAGINUMA FC" });
    expect(rosterRows.map(r => [r.playerName, r.number, r.size])).toEqual([["TAICHI", "48", "M"], ["SORA", "2", "M"], ["SHUN", "1", "XXL"]]);
    // the job, as the team's own: a zip named for its NAS folder, with the order sheet as its picture
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ orderId: o.id, userId: USER, name: `${o.orderNo} R-bib (M XXL) SAGINUMA FC.zip` });
    const z = readFileSync(join(dir, "order-files", files[0].path));
    expect(z.subarray(0, 4).toString("latin1")).toBe("PK\u0003\u0004");
    expect(files[0].sha256).toBe(createHash("sha256").update(z).digest("hex"));
    expect(readFileSync(join(dir, "order-files", files[0].previewPath)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  }, 30_000);

  it("takes the team's logo only from the kit studio's store, and builds again on request", async () => {
    const { svc, bibs } = await services();
    await expect(svc.create(USER, CreateOrderSchema.parse(webOrder({ logoUrl: `/uploads/kit-assets/logos/${SHA}.png` })))).rejects.toThrow(/ไม่พบไฟล์โลโก้/);
    expect(orders).toHaveLength(0);
    const { mkdirSync, writeFileSync } = await import("fs");
    mkdirSync(join(dir, "kit-assets", "logos"), { recursive: true });
    writeFileSync(join(dir, "kit-assets", "logos", `${SHA}.png`), PNG);
    await svc.create(USER, CreateOrderSchema.parse(webOrder({ logoUrl: `/uploads/kit-assets/logos/${SHA}.png` })));
    const first = files[0].id;
    // building again replaces a build the team hasn't taken to the NAS
    const again = await bibs.attach(orders[0].id);
    expect(files.map(f => f.id)).toEqual([again.fileId]);
    expect(again.fileId).not.toBe(first);
    // …and keeps one that's on the NAS
    files[0].nasAt = new Date();
    await bibs.attach(orders[0].id);
    expect(files).toHaveLength(2);
    // a file order can't be rebuilt as a bib
    orders[0].items[0].designSnapshot = { kind: "file-order" };
    await expect(bibs.attach(orders[0].id)).rejects.toThrow(/ไม่ได้ออกแบบเอี๊ยมบนเว็บ/);
  }, 60_000);
});
