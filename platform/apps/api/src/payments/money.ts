/**
 * Money helpers. Pure — unit-tested in money.spec.ts.
 *
 * Our database stores whole Thai baht; satang never appear in pricing. Slips,
 * however, are printed with 2 decimals, so a number read off one can be
 * fractional and has to be reconciled against a whole-baht order total.
 */

export const SATANG_PER_BAHT = 100;

/** ฿1,730 → 173000 satang. Kept for anywhere that needs the minor unit. */
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

/** Below this, a transfer costs more in admin review time than it collects. */
export const MIN_CHARGE_BAHT = 10;

/**
 * Turn the shapes an amount takes on a Thai slip — "1,234.00", "฿1,234",
 * "1234.50 บาท" — into a number.
 *
 * Returns null when it isn't an amount at all, so callers fall back to manual
 * review instead of guessing. Silently guessing here would be a way to mark an
 * order paid for the wrong number.
 */
export function parseSlipAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (!raw) return null;

  const cleaned = String(raw)
    .replace(/บาท/g, "")
    .replace(/[฿,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Baht formatted the way customers see it: ฿1,234 */
export function formatBaht(baht: number): string {
  return `฿${Math.round(baht).toLocaleString("en-US")}`;
}
