import { describe, it, expect } from "vitest";
import { verifyMail, resetMail } from "./mail.service";

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
