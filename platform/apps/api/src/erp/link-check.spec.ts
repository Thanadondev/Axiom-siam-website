import { describe, it, expect } from "vitest";
import { linkWarnings } from "./link-check";
import { ErpStatusSchema } from "./production-status";

/** an ERP job: its quantity and the days its steps ran */
const job = (qty: number | null, days: (string | null)[]) => ErpStatusSchema.parse({
  order_no: "HJ-447", status: "in_production", total_qty: qty,
  steps: days.map((d, i) => ({ no: i + 1, name: `s${i + 1}`, status: d ? "done" : "pending", started_on: d, finished_on: d })),
});

describe("does the ERP job look like this web order?", () => {
  const ordered = new Date("2026-11-10T04:03:00Z"); // 10 Nov, 11:03 in Bangkok

  it("a job for the same quantity that started after the order: nothing to ask", () => {
    expect(linkWarnings({ createdAt: ordered, qty: 15 }, job(15, ["2026-11-11", "2026-11-12", null]))).toEqual([]);
    expect(linkWarnings({ createdAt: ordered, qty: 15 }, job(15, ["2026-11-10", null]))).toEqual([]); // same day is fine
    expect(linkWarnings({ createdAt: ordered, qty: 15 }, job(15, [null, null]))).toEqual([]); // not started yet
  });

  it("another quantity: asks", () => {
    expect(linkWarnings({ createdAt: ordered, qty: 15 }, job(2, [null]))).toEqual(["จำนวนใน ERP 2 ตัว ไม่ตรงกับออเดอร์นี้ 15 ตัว"]);
  });

  it("a job that started before the order was placed: asks (the test that linked last month's HJ-447)", () => {
    const w = linkWarnings({ createdAt: ordered, qty: 2 }, job(2, ["2026-10-19", "2026-10-20"]));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^งานนี้ใน ERP เริ่มผลิตตั้งแต่ 19 ต\.ค\. 2569 ก่อนวันที่สั่งออเดอร์นี้บนเว็บ \(10 พ\.ย\. 2569\)$/);
  });

  it("reads the order's day in Bangkok, not UTC", () => {
    const lateNightBkk = new Date("2026-11-09T18:30:00Z"); // 10 Nov 01:30 in Bangkok
    expect(linkWarnings({ createdAt: lateNightBkk, qty: null }, job(null, ["2026-11-10"]))).toEqual([]);
  });

  it("says nothing it can't know: no quantity, no dates", () => {
    expect(linkWarnings({ createdAt: null, qty: null }, job(null, ["2020-01-01"]))).toEqual([]);
  });
});
