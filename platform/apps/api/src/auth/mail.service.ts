import { Injectable, Logger } from "@nestjs/common";

/**
 * Transactional email.
 *
 * When RESEND_API_KEY is set, mail goes out via Resend's HTTP API (no SDK, just
 * fetch). Without a key it falls back to logging the link to the console, so
 * local dev and CI keep working — the flows are identical, only delivery
 * differs.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger("MailService");
  private site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  private from = process.env.EMAIL_FROM || "Axiom Siam <onboarding@resend.dev>";
  private key = process.env.RESEND_API_KEY || "";

  get enabled() {
    return !!this.key;
  }

  private async send(to: string, subject: string, html: string, tag: string, fallbackLink?: string) {
    if (!this.key) {
      // dev / CI: print what we would have sent
      this.log.log(`[${tag}] → ${to}${fallbackLink ? ` : ${fallbackLink}` : ""}`);
      return;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to, subject, html }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.log.error(`Resend ${res.status} sending "${subject}" to ${to}: ${body}`);
      } else {
        this.log.log(`[${tag}] sent to ${to}`);
      }
    } catch (e) {
      // email must never break the request that triggered it
      this.log.error(`Resend threw sending "${subject}" to ${to}: ${(e as Error).message}`);
    }
  }

  // ---------- templates ----------
  /** in the account's language: the one it signed up in, or the one its owner is reading the page in */
  async sendVerifyEmail(email: string, token: string, lang?: string | null) {
    const url = `${this.site}/verify?token=${encodeURIComponent(token)}`;
    const m = verifyMail(lang, url);
    await this.send(email, m.subject, m.html, "verify-email", url);
  }

  async sendResetEmail(email: string, token: string, lang?: string | null) {
    const url = `${this.site}/reset-password?token=${encodeURIComponent(token)}`;
    const m = resetMail(lang, url);
    await this.send(email, m.subject, m.html, "reset-password", url);
  }
}

export type MailLang = "th" | "en" | "ja";

type Copy = { subject: string; heading: string; body: string; cta: string; note: string };

/** "if the button doesn't work, copy this link:" */
const COPY_HINT: Record<MailLang, string> = {
  th: "หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้:",
  en: "If the button doesn't work, copy this link:",
  ja: "ボタンが動作しない場合は、次のリンクをコピーしてください：",
};

const VERIFY: Record<MailLang, Copy> = {
  th: {
    subject: "ยืนยันอีเมลของคุณ — Axiom Siam", heading: "ยืนยันอีเมล",
    body: "แตะปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน Axiom Siam", cta: "ยืนยันอีเมล",
    note: "ลิงก์นี้หมดอายุใน 24 ชั่วโมง หากคุณไม่ได้สมัครสมาชิก ข้ามอีเมลนี้ได้เลย",
  },
  en: {
    subject: "Confirm your email — Axiom Siam", heading: "Confirm your email",
    body: "Tap the button below to confirm your email and start using Axiom Siam.", cta: "Confirm my email",
    note: "This link expires in 24 hours. If you didn't sign up, you can ignore this email.",
  },
  ja: {
    subject: "メールアドレスの確認 — Axiom Siam", heading: "メールアドレスの確認",
    body: "下のボタンを押してメールアドレスを確認し、Axiom Siam のご利用を開始してください。", cta: "メールアドレスを確認する",
    note: "このリンクの有効期限は24時間です。お心当たりのない場合は、このメールを無視してください。",
  },
};

const RESET: Record<MailLang, Copy> = {
  th: {
    subject: "รีเซ็ตรหัสผ่าน — Axiom Siam", heading: "รีเซ็ตรหัสผ่าน",
    body: "เราได้รับคำขอรีเซ็ตรหัสผ่านของบัญชีนี้ แตะปุ่มด้านล่างเพื่อตั้งรหัสใหม่", cta: "ตั้งรหัสผ่านใหม่",
    note: "ลิงก์นี้หมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ขอรีเซ็ต ไม่ต้องทำอะไร รหัสเดิมยังใช้ได้",
  },
  en: {
    subject: "Set a new password — Axiom Siam", heading: "Set a new password",
    body: "We were asked to reset this account's password. Tap the button below to set a new one.", cta: "Set a new password",
    note: "This link expires in 1 hour. If you didn't ask for it, do nothing: your password stays as it is.",
  },
  ja: {
    subject: "パスワードの再設定 — Axiom Siam", heading: "パスワードの再設定",
    body: "このアカウントのパスワード再設定のご依頼を受け付けました。下のボタンから新しいパスワードを設定してください。", cta: "新しいパスワードを設定する",
    note: "このリンクの有効期限は1時間です。お心当たりのない場合は何もする必要はありません。現在のパスワードはそのままご利用いただけます。",
  },
};

/** Thai unless it's one of the other two */
const pick = (lang: string | null | undefined): MailLang => (lang === "en" || lang === "ja" ? lang : "th");

export function verifyMail(lang: string | null | undefined, url: string) {
  const l = pick(lang), c = VERIFY[l];
  return { subject: c.subject, html: layout(l, c, url) };
}

export function resetMail(lang: string | null | undefined, url: string) {
  const l = pick(lang), c = RESET[l];
  return { subject: c.subject, html: layout(l, c, url) };
}

/** minimal, email-client-safe HTML (inline styles, single column) */
function layout(lang: MailLang, c: Copy, url: string) {
  const esc = (s: string) => s.replace(/[<>&"]/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch]!));
  const font = lang === "ja" ? "'Segoe UI','Hiragino Sans','Meiryo',sans-serif" : "'Segoe UI',Tahoma,sans-serif";
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#eef1f7;font-family:${font};color:#0f1e3d">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="font-family:Arial,sans-serif;font-weight:800;letter-spacing:1px;font-size:20px;color:#2563eb;margin-bottom:20px">AXIOM SIAM</div>
    <div style="background:#fff;border:1px solid #dbe4f5;border-radius:16px;padding:28px 26px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(c.heading)}</h1>
      <p style="font-size:14px;line-height:1.7;color:#334155">${esc(c.body)}</p>
      <a href="${esc(url)}" style="display:inline-block;margin:18px 0;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:30px">${esc(c.cta)}</a>
      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:14px 0 0">${esc(c.note)}</p>
      <p style="font-size:11px;color:#94a3b8;line-height:1.6;margin:12px 0 0;word-break:break-all">${esc(COPY_HINT[lang])} ${esc(url)}</p>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px">© Axiom Siam Co.,Ltd.</p>
  </div></body></html>`;
}
