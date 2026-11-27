import { describe, it, expect } from "vitest";
import { LoginSchema, RegisterSchema, VerifyEmailSchema } from "./auth.dto";

describe("VerifyEmailSchema", () => {
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

describe("RegisterSchema: sign-up is by email and password", () => {
  it("needs an email, a name and a password of 8 or more", () => {
    expect(RegisterSchema.safeParse({ email: "a@b.com", fullName: "A", password: "12345678" }).success).toBe(true);
    expect(RegisterSchema.safeParse({ email: "a@b.com", fullName: "A", password: "1234567" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: "a@b.com", fullName: "", password: "12345678" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: "nope", fullName: "A", password: "12345678" }).success).toBe(false);
  });
});
