import { describe, it, expect } from "vitest";
import { bahtToSatang, satangToBaht, parseSlipAmount, formatBaht, MIN_CHARGE_BAHT } from "./money";

describe("bahtToSatang", () => {
  it("multiplies by 100", () => {
    expect(bahtToSatang(1730)).toBe(173000);
    expect(bahtToSatang(0)).toBe(0);
  });

  it("refuses anything that isn't a whole, non-negative number", () => {
    expect(() => bahtToSatang(NaN)).toThrow();
    expect(() => bahtToSatang(Infinity)).toThrow();
    expect(() => bahtToSatang(-1)).toThrow();
    expect(() => bahtToSatang(10.5)).toThrow();
  });
});

describe("satangToBaht", () => {
  it("round-trips with bahtToSatang", () => {
    for (const b of [1, 10, 999, 12345]) expect(satangToBaht(bahtToSatang(b))).toBe(b);
  });

  it("refuses a fractional baht amount", () => {
    expect(() => satangToBaht(150)).toThrow();
    expect(() => satangToBaht(NaN)).toThrow();
  });
});

describe("parseSlipAmount", () => {
  it("reads the shapes a Thai slip prints", () => {
    expect(parseSlipAmount("1,234.00")).toBe(1234);
    expect(parseSlipAmount("฿1,234")).toBe(1234);
    expect(parseSlipAmount("1234.50")).toBe(1234.5);
    expect(parseSlipAmount("4,500.00 บาท")).toBe(4500);
    expect(parseSlipAmount(" 900 ")).toBe(900);
  });

  it("passes a plain number through", () => {
    expect(parseSlipAmount(4500)).toBe(4500);
  });

  it("returns null rather than guessing", () => {
    // anything ambiguous must reach a human, not become a payment
    expect(parseSlipAmount("")).toBeNull();
    expect(parseSlipAmount(null)).toBeNull();
    expect(parseSlipAmount(undefined)).toBeNull();
    expect(parseSlipAmount("abc")).toBeNull();
    expect(parseSlipAmount("12.345")).toBeNull(); // 3 decimals isn't money
    expect(parseSlipAmount("1.2.3")).toBeNull();
    expect(parseSlipAmount("-500")).toBeNull();
    expect(parseSlipAmount(0)).toBeNull();
    expect(parseSlipAmount(NaN)).toBeNull();
  });
});

describe("formatBaht", () => {
  it("adds the symbol and thousands separators", () => {
    expect(formatBaht(1234)).toBe("฿1,234");
    expect(formatBaht(0)).toBe("฿0");
    expect(formatBaht(1234.6)).toBe("฿1,235"); // rounds — display only
  });
});

describe("MIN_CHARGE_BAHT", () => {
  it("is a sane floor", () => {
    expect(MIN_CHARGE_BAHT).toBeGreaterThan(0);
    expect(MIN_CHARGE_BAHT).toBeLessThan(100);
  });
});
