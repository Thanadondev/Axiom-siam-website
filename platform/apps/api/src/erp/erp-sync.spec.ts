import { describe, it, expect, beforeEach } from "vitest";
import { ErpSyncService } from "./erp-sync.service";
import { ErpStatusSchema, erpStep, snapshot, webStep } from "./production-status";
import { erpConfig, fetchErpStatus } from "./erp.client";

/** the ERP's answer, shaped like the real one for HJ-447 */
const NAMES = ["จัดไฟล์พิมพ์", "พิมพ์", "รีด Roll", "ตัดเลเซอร์", "QC ก่อนเย็บ", "เย็บ", "QC Final", "รีดป้ายไซส์", "รีดแพ็ค", "แพ็คลงกล่องและจัดส่ง"];
function erpBody(done: number, opts: { running?: boolean; status?: string; current?: unknown } = {}) {
  return {
    order_no: "HJ-447",
    status: opts.status ?? (done >= 10 ? "shipped" : "in_production"),
    status_label: done >= 10 ? "จัดส่งแล้ว" : "กำลังผลิต",
    product: "Shirt เสื้อแขนสั้น",
    total_qty: 2,
    due_date: "2026-11-13",
    progress: { done, total: 10, percent: done * 10 },
    current_step: opts.current ?? null,
    steps: NAMES.map((name, i) => {
      const no = i + 1;
      const isDone = no <= done;
      const running = opts.running && no === done + 1;
      return {
        no, name,
        status: isDone ? "done" : running ? "in_progress" : "pending",
        status_label: isDone ? "เสร็จแล้ว" : running ? "กำลังทำ" : "รอ",
        started_on: isDone || running ? `2026-10-${18 + no}` : null,
        finished_on: isDone ? `2026-10-${18 + no}` : null,
      };
    }),
    updated_at: "2026-10-24T11:56:56.903791",
  };
}
const parse = (b: unknown) => ErpStatusSchema.parse(b);

describe("reading the ERP's production status", () => {
  it("is on the furthest step that has started", () => {
    expect(erpStep(parse(erpBody(0)))).toBe(0);
    expect(erpStep(parse(erpBody(3)))).toBe(3); // 3 done, nothing running yet
    expect(erpStep(parse(erpBody(3, { running: true })))).toBe(4); // 4 started
  });

  it("follows the ERP's current step when it names one", () => {
    expect(erpStep(parse(erpBody(2, { current: 3 })))).toBe(3);
    expect(erpStep(parse(erpBody(2, { current: { no: 5, name: "QC ก่อนเย็บ" } })))).toBe(5);
  });

  it("shipped or all ten done is the last step — the web waits at 9 for the tracking number", () => {
    const e = parse(erpBody(10));
    expect(erpStep(e)).toBe(10);
    expect(erpStep(parse(erpBody(10, { status: "in_production" })))).toBe(10);
    expect(webStep(10)).toBe(9);
    expect(webStep(4)).toBe(4);
  });

  it("keeps the steps and their dates for the customer", () => {
    const s = snapshot(parse(erpBody(2, { running: true })));
    expect(s.dueDate).toBe("2026-11-13");
    expect(s.steps).toHaveLength(10);
    expect(s.steps[0]).toEqual({ no: 1, name: "จัดไฟล์พิมพ์", status: "done", label: "เสร็จแล้ว", startedOn: "2026-10-19", finishedOn: "2026-10-19" });
    expect(s.steps[2]).toMatchObject({ status: "in_progress", startedOn: "2026-10-21", finishedOn: null });
  });

  it("tolerates missing or odd fields", () => {
    const e = parse({ order_no: "X-1", steps: [{ no: "2", name: "พิมพ์", status: "done" }] });
    expect(erpStep(e)).toBe(2);
    expect(parse({ order_no: "X-1", steps: "nope" }).steps).toEqual([]);
  });
});

describe("calling the ERP", () => {
  const cfg = erpConfig({ ERP_BASE_URL: "https://erp.test/" } as any)!;
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("is off without ERP_BASE_URL", () => {
    expect(erpConfig({} as any)).toBeNull();
    expect(cfg).toMatchObject({ baseUrl: "https://erp.test", apiKey: null, syncMinutes: 10 });
  });

  it("asks for the order by number and reads the answer", async () => {
    let url = "";
    const f = (async (u: string) => { url = u; return new Response(JSON.stringify(erpBody(4)), { status: 200 }); }) as unknown as typeof fetch;
    const r = await fetchErpStatus(cfg, "HJ-447", f);
    expect(url).toBe("https://erp.test/api/public/production-status?order_no=HJ-447");
    expect(r.ok && erpStep(r.status)).toBe(4);
  });

  it("says when the ERP doesn't know the number, or is down", async () => {
    expect(await fetchErpStatus(cfg, "ZZ-1", reply(404, { detail: "not found" }))).toMatchObject({ ok: false, notFound: true });
    expect(await fetchErpStatus(cfg, "ZZ-1", reply(200, { error: "no such order" }))).toMatchObject({ ok: false, notFound: true });
    expect(await fetchErpStatus(cfg, "HJ-447", reply(500, {}))).toMatchObject({ ok: false, notFound: false, error: "ERP ตอบกลับ 500" });
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await fetchErpStatus(cfg, "HJ-447", down)).toMatchObject({ ok: false, error: "เชื่อมต่อ ERP ไม่ได้" });
  });
});

// ---------- applying it to web orders, against an in-memory Prisma ----------
type Row = Record<string, any>;
let orders: Row[], history: Row[], pushed: Row[], adminPushed: string[];
let erpReply: unknown;
const prisma: any = {
  order: {
    findUnique: async ({ where }: any) => orders.find(o => o.id === where.id) ?? null,
    findFirst: async ({ where }: any) => orders.find(o => o.erpOrderNo === where.erpOrderNo && o.id !== where.NOT.id) ?? null,
    findMany: async ({ where }: any) => orders.filter(o => o.erpOrderNo && where.status.in.includes(o.status)),
    update: async ({ where, data }: any) => Object.assign(orders.find(o => o.id === where.id)!, data),
  },
  orderStatusHistory: { create: async ({ data }: any) => { history.push(data); return data; } },
  $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
};
const notify: any = {
  push: async (n: Row) => { pushed.push(n); },
  pushAdmins: async (t: string) => { adminPushed.push(t); },
};
const svc = new ErpSyncService(prisma, notify);
svc.cfg = erpConfig({ ERP_BASE_URL: "https://erp.test" } as any);
svc.fetchImpl = (async () => new Response(JSON.stringify(erpReply), { status: erpReply ? 200 : 404 })) as unknown as typeof fetch;

beforeEach(() => {
  orders = [
    { id: "o1", orderNo: "AX-1", userId: "u1", status: "paid", productionStep: 0, erpOrderNo: null, erpStatus: null, erpSyncedAt: null },
    { id: "o2", orderNo: "AX-2", userId: "u2", status: "pending", productionStep: 0, erpOrderNo: null, erpStatus: null, erpSyncedAt: null },
  ];
  history = []; pushed = []; adminPushed = [];
  erpReply = erpBody(2, { running: true });
});

describe("following the ERP on a web order", () => {
  it("linking checks the number with the ERP and moves the order to its step", async () => {
    const r = await svc.link("o1", "admin", " HJ-447 ");
    expect(r).toMatchObject({ ok: true, erpOrderNo: "HJ-447", step: 3, moved: true });
    expect(orders[0]).toMatchObject({ erpOrderNo: "HJ-447", status: "in_production", productionStep: 3 });
    expect(orders[0].erpStatus.steps[0].finishedOn).toBe("2026-10-19");
    expect(history).toEqual([expect.objectContaining({ step: 3, note: "อัปเดตจาก ERP (HJ-447)", changedBy: "admin" })]);
    // written in the customer's language when it's sent (notify/text.ts)
    expect(pushed[0].title).toEqual({ th: "ออเดอร์ AX-1: ขั้นที่ 3/10 · รีด", en: "Order AX-1: step 3/10 · Heat transfer", ja: "ご注文 AX-1：工程 3/10 · 転写" });
  });

  it("won't link a number the ERP doesn't know, or one already on another order", async () => {
    erpReply = null;
    await expect(svc.link("o1", "admin", "ZZ-9")).rejects.toThrow(/ไม่พบออเดอร์ ZZ-9 ใน ERP/);
    expect(orders[0].erpOrderNo).toBeNull();
    erpReply = erpBody(1);
    await svc.link("o1", "admin", "HJ-447");
    await expect(svc.link("o2", "admin", "HJ-447")).rejects.toThrow(/ผูกกับออเดอร์ AX-1 อยู่แล้ว/);
  });

  it("a job that doesn't look like the order is not linked until the admin confirms", async () => {
    // AX-1 was ordered on 10 Nov for 15 pieces; HJ-447 is 2 pieces made in October
    Object.assign(orders[0], { createdAt: new Date("2026-11-10T04:00:00Z"), items: [{ qty: 10 }, { qty: 5 }] });
    const err: any = await svc.link("o1", "admin", "HJ-447").catch(e => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ needsConfirm: true, warnings: [expect.stringMatching(/จำนวนใน ERP 2 ตัว/), expect.stringMatching(/เริ่มผลิตตั้งแต่/)] });
    expect(orders[0]).toMatchObject({ erpOrderNo: null, productionStep: 0, status: "paid" });
    expect(pushed).toEqual([]); // the customer heard nothing
    expect(await svc.link("o1", "admin", "HJ-447", true)).toMatchObject({ ok: true, erpOrderNo: "HJ-447", step: 3 });
  });

  it("an unpaid order keeps the ERP's dates but doesn't move", async () => {
    const r = await svc.link("o2", "admin", "HJ-447");
    expect(r).toMatchObject({ ok: true, moved: false, step: 0 });
    expect(r.message).toMatch(/ยังไม่ชำระเงิน/);
    expect(orders[1]).toMatchObject({ status: "pending", productionStep: 0 });
    expect(orders[1].erpStatus.step).toBe(3);
  });

  it("each sync moves along with the ERP and tells the customer; no change, no noise", async () => {
    await svc.link("o1", "admin", "HJ-447");
    erpReply = erpBody(5);
    expect(await svc.syncOne("o1")).toMatchObject({ moved: true, step: 5 });
    expect(await svc.syncOne("o1")).toMatchObject({ moved: false, step: 5 });
    expect(pushed).toHaveLength(2);
    expect(history.at(-1)).toMatchObject({ step: 5, changedBy: null });
  });

  it("a correction backwards in the ERP is followed quietly", async () => {
    await svc.link("o1", "admin", "HJ-447");
    erpReply = erpBody(1);
    expect(await svc.syncOne("o1")).toMatchObject({ moved: true, step: 1 });
    expect(pushed).toHaveLength(1);
  });

  it("finished in the ERP: waits at step 9 and asks the team for the tracking number, once", async () => {
    await svc.link("o1", "admin", "HJ-447");
    erpReply = erpBody(10);
    expect(await svc.syncOne("o1")).toMatchObject({ step: 9, erpStep: 10 });
    expect(orders[0].status).toBe("in_production");
    await svc.syncOne("o1");
    expect(adminPushed).toEqual(["ERP: AX-1 ผลิตเสร็จ/จัดส่งแล้ว"]);
  });

  it("an opened order refreshes only when its copy is old", async () => {
    await svc.link("o1", "admin", "HJ-447");
    erpReply = erpBody(6);
    expect(await svc.refreshIfStale(orders[0] as any)).toBe(false); // just synced
    orders[0].erpSyncedAt = new Date(Date.now() - 5 * 60_000);
    expect(await svc.refreshIfStale(orders[0] as any)).toBe(true);
    expect(orders[0].productionStep).toBe(6);
  });

  it("the ERP being down never breaks opening an order", async () => {
    await svc.link("o1", "admin", "HJ-447");
    orders[0].erpSyncedAt = null;
    const keep = svc.fetchImpl;
    svc.fetchImpl = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await svc.refreshIfStale(orders[0] as any)).toBe(false);
    svc.fetchImpl = keep;
  });

  it("syncs every linked order on the floor, and unlinking clears it", async () => {
    await svc.link("o1", "admin", "HJ-447");
    erpReply = erpBody(7);
    expect(await svc.syncActive()).toMatchObject({ checked: 1, moved: 1, failed: [] });
    await svc.link("o1", "admin", "");
    expect(orders[0]).toMatchObject({ erpOrderNo: null, erpSyncedAt: null, productionStep: 7 });
    expect(await svc.syncOne("o1")).toMatchObject({ ok: false, error: "not_linked" });
  });
});
