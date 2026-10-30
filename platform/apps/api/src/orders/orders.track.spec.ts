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
    findUnique: async ({ where, select }: any) => {
      if (where.orderNo !== row.orderNo) return null;
      return Object.fromEntries(Object.keys(select).map(k => [k, row[k]]));
    },
  },
};
const svc = new OrdersService(prisma, {} as any, {} as any);

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

  it("an unknown number is just not found", async () => {
    row = { ...base };
    await expect(svc.track("AX-000000-0000")).rejects.toThrow(/ไม่พบออเดอร์นี้/);
    await expect(svc.track("")).rejects.toThrow(/ไม่พบออเดอร์นี้/);
  });
});
