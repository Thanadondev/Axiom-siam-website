import { describe, it, expect } from "vitest";
import {
  crc16, tlv, parseTlv, normalizeTarget, formatAmount,
  buildPromptPayPayload, verifyPayload,
} from "./promptpay";

describe("crc16 (CCITT-FALSE)", () => {
  it("matches the standard check value", () => {
    // the canonical check vector for CRC-16/CCITT-FALSE — if this passes,
    // the implementation is right, no need to trust a hand-copied payload
    expect(crc16("123456789")).toBe(0x29b1);
  });

  it("is sensitive to every byte", () => {
    expect(crc16("A")).not.toBe(crc16("B"));
    expect(crc16("AB")).not.toBe(crc16("BA"));
  });
});

describe("tlv", () => {
  it("pads the length to two digits", () => {
    expect(tlv("00", "01")).toBe("000201");
    expect(tlv("58", "TH")).toBe("5802TH");
  });

  it("handles values longer than 9 chars", () => {
    expect(tlv("00", "A000000677010111")).toBe("0016A000000677010111");
  });

  it("round-trips through parseTlv", () => {
    const s = tlv("00", "01") + tlv("53", "764") + tlv("58", "TH");
    expect(parseTlv(s)).toEqual({ "00": "01", "53": "764", "58": "TH" });
  });
});

describe("normalizeTarget — phone", () => {
  it("accepts every way a Thai number gets written", () => {
    const expected = { tag: "01", value: "0066812345678" };
    expect(normalizeTarget("0812345678", "phone")).toEqual(expected);
    expect(normalizeTarget("081-234-5678", "phone")).toEqual(expected);
    expect(normalizeTarget("+66812345678", "phone")).toEqual(expected);
    expect(normalizeTarget("66812345678", "phone")).toEqual(expected);
    expect(normalizeTarget("0066812345678", "phone")).toEqual(expected);
  });

  it("rejects a number that isn't 9 local digits", () => {
    expect(() => normalizeTarget("08123456", "phone")).toThrow();
    expect(() => normalizeTarget("08123456789", "phone")).toThrow();
    expect(() => normalizeTarget("", "phone")).toThrow();
  });
});

describe("normalizeTarget — id / ewallet", () => {
  it("takes a 13-digit national id as-is", () => {
    expect(normalizeTarget("1234567890123", "natid")).toEqual({ tag: "02", value: "1234567890123" });
    expect(normalizeTarget("1-2345-67890-12-3", "natid")).toEqual({ tag: "02", value: "1234567890123" });
  });

  it("rejects a wrong-length national id", () => {
    expect(() => normalizeTarget("123", "natid")).toThrow();
  });

  it("takes a 15-digit e-wallet id", () => {
    expect(normalizeTarget("123456789012345", "ewallet")).toEqual({ tag: "03", value: "123456789012345" });
    expect(() => normalizeTarget("12345", "ewallet")).toThrow();
  });
});

describe("formatAmount", () => {
  it("always writes two decimals", () => {
    expect(formatAmount(1)).toBe("1.00");
    expect(formatAmount(1250)).toBe("1250.00");
    expect(formatAmount(99.5)).toBe("99.50");
    expect(formatAmount(0.25)).toBe("0.25");
  });

  it("refuses amounts a bank would reject", () => {
    expect(() => formatAmount(0)).toThrow();
    expect(() => formatAmount(-5)).toThrow();
    expect(() => formatAmount(NaN)).toThrow();
    expect(() => formatAmount(Infinity)).toThrow();
    expect(() => formatAmount(10_000_000)).toThrow();
  });
});

describe("buildPromptPayPayload", () => {
  it("produces the documented field layout for a phone + amount", () => {
    const p = buildPromptPayPayload({ target: "0899999999", type: "phone", amount: 1 });
    const f = parseTlv(p);

    expect(f["00"]).toBe("01");        // format indicator
    expect(f["01"]).toBe("12");        // dynamic — has an amount
    expect(f["53"]).toBe("764");       // THB
    expect(f["54"]).toBe("1.00");
    expect(f["58"]).toBe("TH");

    // merchant block carries the PromptPay AID + the country-coded phone
    expect(parseTlv(f["29"])).toEqual({ "00": "A000000677010111", "01": "0066899999999" });
    expect(p.startsWith("00020101021229370016A00000067701011101130066899999999")).toBe(true);
  });

  it("marks a QR without an amount as reusable and omits tag 54", () => {
    const p = buildPromptPayPayload({ target: "0899999999" });
    const f = parseTlv(p);
    expect(f["01"]).toBe("11");
    expect(f["54"]).toBeUndefined();
  });

  it("appends a CRC that validates", () => {
    const p = buildPromptPayPayload({ target: "0812345678", amount: 1250 });
    expect(verifyPayload(p)).toBe(true);
    expect(p.slice(-8, -4)).toBe("6304");   // crc field header
    expect(p.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it("changes the CRC when the amount changes — a tampered QR fails", () => {
    const a = buildPromptPayPayload({ target: "0812345678", amount: 100 });
    const b = buildPromptPayPayload({ target: "0812345678", amount: 200 });
    expect(a).not.toBe(b);

    // swap the amount but keep the old CRC — must not validate
    const tampered = a.replace("5406100.00", "5406200.00");
    expect(tampered).not.toBe(a);              // the edit actually landed
    expect(verifyPayload(tampered)).toBe(false);
  });

  it("routes national-id targets to tag 02", () => {
    const f = parseTlv(buildPromptPayPayload({ target: "1234567890123", type: "natid", amount: 50 }));
    expect(parseTlv(f["29"])["02"]).toBe("1234567890123");
    expect(parseTlv(f["29"])["01"]).toBeUndefined();
  });

  it("is deterministic — same input, same QR", () => {
    const opts = { target: "0812345678", amount: 999 } as const;
    expect(buildPromptPayPayload(opts)).toBe(buildPromptPayPayload(opts));
  });
});

describe("verifyPayload", () => {
  it("rejects a payload whose body was edited", () => {
    const p = buildPromptPayPayload({ target: "0812345678", amount: 100 });
    const broken = "9" + p.slice(1);   // payload starts "0002..." — this really changes a byte
    expect(broken).not.toBe(p);
    expect(verifyPayload(broken)).toBe(false);
  });

  it("rejects junk", () => {
    expect(verifyPayload("")).toBe(false);
    expect(verifyPayload("abc")).toBe(false);
  });
});
