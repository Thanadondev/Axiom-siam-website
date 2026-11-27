import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService, RESEND_VERIFY_PER_HOUR, TooManyLinks } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RATE_LIMIT_KEY } from "../common/rate-limit.guard";

/**
 * "Send the link again" and the link itself: a new link works, the ones before it don't,
 * an account already confirmed gets nothing sent.
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Tok = { id: string; userId: string; type: string; token: string; expiresAt: Date; revokedAt: Date | null; createdAt: Date };

function setup(isVerified = false) {
  const users = new Map([["u1", { id: "u1", email: "runner@axiom.test", locale: "ja", isVerified }]]);
  const tokens: Tok[] = [];
  const sent: { to: string; raw: string; lang?: string }[] = [];
  const match = (t: Tok, w: any) => Object.entries(w).every(([k, v]) => (t as any)[k] === v);
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => users.get(where.id) ?? null,
      update: async ({ where, data }: any) => Object.assign(users.get(where.id)!, data),
    },
    authToken: {
      create: async ({ data }: any) => { const t = { id: `t${tokens.length + 1}`, revokedAt: null, createdAt: new Date(), ...data }; tokens.push(t); return t; },
      findMany: async ({ where }: any) => tokens
        .filter(t => t.userId === where.userId && t.type === where.type && t.createdAt > where.createdAt.gt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      findUnique: async ({ where }: any) => tokens.find(t => t.token === where.token) ?? null,
      update: async ({ where, data }: any) => Object.assign(tokens.find(t => t.id === where.id)!, data),
      updateMany: async ({ where, data }: any) => { const hit = tokens.filter(t => match(t, where)); hit.forEach(t => Object.assign(t, data)); return { count: hit.length }; },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const mail: any = { sendVerifyEmail: async (to: string, raw: string, lang?: string) => { sent.push({ to, raw, lang }); } };
  return { svc: new AuthService(prisma, new JwtService({}), mail), users, tokens, sent };
}

describe("send the confirm link again", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("sends a new link to the account's address, in its language, good for 24 hours", async () => {
    expect(await s.svc.resendVerify("u1")).toEqual({ sent: true });
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({ to: "runner@axiom.test", lang: "ja" });
    const t = s.tokens[0];
    expect(t.type).toBe("email_verify");
    expect(t.token).toBe(sha(s.sent[0].raw)); // only the hash is kept
    const hours = (t.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it("the links sent before stop working; the newest one confirms the account", async () => {
    await s.svc.resendVerify("u1");
    await s.svc.resendVerify("u1");
    const [first, second] = s.sent.map(m => m.raw);
    expect(s.tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(s.tokens[1].revokedAt).toBeNull();
    await expect(s.svc.verifyEmail(first)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.users.get("u1")!.isVerified).toBe(false);
    expect(await s.svc.verifyEmail(second)).toEqual({ message: "ยืนยันอีเมลสำเร็จ" });
    expect(s.users.get("u1")!.isVerified).toBe(true);
  });

  it("a link works once only", async () => {
    await s.svc.resendVerify("u1");
    await s.svc.verifyEmail(s.sent[0].raw);
    await expect(s.svc.verifyEmail(s.sent[0].raw)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("an out-of-date link, or a password-reset token, doesn't confirm", async () => {
    await s.svc.resendVerify("u1");
    s.tokens[0].expiresAt = new Date(Date.now() - 1000);
    await expect(s.svc.verifyEmail(s.sent[0].raw)).rejects.toBeInstanceOf(BadRequestException);
    s.tokens.push({ id: "r1", userId: "u1", type: "password_reset", token: sha("reset-raw"), expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, createdAt: new Date() });
    await expect(s.svc.verifyEmail("reset-raw")).rejects.toBeInstanceOf(BadRequestException);
    expect(s.users.get("u1")!.isVerified).toBe(false);
  });

  it("leaves other kinds of token alone when it revokes the old links", async () => {
    s.tokens.push({ id: "r1", userId: "u1", type: "password_reset", token: sha("reset-raw"), expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, createdAt: new Date() });
    await s.svc.resendVerify("u1");
    expect(s.tokens.find(t => t.id === "r1")!.revokedAt).toBeNull();
  });

  it("an account already confirmed: nothing sent", async () => {
    const v = setup(true);
    expect(await v.svc.resendVerify("u1")).toEqual({ already: true });
    expect(v.sent).toHaveLength(0);
    expect(v.tokens).toHaveLength(0);
  });

  it("no such account: 401", async () => {
    await expect(s.svc.resendVerify("nobody")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.sent).toHaveLength(0);
  });
});

describe("how often the link can be sent again: 3 an hour per account", () => {
  const min = 60_000;
  /** the account's sign-up link, sent `ago` ms back */
  const signedUp = (s: ReturnType<typeof setup>, ago: number) =>
    s.tokens.push({ id: "t0", userId: "u1", type: "email_verify", token: sha("signup"), expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null, createdAt: new Date(Date.now() - ago) });

  it("the sign-up's link, then 3 more; the 4th is refused with the seconds to wait", async () => {
    const s = setup();
    signedUp(s, 10 * min);
    for (let i = 0; i < RESEND_VERIFY_PER_HOUR; i++) expect(await s.svc.resendVerify("u1")).toEqual({ sent: true });
    const e = await s.svc.resendVerify("u1").catch(x => x);
    expect(e).toBeInstanceOf(TooManyLinks);
    expect(e.getStatus()).toBe(429);
    // free again when the sign-up's link is an hour old: in 50 minutes
    expect(e.retryAfter).toBeGreaterThan(49 * 60);
    expect(e.retryAfter).toBeLessThanOrEqual(50 * 60);
    expect(e.getResponse().message).toBe(`พยายามหลายครั้งเกินไป กรุณารออีก ${e.retryAfter} วินาที`);
    expect(s.sent).toHaveLength(RESEND_VERIFY_PER_HOUR); // nothing sent for the refused one
  });

  it("links more than an hour old don't count", async () => {
    const s = setup();
    signedUp(s, 61 * min);
    for (let i = 0; i < RESEND_VERIFY_PER_HOUR + 1; i++) expect(await s.svc.resendVerify("u1")).toEqual({ sent: true });
  });

  it("one account's links don't count for another", async () => {
    const s = setup();
    s.users.set("u2", { id: "u2", email: "other@axiom.test", locale: "th", isVerified: false });
    for (let i = 0; i < RESEND_VERIFY_PER_HOUR + 1; i++) await s.svc.resendVerify("u1");
    await expect(s.svc.resendVerify("u1")).rejects.toBeInstanceOf(TooManyLinks);
    expect(await s.svc.resendVerify("u2")).toEqual({ sent: true });
  });
});

describe("POST /auth/resend-verify", () => {
  const handler = AuthController.prototype.resendVerify;

  it("needs a sign-in", () => {
    expect(Reflect.getMetadata("__guards__", handler)).toContain(JwtAuthGuard);
  });

  it("isn't limited by IP (a call without a sign-in would use up the office's links)", () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toBeUndefined();
  });

  it("a refusal carries Retry-After", async () => {
    const headers: Record<string, string> = {};
    const ctl = new AuthController({ resendVerify: async () => { throw new TooManyLinks(1234); } } as any);
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };
    await expect(ctl.resendVerify({ id: "u1" } as any, res as any)).rejects.toBeInstanceOf(TooManyLinks);
    expect(headers["Retry-After"]).toBe("1234");
  });
});
