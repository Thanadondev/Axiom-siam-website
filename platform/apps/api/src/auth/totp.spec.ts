import { describe, it, expect } from "vitest";
import {
  base32Encode, base32Decode, hotp, totp, verifyTotp,
  generateSecret, otpauthUrl, generateRecoveryCodes, hashRecoveryCode, consumeRecoveryCode,
} from "./totp";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const hex of ["", "00", "ff", "0102030405", "deadbeefcafe"]) {
      const buf = Buffer.from(hex, "hex");
      expect(base32Decode(base32Encode(buf))).toEqual(buf);
    }
  });

  it("matches known encodings", () => {
    expect(base32Encode(Buffer.from("Hello!\xDE\xAD\xBE\xEF", "binary"))).toBe("JBSWY3DPEHPK3PXP");
  });

  it("ignores padding, whitespace and case", () => {
    expect(base32Decode("jbswy3dp")).toEqual(base32Decode("JBSWY3DP"));
    expect(base32Decode("JBSW Y3DP===")).toEqual(base32Decode("JBSWY3DP"));
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("JBSW1801")).toThrow();
  });
});

describe("hotp — RFC 4226 test vectors", () => {
  // secret "12345678901234567890"
  const secret = Buffer.from("12345678901234567890");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];

  it.each(expected.map((c, i) => [i, c]))("counter %i → %s", (counter, code) => {
    expect(hotp(secret, counter as number)).toBe(code);
  });
});

describe("totp — RFC 6238 test vectors (SHA1)", () => {
  // RFC 6238 uses secret "12345678901234567890"; codes below are 8-digit in the RFC,
  // we assert the 6-digit truncation that authenticator apps actually use.
  const secretB32 = base32Encode(Buffer.from("12345678901234567890"));

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("t=%i → %s", (t, code) => {
    expect(totp(secretB32, t as number)).toBe(code);
  });

  it("is stable across a 30-second step and changes after it", () => {
    expect(totp(secretB32, 60)).toBe(totp(secretB32, 89));
    expect(totp(secretB32, 60)).not.toBe(totp(secretB32, 90));
  });
});

describe("verifyTotp", () => {
  const secret = generateSecret();
  const t = 1_700_000_000;

  it("accepts the current code", () => {
    expect(verifyTotp(secret, totp(secret, t), { atSeconds: t })).toBe(true);
  });

  it("tolerates one step of clock drift either way", () => {
    expect(verifyTotp(secret, totp(secret, t - 30), { atSeconds: t })).toBe(true);
    expect(verifyTotp(secret, totp(secret, t + 30), { atSeconds: t })).toBe(true);
  });

  it("rejects two steps of drift", () => {
    expect(verifyTotp(secret, totp(secret, t - 60), { atSeconds: t })).toBe(false);
    expect(verifyTotp(secret, totp(secret, t + 60), { atSeconds: t })).toBe(false);
  });

  it("rejects a wrong code", () => {
    const good = totp(secret, t);
    const bad = good === "000000" ? "000001" : "000000";
    expect(verifyTotp(secret, bad, { atSeconds: t })).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    for (const junk of ["", "12345", "1234567", "abcdef", "12 34 56", null as any, undefined as any]) {
      expect(verifyTotp(secret, junk, { atSeconds: t })).toBe(false);
    }
  });

  it("rejects a code generated from a different secret", () => {
    expect(verifyTotp(secret, totp(generateSecret(), t), { atSeconds: t })).toBe(false);
  });
});

describe("generateSecret", () => {
  it("produces a 160-bit base32 secret", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s).length).toBe(20);
  });

  it("is never the same twice", () => {
    const set = new Set(Array.from({ length: 50 }, generateSecret));
    expect(set.size).toBe(50);
  });
});

describe("otpauthUrl", () => {
  it("builds a scannable URI", () => {
    const url = otpauthUrl("JBSWY3DP", "admin@axiom.co.th");
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("secret=JBSWY3DP");
    expect(url).toContain("issuer=Axiom+Siam");
    expect(url).toContain("period=30");
  });

  it("escapes the account label", () => {
    expect(otpauthUrl("AAAA", "a b@x.com")).toContain("Axiom%20Siam%3Aa%20b%40x.com");
  });
});

describe("recovery codes", () => {
  it("issues distinct, formatted codes and stores only hashes", () => {
    const { plain, hashed } = generateRecoveryCodes(8);
    expect(plain).toHaveLength(8);
    expect(new Set(plain).size).toBe(8);
    for (const c of plain) expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    for (const h of hashed) expect(h).toMatch(/^[0-9a-f]{64}$/);
    // the plaintext never equals what we persist
    expect(hashed).not.toContain(plain[0]);
  });

  it("consumes a code exactly once", () => {
    const { plain, hashed } = generateRecoveryCodes(3);
    const left = consumeRecoveryCode(plain[1], hashed);
    expect(left).toHaveLength(2);
    expect(left).not.toContain(hashRecoveryCode(plain[1]));
    // the same code cannot be reused against the reduced set
    expect(consumeRecoveryCode(plain[1], left!)).toBeNull();
  });

  it("is case- and whitespace-insensitive", () => {
    const { plain, hashed } = generateRecoveryCodes(2);
    expect(consumeRecoveryCode(`  ${plain[0].toLowerCase()} `, hashed)).toHaveLength(1);
  });

  it("returns null for an unknown code", () => {
    const { hashed } = generateRecoveryCodes(2);
    expect(consumeRecoveryCode("ZZZZZ-ZZZZZ", hashed)).toBeNull();
  });
});
