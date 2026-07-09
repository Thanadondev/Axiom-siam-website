import { describe, it, expect } from "vitest";
import { bahtToSatang, satangToBaht, verifyPaidAmount, SATANG_PER_BAHT } from "./money";

describe("bahtToSatang", () => {
  it("multiplies by 100", () => {
    expect(bahtToSatang(1730)).toBe(173_000);
    expect(bahtToSatang(1)).toBe(100);
    expect(bahtToSatang(0)).toBe(0);
    expect(SATANG_PER_BAHT).toBe(100);
  });

  it("refuses fractional baht — our prices are always whole", () => {
    expect(() => bahtToSatang(10.5)).toThrow(/whole/);
  });

  it("refuses negative amounts", () => {
    expect(() => bahtToSatang(-1)).toThrow(/negative/);
  });

  it("refuses NaN / Infinity rather than sending garbage to Stripe", () => {
    expect(() => bahtToSatang(NaN)).toThrow();
    expect(() => bahtToSatang(Infinity)).toThrow();
  });

  it("round-trips", () => {
    for (const b of [0, 1, 99, 1730, 42_000]) expect(satangToBaht(bahtToSatang(b))).toBe(b);
  });
});

describe("satangToBaht", () => {
  it("refuses amounts that are not whole baht", () => {
    expect(() => satangToBaht(150)).toThrow(/whole number of baht/);
  });
});

describe("verifyPaidAmount — the last gate before an order is marked paid", () => {
  const good = { amount_total: 173_000, currency: "thb", payment_status: "paid" as const };

  it("accepts a correct payment", () => {
    expect(verifyPaidAmount(good, 1730)).toEqual({ ok: true });
  });

  it("accepts uppercase currency from Stripe", () => {
    expect(verifyPaidAmount({ ...good, currency: "THB" }, 1730).ok).toBe(true);
  });

  it("REJECTS an underpayment", () => {
    const r = verifyPaidAmount({ ...good, amount_total: 100 }, 1730);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/paid 100 satang, order is 173000 satang/);
  });

  it("REJECTS an overpayment (needs a human to look)", () => {
    expect(verifyPaidAmount({ ...good, amount_total: 999_999 }, 1730).ok).toBe(false);
  });

  it("REJECTS a different currency — ฿1730 is not $1730", () => {
    const r = verifyPaidAmount({ ...good, currency: "usd" }, 1730);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expected thb/);
  });

  it("REJECTS a session that has not actually been paid", () => {
    for (const s of ["unpaid", "no_payment_required", null, undefined]) {
      expect(verifyPaidAmount({ ...good, payment_status: s as any }, 1730).ok).toBe(false);
    }
  });

  it("REJECTS a missing amount", () => {
    expect(verifyPaidAmount({ ...good, amount_total: null }, 1730).ok).toBe(false);
    expect(verifyPaidAmount({ currency: "thb", payment_status: "paid" }, 1730).ok).toBe(false);
  });

  it("REJECTS a missing currency", () => {
    expect(verifyPaidAmount({ amount_total: 173_000, payment_status: "paid" }, 1730).ok).toBe(false);
  });

  it("is not fooled by a zero-baht order paid with zero", () => {
    // a ฿0 order should never reach checkout (MIN_CHARGE_BAHT guards it),
    // but if it did, the amounts still have to agree
    expect(verifyPaidAmount({ amount_total: 0, currency: "thb", payment_status: "paid" }, 0).ok).toBe(true);
    expect(verifyPaidAmount({ amount_total: 0, currency: "thb", payment_status: "paid" }, 100).ok).toBe(false);
  });

  it("never throws on a hostile session object", () => {
    expect(() => verifyPaidAmount({} as any, 1730)).not.toThrow();
    expect(verifyPaidAmount({} as any, 1730).ok).toBe(false);
  });
});
