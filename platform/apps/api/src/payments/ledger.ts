/**
 * What an order has paid and what it owes right now. Pure — ledger.spec.ts.
 *
 * With a deposit (pricing.depositPct < 100) the order is paid in two steps:
 * the deposit while it is `pending` (that payment moves it to `paid`, which
 * starts production), then the balance any time before it ships. Without one,
 * the whole total is due up front, exactly as before.
 */

export type DueKind = "deposit" | "full" | "balance";

export interface LedgerOrder {
  status: string;
  total: number;
  depositAmount: number;
}
export interface LedgerPayment {
  status: string;
  type: string;
  amount: number;
}
export interface Ledger {
  total: number;
  /** confirmed money in (approved slips and payments an admin recorded) */
  paid: number;
  /** money given back (Refund rows) */
  refunded: number;
  /** total − paid */
  outstanding: number;
  /** what the customer should transfer now (0 = nothing to pay right now) */
  due: number;
  kind: DueKind | null;
}

const CLOSED = ["cancelled", "refunded"];

/** the up-front part: the deposit when there is one, otherwise everything */
export function upfront(o: LedgerOrder): number {
  return o.depositAmount > 0 && o.depositAmount < o.total ? o.depositAmount : o.total;
}

/**
 * Refunds are kept apart from what is owed: giving money back (an overpayment,
 * a goodwill refund, a cancelled order) never makes a customer owe it again.
 */
export function ledger(o: LedgerOrder, payments: LedgerPayment[], refunds: { amount: number }[] = []): Ledger {
  const paid = payments
    .filter(p => p.status === "paid" && p.type !== "refund")
    .reduce((s, p) => s + p.amount, 0);
  const refunded = refunds.reduce((s, r) => s + r.amount, 0);
  const outstanding = Math.max(0, o.total - paid);
  const base = { total: o.total, paid, refunded, outstanding };
  if (CLOSED.includes(o.status) || outstanding === 0) return { ...base, due: 0, kind: null };
  if (o.status === "pending") {
    const first = upfront(o);
    return { ...base, due: Math.max(0, first - paid), kind: first < o.total ? "deposit" : "full" };
  }
  return { ...base, due: outstanding, kind: "balance" };
}

/** the up-front part is covered: an unpaid order can go to production */
export function upfrontCovered(o: LedgerOrder, payments: LedgerPayment[]): boolean {
  return ledger({ ...o, status: "pending" }, payments).due === 0;
}

export const DUE_TH: Record<DueKind, string> = { deposit: "มัดจำ", full: "ยอดเต็ม", balance: "ส่วนที่เหลือ" };
