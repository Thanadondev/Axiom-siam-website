import { describe, it, expect } from "vitest";
import { requiresCurrentPassword, canSetPassword, canDisableTotp } from "./password-policy";

describe("requiresCurrentPassword", () => {
  it("is required only when the account already has a password", () => {
    expect(requiresCurrentPassword(true)).toBe(true);
    expect(requiresCurrentPassword(false)).toBe(false);
  });
});

describe("canSetPassword", () => {
  it("a Google-only account sets its first password without a current one", () => {
    expect(canSetPassword(false, undefined, "longenough").ok).toBe(true);
  });

  it("a password account must supply the current password", () => {
    expect(canSetPassword(true, undefined, "longenough")).toEqual({ ok: false, reason: expect.stringContaining("ปัจจุบัน") });
    expect(canSetPassword(true, "old", "longenough").ok).toBe(true);
  });

  it("rejects a too-short new password regardless of account type", () => {
    expect(canSetPassword(false, undefined, "short").ok).toBe(false);
    expect(canSetPassword(true, "old", "1234567").ok).toBe(false);
    expect(canSetPassword(true, "old", "12345678").ok).toBe(true); // exactly 8
  });

  it("rejects an empty new password", () => {
    expect(canSetPassword(false, undefined, "").ok).toBe(false);
  });
});

describe("canDisableTotp", () => {
  const CODE_OK = true, CODE_BAD = false;

  it("a Google-only account disables with a valid code and no password", () => {
    // passwordMatches is irrelevant when hasPassword=false; the service passes true
    expect(canDisableTotp(false, true, CODE_OK).ok).toBe(true);
  });

  it("a Google-only account still needs a valid code", () => {
    expect(canDisableTotp(false, true, CODE_BAD).ok).toBe(false);
  });

  it("a password account must pass BOTH password and code", () => {
    expect(canDisableTotp(true, true, CODE_OK).ok).toBe(true);
    expect(canDisableTotp(true, false, CODE_OK)).toEqual({ ok: false, reason: expect.stringContaining("รหัสผ่าน") });
    expect(canDisableTotp(true, true, CODE_BAD)).toEqual({ ok: false, reason: expect.stringContaining("รหัสยืนยัน") });
  });

  it("reports the password problem before the code problem", () => {
    // a wrong password shouldn't leak whether the code was right
    const r = canDisableTotp(true, false, CODE_BAD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("รหัสผ่าน");
  });
});
