import { describe, it, expect } from "vitest";
import { OrdersService } from "./orders.service";

/** the public tracking page: by order number, with nothing private in the answer */
const base = {
  id: "o1", orderNo: "AX-261029-K7QZ", status: "in_production", productionStep: 6, fabricSummary: "mesh · ขลิบ:full",
  createdAt: new Date("2026-10-18T03:00:00Z"), updatedAt: new Date("2026-10-24T03:00:00Z"),
  erpOrderNo: "HJ-447", erpSyncedAt: new Date("2026-10-29T03:00:00Z"),
  erpStatus: {
    dueDate: "2026-11-13", step: 6,
    steps: [1, 2, 3, 4, 5, 6].map(no => ({ no, startedOn: `2026-10-${18 + no}`, finishedOn: no < 6 ? `2026-10-${18 + no}` : null })),
  },
  items: [{ qty: 12 }, { qty: 8 }],
  statusHistory: [{ step: 1, createdAt: new Date("2026-10-19T02:00:00Z") }],
  shipments: [] as any[],
  // things the tracking page must never show
  user: { email: "team@example.com" }, total: 7800, shippingAddress: { line1: "1 ถนน" },
};
let row: any;
const prisma: any = {
  order: {
    findFirst: async ({ where }: any) => {
      const [byNo, byErp] = where.OR;
      const hit = row.orderNo === byNo.orderNo || (row.erpOrderNo && row.erpOrderNo.toUpperCase() === byErp.erpOrderNo.equals.toUpperCase());
      return hit ? { id: row.id } : null;
    },
    findUnique: async ({ where, select }: any) => {
      if (where.id !== row.id) return null;
      return Object.fromEntries(Object.keys(select).map(k => [k, row[k]]));
    },
  },
};
const svc = new OrdersService(prisma, {} as any, {} as any);
// the ERP knows HJ-137, which was never ordered on the web
let erpUp = true;
const erp: any = {
  refreshIfStale: async () => false,
  lookup: async (no: string) => {
    if (!erpUp) return { ok: false, notFound: false, error: "เชื่อมต่อ ERP ไม่ได้" };
    if (no !== "HJ-137") return { ok: false, notFound: true, error: "ไม่พบ" };
    return {
      ok: true,
      status: {
        order_no: "HJ-137", status: "in_production", status_label: "กำลังผลิต", product: "Shirt เสื้อแขนสั้น", total_qty: 24, due_date: "2026-11-20",
        current_step: null, updated_at: "2026-10-29T10:00:00",
        steps: [1, 2, 3, 4].map(n => ({ no: n, name: `s${n}`, status: n < 4 ? "done" : "in_progress", status_label: null, started_on: `2026-10-2${n}`, finished_on: n < 4 ? `2026-10-2${n}` : null })),
      },
    };
  },
};
const withErp = new OrdersService(prisma, {} as any, {} as any, erp);

describe("tracking an order by its number", () => {
  it("finds it however the number is typed, and shows the step with the factory's dates", async () => {
    row = { ...base };
    const t = await svc.track(" ax-261029-k7qz ");
    expect(t).toMatchObject({ orderNo: "AX-261029-K7QZ", step: 6, stepName: "เย็บ", statusLabel: "กำลังผลิต", qty: 20, dueDate: "2026-11-13", shipment: null });
    expect(t.steps).toHaveLength(10);
    expect(t.steps[0]).toEqual({ no: 1, name: "ทำไฟล์", startedOn: "2026-10-19", finishedOn: "2026-10-19" });
    expect(t.steps[5]).toMatchObject({ startedOn: "2026-10-24", finishedOn: null });
    expect(t.updatedAt).toEqual(base.erpSyncedAt);
    const json = JSON.stringify(t);
    for (const secret of ["team@example.com", "7800", "1 ถนน", "HJ-447"]) expect(json).not.toContain(secret);
  });

  it("without the ERP, uses when the step was set on the web", async () => {
    row = { ...base, erpStatus: null, erpOrderNo: null, erpSyncedAt: null, productionStep: 1 };
    const t = await svc.track("AX-261029-K7QZ");
    expect(t.steps[0].startedOn).toEqual(new Date("2026-10-19T02:00:00Z"));
    expect(t.dueDate).toBeNull();
  });

  it("shipped shows the parcel", async () => {
    row = { ...base, status: "shipped", shipments: [{ courier: "Flash", trackingNo: "TH123", shippedAt: new Date(), deliveredAt: null }] };
    const t = await svc.track("AX-261029-K7QZ");
    expect(t).toMatchObject({ step: 10, stepName: "จัดส่ง", shipment: { courier: "Flash", trackingNo: "TH123" } });
  });

  it("delivered shows when it arrived", async () => {
    const arrivedAt = new Date("2026-10-27T05:00:00Z");
    row = { ...base, status: "delivered", shipments: [{ courier: "Flash", trackingNo: "TH123", shippedAt: new Date("2026-10-25T05:00:00Z"), deliveredAt: arrivedAt }] };
    const t = await svc.track("AX-261029-K7QZ");
    expect(t).toMatchObject({ status: "delivered", statusLabel: "ได้รับแล้ว", step: 10, shipment: { deliveredAt: arrivedAt } });
  });

  it("the factory's number finds the web order it's linked to", async () => {
    row = { ...base };
    const t = await withErp.track("hj-447");
    expect(t).toMatchObject({ orderNo: "AX-261029-K7QZ", step: 6 });
  });

  it("a job only the ERP knows is shown from the ERP", async () => {
    row = { ...base };
    const t = await withErp.track("HJ-137");
    expect(t).toMatchObject({ orderNo: "HJ-137", step: 4, stepName: "ตัดเลเซอร์", qty: 24, product: "Shirt เสื้อแขนสั้น", dueDate: "2026-11-20", source: "erp" });
    expect(t.steps[2]).toMatchObject({ startedOn: "2026-10-23", finishedOn: "2026-10-23" });
    expect(t.shipment).toBeNull();
    await expect(withErp.track("HJ-999")).rejects.toThrow(/ไม่พบออเดอร์นี้/);
    erpUp = false;
    await expect(withErp.track("HJ-137")).rejects.toThrow(/ติดต่อระบบโรงงานไม่ได้/);
    erpUp = true;
  });

  it("a job the ERP has sent: the send date from its last step, no parcel number to show", async () => {
    const all = (status: string) => ({
      ok: true,
      status: {
        order_no: "HJ-200", status, status_label: null, product: null, total_qty: 2, due_date: null, current_step: null, updated_at: null,
        steps: Array.from({ length: 10 }, (_, i) => ({ no: i + 1, name: "", status: "done", status_label: null, started_on: "2026-10-22", finished_on: i === 9 ? "2026-10-23" : "2026-10-22" })),
      },
    });
    let answer: any = all("shipped");
    const sent = new OrdersService(prisma, {} as any, {} as any, { refreshIfStale: async () => false, lookup: async () => answer } as any);
    row = { ...base };
    expect(await sent.track("HJ-200")).toMatchObject({ status: "shipped", step: 10, shipment: { courier: null, trackingNo: null, shippedAt: "2026-10-23", deliveredAt: null } });
    answer = all("delivered");
    expect(await sent.track("HJ-200")).toMatchObject({ status: "delivered", statusLabel: "ได้รับแล้ว", step: 10 });
  });

  it("an unknown number is just not found", async () => {
    row = { ...base };
    await expect(svc.track("AX-000000-0000")).rejects.toThrow(/ไม่พบออเดอร์นี้/);
    await expect(svc.track("")).rejects.toThrow(/ไม่พบออเดอร์นี้/);
  });
});
