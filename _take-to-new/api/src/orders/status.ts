/** Order lifecycle. Kept separate from the service so it can be unit-tested. */

export const ORDER_FLOW = [
  "pending", "paid", "approved", "in_production", "shipped", "delivered", "completed",
] as const;

export const STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน", paid: "ชำระแล้ว", approved: "อนุมัติแบบแล้ว", in_production: "กำลังผลิต",
  shipped: "จัดส่งแล้ว", delivered: "ได้รับแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", refunded: "คืนเงินแล้ว",
};

/** which statuses a given status may move to */
export const NEXT_STATUS: Record<string, string[]> = {
  pending: ["paid", "cancelled"],
  paid: ["approved", "in_production", "cancelled", "refunded"],
  approved: ["in_production", "cancelled", "refunded"],
  in_production: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
  refunded: [],
};

export const TERMINAL_STATUSES = ["completed", "cancelled", "refunded"] as const;

export function canTransition(from: string, to: string): boolean {
  return (NEXT_STATUS[from] ?? []).includes(to);
}

/** "shipped" is only meaningful with a tracking number */
export function requiresTracking(to: string): boolean {
  return to === "shipped";
}
