/**
 * Money conversion for Stripe. Pure — unit-tested in money.spec.ts.
 *
 * Our database stores whole Thai baht (satang are never used in pricing).
 * Stripe wants the smallest currency unit, i.e. satang. THB is a 2-decimal
 * currency, so the factor is 100.
 */

export const SATANG_PER_BAHT = 100;

/** ฿1,730 → 173000 satang */
export function bahtToSatang(baht: number): number {
  if (!Number.isFinite(baht)) throw new Error("amount is not a number");
  if (baht < 0) throw new Error("amount must not be negative");
  if (!Number.isInteger(baht)) throw new Error("baht amounts must be whole numbers");
  return baht * SATANG_PER_BAHT;
}

/** 173000 satang → ฿1,730 */
export function satangToBaht(satang: number): number {
  if (!Number.isFinite(satang)) throw new Error("amount is not a number");
  if (satang % SATANG_PER_BAHT !== 0) throw new Error("amount is not a whole number of baht");
  return satang / SATANG_PER_BAHT;
}

/** Stripe rejects payments under ~฿10; be explicit rather than failing at the API. */
export const MIN_CHARGE_BAHT = 10;

export interface PaidCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Guards the money before we mark an order paid.
 *
 * A webhook is attacker-reachable (the signature proves it came from Stripe,
 * not that it is for the amount we expected). Confirm the currency and that
 * the customer actually paid what the order costs — never trust the session
 * blindly.
 */
export function verifyPaidAmount(
  session: { amount_total?: number | null; currency?: string | null; payment_status?: string | null },
  expectedBaht: number,
): PaidCheck {
  if (session.payment_status !== "paid") {
    return { ok: false, reason: `payment_status = ${session.payment_status ?? "unknown"}` };
  }
  if ((session.currency ?? "").toLowerCase() !== "thb") {
    return { ok: false, reason: `currency = ${session.currency ?? "unknown"}, expected thb` };
  }
  const paid = session.amount_total;
  if (typeof paid !== "number") return { ok: false, reason: "amount_total missing" };

  const expected = bahtToSatang(expectedBaht);
  if (paid !== expected) {
    return { ok: false, reason: `paid ${paid} satang, order is ${expected} satang` };
  }
  return { ok: true };
}
