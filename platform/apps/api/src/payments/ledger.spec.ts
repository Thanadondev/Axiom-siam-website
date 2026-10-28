import { describe, it, expect } from "vitest";
import { ledger, upfront, upfrontCovered } from "./ledger";

const paid = (amount: number, type = "full") => ({ status: "paid", type, amount });

describe("ledger — no deposit (pay in full)", () => {
  const o = { status: "pending", total: 3900, depositAmount: 3900 };
  it("asks for everything up front", () => {
    expect(ledger(o, [])).toMatchObject({ paid: 0, outstanding: 3900, due: 3900, kind: "full" });
  });
  it("ignores slips that were not approved", () => {
    const l = ledger(o, [{ status: "submitted", type: "full", amount: 3900 }, { status: "rejected", type: "full", amount: 3900 }]);
    expect(l.due).toBe(3900);
  });
  it("owes nothing once paid", () => {
    expect(ledger({ ...o, status: "paid" }, [paid(3900)])).toMatchObject({ outstanding: 0, due: 0, kind: null });
  });
});

describe("ledger — with a deposit", () => {
  const o = { status: "pending", total: 4000, depositAmount: 2000 };
  it("asks for the deposit while pending", () => {
    expect(ledger(o, [])).toMatchObject({ due: 2000, kind: "deposit", outstanding: 4000 });
    expect(upfront(o)).toBe(2000);
  });
  it("asks only for what is left of the deposit after a part-payment", () => {
    expect(ledger(o, [paid(500, "deposit")])).toMatchObject({ due: 1500, kind: "deposit" });
  });
  it("asks for the balance once in production", () => {
    expect(ledger({ ...o, status: "in_production" }, [paid(2000, "deposit")])).toMatchObject({ due: 2000, kind: "balance", outstanding: 2000 });
  });
  it("knows when the up-front part is covered", () => {
    expect(upfrontCovered(o, [paid(1999, "deposit")])).toBe(false);
    expect(upfrontCovered(o, [paid(2000, "deposit")])).toBe(true);
  });
  it("treats a deposit of zero or of the whole total as no deposit", () => {
    expect(ledger({ ...o, depositAmount: 0 }, []).kind).toBe("full");
    expect(ledger({ ...o, depositAmount: 4000 }, []).kind).toBe("full");
  });
});

describe("ledger — closed orders", () => {
  it("asks nothing of a cancelled or refunded order", () => {
    expect(ledger({ status: "cancelled", total: 1000, depositAmount: 1000 }, []).due).toBe(0);
    expect(ledger({ status: "refunded", total: 1000, depositAmount: 1000 }, [paid(1000)]).due).toBe(0);
  });
  it("does not count refunds as money in", () => {
    expect(ledger({ status: "paid", total: 1000, depositAmount: 1000 }, [paid(1000), { status: "paid", type: "refund", amount: 1000 }]).paid).toBe(1000);
  });
});
