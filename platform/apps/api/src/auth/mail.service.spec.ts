import { describe, it, expect } from "vitest";
import { verifyMail, resetMail, mailConfig, MailService } from "./mail.service";

describe("sign-up and password emails come in the account's language", () => {
  const url = "https://axiomsiam.com/verify?token=abc&x=1";

  it("Thai, English or Japanese; anything else is Thai", () => {
    expect(verifyMail("th", url).subject).toContain("ยืนยันอีเมล");
    expect(verifyMail("en", url).subject).toBe("Confirm your email — Axiom Siam");
    expect(verifyMail("ja", url).subject).toContain("メールアドレスの確認");
    expect(resetMail("ja", url).html).toContain('<html lang="ja">');
    expect(resetMail("ja", url).html).toContain("新しいパスワードを設定する");
    expect(resetMail("fr", url).subject).toContain("รีเซ็ตรหัสผ่าน");
    expect(resetMail(null, url).subject).toContain("รีเซ็ตรหัสผ่าน");
  });

  it("the link is in the button and spelled out, escaped", () => {
    const { html } = verifyMail("en", url);
    expect(html).toContain('href="https://axiomsiam.com/verify?token=abc&amp;x=1"');
    expect(html).toContain("If the button doesn't work, copy this link: https://axiomsiam.com/verify?token=abc&amp;x=1");
  });
});

describe("mail set-up on the live site (orders need a confirmed email)", () => {
  const live = { NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "Axiom Siam <no-reply@axiomsiam.com>", NEXT_PUBLIC_SITE_URL: "https://axiomsiam.com" };

  it("set up right: no warnings", () => {
    expect(mailConfig(live)).toEqual({ mode: "resend", from: live.EMAIL_FROM, warnings: [] });
  });

  it("no key", () => {
    const c = mailConfig({ ...live, RESEND_API_KEY: "" });
    expect(c.mode).toBe("console");
    expect(c.warnings.join()).toContain("RESEND_API_KEY");
  });

  it("Resend's test sender, which only reaches the Resend account's owner", () => {
    expect(mailConfig({ ...live, EMAIL_FROM: "" }).warnings.join()).toContain("onboarding@resend.dev");
    expect(mailConfig({ ...live, EMAIL_FROM: "Axiom <onboarding@resend.dev>" }).warnings).toHaveLength(1);
  });

  it("links that point at localhost", () => {
    expect(mailConfig({ ...live, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }).warnings.join()).toContain("NEXT_PUBLIC_SITE_URL");
    expect(mailConfig({ ...live, NEXT_PUBLIC_SITE_URL: undefined }).warnings).toHaveLength(1);
  });

  it("dev without a key is fine (the link goes to the console)", () => {
    expect(mailConfig({ NODE_ENV: "development" }).warnings).toEqual([]);
  });
});

describe("whether a mail went", () => {
  const send = async (env: Record<string, string>, fetchImpl?: typeof fetch) => {
    const saved = { ...process.env }, savedFetch = globalThis.fetch;
    Object.assign(process.env, env);
    if (fetchImpl) globalThis.fetch = fetchImpl;
    try { return await new MailService().sendVerifyEmail("a@axiom.test", "tok", "th"); }
    finally { process.env = saved; globalThis.fetch = savedFetch; }
  };

  it("dev without a key: printed, counts as sent", async () => {
    expect(await send({ NODE_ENV: "development", RESEND_API_KEY: "" })).toBe(true);
  });

  it("the live site without a key: not sent", async () => {
    expect(await send({ NODE_ENV: "production", RESEND_API_KEY: "" })).toBe(false);
  });

  it("Resend refuses it (e.g. a domain not verified): not sent", async () => {
    const refused = (async () => new Response('{"message":"domain is not verified"}', { status: 403 })) as typeof fetch;
    expect(await send({ NODE_ENV: "production", RESEND_API_KEY: "re_x" }, refused)).toBe(false);
  });

  it("Resend unreachable: not sent", async () => {
    const down = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
    expect(await send({ NODE_ENV: "production", RESEND_API_KEY: "re_x" }, down)).toBe(false);
  });

  it("Resend takes it: sent", async () => {
    const okRes = (async () => new Response('{"id":"x"}', { status: 200 })) as typeof fetch;
    expect(await send({ NODE_ENV: "production", RESEND_API_KEY: "re_x" }, okRes)).toBe(true);
  });
});
