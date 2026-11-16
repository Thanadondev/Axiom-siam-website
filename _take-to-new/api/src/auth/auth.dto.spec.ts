import { describe, it, expect } from "vitest";
import { LoginSchema, GoogleSignInSchema, VerifyEmailSchema } from "./auth.dto";

describe("GoogleSignInSchema", () => {
  it("accepts a plausible credential", () => {
    expect(GoogleSignInSchema.safeParse({ credential: "x".repeat(40) }).success).toBe(true);
  });
  it("rejects a too-short / missing credential", () => {
    expect(GoogleSignInSchema.safeParse({ credential: "short" }).success).toBe(false);
    expect(GoogleSignInSchema.safeParse({}).success).toBe(false);
  });
});

describe("VerifyEmailSchema (reused for magic-link consume)", () => {
  it("needs a token of reasonable length", () => {
    expect(VerifyEmailSchema.safeParse({ token: "a".repeat(20) }).success).toBe(true);
    expect(VerifyEmailSchema.safeParse({ token: "short" }).success).toBe(false);
  });
});

describe("LoginSchema still carries optional totpCode", () => {
  it("works without a code", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
  it("passes a code through", () => {
    const r = LoginSchema.safeParse({ email: "a@b.com", password: "x", totpCode: "123456" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.totpCode).toBe("123456");
  });
});
