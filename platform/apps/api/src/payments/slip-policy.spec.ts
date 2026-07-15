import { describe, it, expect } from "vitest";
import { judgeSlip, ManualSlipReader, AMOUNT_TOLERANCE_BAHT, MAX_SLIP_AGE_DAYS } from "./slip-policy";

const NOW = new Date("2026-07-15T12:00:00Z");
const base = { expected: 4500, now: NOW };
const goodFacts = { amount: 4500, ref: "0151234567890", transferredAt: new Date("2026-07-15T11:30:00Z") };

describe("judgeSlip — happy path", () => {
  it("accepts an exact-amount, referenced, recent slip", () => {
    expect(judgeSlip(goodFacts, base)).toEqual({ decision: "accept" });
  });

  it("tolerates rounding within the tolerance", () => {
    expect(judgeSlip({ ...goodFacts, amount: 4500 + AMOUNT_TOLERANCE_BAHT }, base).decision).toBe("accept");
    expect(judgeSlip({ ...goodFacts, amount: 4500 - AMOUNT_TOLERANCE_BAHT }, base).decision).toBe("accept");
  });
});

describe("judgeSlip — reuse is rejected before anything else", () => {
  it("rejects a ref already used by another order", () => {
    const r = judgeSlip(goodFacts, { ...base, usedRefs: new Set(["0151234567890"]) });
    expect(r.decision).toBe("reject");
    expect(r.reason).toContain("ซ้ำ");
  });

  it("rejects a re-uploaded identical image", () => {
    const r = judgeSlip(goodFacts, { ...base, hash: "abc", usedHashes: new Set(["abc"]) });
    expect(r.decision).toBe("reject");
  });

  it("rejects a duplicate even when the amount is perfect", () => {
    // reuse must win over a correct amount, or one valid slip pays two orders
    const r = judgeSlip(goodFacts, { ...base, usedRefs: new Set(["0151234567890"]) });
    expect(r.decision).toBe("reject");
  });
});

describe("judgeSlip — money", () => {
  it("rejects underpayment beyond tolerance", () => {
    const r = judgeSlip({ ...goodFacts, amount: 4000 }, base);
    expect(r.decision).toBe("reject");
    expect(r.reason).toContain("น้อยกว่า");
  });

  it("sends overpayment to review rather than accepting it", () => {
    // someone is owed a refund — a human decides
    const r = judgeSlip({ ...goodFacts, amount: 5000 }, base);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("เกิน");
  });

  it("reviews when the amount could not be read", () => {
    expect(judgeSlip({ ...goodFacts, amount: null }, base).decision).toBe("review");
    expect(judgeSlip({ ref: "x" }, base).decision).toBe("review");
  });
});

describe("judgeSlip — wrong account", () => {
  it("rejects a transfer that landed elsewhere", () => {
    const r = judgeSlip({ ...goodFacts, receiverAccount: "xxx-x-x9999-x" }, { ...base, ourAccountTail: "1234" });
    expect(r.decision).toBe("reject");
    expect(r.reason).toContain("บัญชีอื่น");
  });

  it("accepts when the tail matches", () => {
    const r = judgeSlip({ ...goodFacts, receiverAccount: "xxx-x-x1234-x" }, { ...base, ourAccountTail: "1234" });
    expect(r.decision).toBe("accept");
  });

  it("ignores the check when we can't read the receiver", () => {
    const r = judgeSlip({ ...goodFacts, receiverAccount: null }, { ...base, ourAccountTail: "1234" });
    expect(r.decision).toBe("accept");
  });
});

describe("judgeSlip — time", () => {
  it("reviews a slip older than the window", () => {
    const old = new Date(NOW.getTime() - (MAX_SLIP_AGE_DAYS + 1) * 86_400_000);
    const r = judgeSlip({ ...goodFacts, transferredAt: old }, base);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("เก่ากว่า");
  });

  it("accepts a slip just inside the window", () => {
    const recent = new Date(NOW.getTime() - (MAX_SLIP_AGE_DAYS - 1) * 86_400_000);
    expect(judgeSlip({ ...goodFacts, transferredAt: recent }, base).decision).toBe("accept");
  });

  it("reviews a future-dated slip", () => {
    const future = new Date(NOW.getTime() + 60 * 60_000);
    const r = judgeSlip({ ...goodFacts, transferredAt: future }, base);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("อนาคต");
  });

  it("forgives small clock skew", () => {
    const skewed = new Date(NOW.getTime() + 5 * 60_000);
    expect(judgeSlip({ ...goodFacts, transferredAt: skewed }, base).decision).toBe("accept");
  });
});

describe("judgeSlip — missing ref", () => {
  it("reviews a slip with no reference, since reuse can't be blocked", () => {
    const r = judgeSlip({ ...goodFacts, ref: null }, base);
    expect(r.decision).toBe("review");
    expect(r.reason).toContain("เลขอ้างอิง");
  });
});

describe("ManualSlipReader", () => {
  it("is disabled and reads nothing, so every slip lands in review", async () => {
    const reader = new ManualSlipReader();
    expect(reader.enabled).toBe(false);
    const facts = await reader.read();
    expect(judgeSlip(facts, base).decision).toBe("review");
  });
});
