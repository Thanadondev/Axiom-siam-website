import type { ErpStatus } from "./production-status";

/**
 * Before a web order is linked to an ERP job: does the job look like this order?
 * Linking moves the order to the job's step and tells the customer, so a typo
 * (or a job from last month) would show them someone else's progress.
 * These are reasons to ask the admin, not rules: they can still link.
 * Pure — link-check.spec.ts.
 */

/** "2026-10-19" as the day the factory works in */
const bangkokDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const thaiDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export function linkWarnings(order: { createdAt?: Date | null; qty?: number | null }, erp: ErpStatus): string[] {
  const out: string[] = [];
  const erpQty = erp.total_qty ?? null;
  if (erpQty && order.qty && erpQty !== order.qty) {
    out.push(`จำนวนใน ERP ${erpQty} ตัว ไม่ตรงกับออเดอร์นี้ ${order.qty} ตัว`);
  }
  if (order.createdAt) {
    const first = erp.steps
      .flatMap(s => [s.started_on, s.finished_on])
      .filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
      .map(v => v.slice(0, 10))
      .sort()[0];
    const ordered = bangkokDay(order.createdAt);
    if (first && first < ordered) {
      out.push(`งานนี้ใน ERP เริ่มผลิตตั้งแต่ ${thaiDay(first)} ก่อนวันที่สั่งออเดอร์นี้บนเว็บ (${thaiDay(ordered)})`);
    }
  }
  return out;
}
