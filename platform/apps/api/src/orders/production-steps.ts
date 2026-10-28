/**
 * The production line, step by step — what the customer sees on their order
 * and what the factory moves along the board. Same ten steps as /process.
 *
 * Order.productionStep: 0 not started, 1–9 the factory steps, 10 shipped.
 * Steps 1–9 are set by the factory; 10 comes with marking the order shipped
 * (which needs the tracking number and the money in full).
 */

export const PRODUCTION_STEPS = [
  "ทำไฟล์", "พิมพ์", "รีด", "ตัดเลเซอร์", "QC ก่อนเข้าเย็บ",
  "เย็บ", "QC ก่อนรีดแพ็ค", "รีดไซส์", "รีดและแพ็ค", "จัดส่ง",
] as const;

export const SHIP_STEP = PRODUCTION_STEPS.length; // 10
export const LAST_FLOOR_STEP = SHIP_STEP - 1; // 9

export const stepName = (n: number) => PRODUCTION_STEPS[n - 1] ?? "";

/** statuses an order can be in while it is on the factory floor */
const ON_FLOOR = ["paid", "approved", "in_production"];

export type StepPlan =
  | { ok: true; status: "in_production"; step: number }
  | { ok: false; error: string };

/**
 * Moving an order to a factory step. The first step also starts production, so
 * a paid (or design-approved) order moves to "กำลังผลิต" with it.
 */
export function planStep(status: string, current: number, to: number): StepPlan {
  if (!Number.isInteger(to) || to < 1 || to > LAST_FLOOR_STEP) {
    return { ok: false, error: `ขั้นตอนผลิตตั้งได้ 1–${LAST_FLOOR_STEP} — ขั้น ${SHIP_STEP} (จัดส่ง) ตั้งด้วยการบันทึกเลขพัสดุ` };
  }
  if (status === "pending") return { ok: false, error: "ออเดอร์ยังไม่ชำระเงิน — เริ่มผลิตได้หลังรับเงินแล้ว" };
  if (status === "cancelled" || status === "refunded") return { ok: false, error: "ออเดอร์นี้ปิดไปแล้ว" };
  if (!ON_FLOOR.includes(status)) return { ok: false, error: "ออเดอร์นี้จัดส่งไปแล้ว" };
  if (to === current) return { ok: false, error: `อยู่ขั้น ${to} · ${stepName(to)} อยู่แล้ว` };
  return { ok: true, status: "in_production", step: to };
}

/** the step that goes with a status change made elsewhere (board buttons, slip approval…) */
export function stepForStatus(status: string, current: number): number {
  if (status === "shipped" || status === "delivered" || status === "completed") return SHIP_STEP;
  if (status === "in_production") return Math.max(1, Math.min(current, LAST_FLOOR_STEP));
  return current;
}
