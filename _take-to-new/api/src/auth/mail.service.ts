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
  async sendVerifyEmail(email: string, token: string) {
    const url = `${this.site}/verify?token=${encodeURIComponent(token)}`;
    await this.send(email, "ยืนยันอีเมลของคุณ — Axiom Siam",
      layout("ยืนยันอีเมล", "แตะปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน Axiom Siam", "ยืนยันอีเมล", url,
        "ลิงก์นี้หมดอายุใน 24 ชั่วโมง หากคุณไม่ได้สมัครสมาชิก ข้ามอีเมลนี้ได้เลย"),
      "verify-email", url);
  }

  async sendResetEmail(email: string, token: string) {
    const url = `${this.site}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(email, "รีเซ็ตรหัสผ่าน — Axiom Siam",
      layout("รีเซ็ตรหัสผ่าน", "เราได้รับคำขอรีเซ็ตรหัสผ่านของบัญชีนี้ แตะปุ่มด้านล่างเพื่อตั้งรหัสใหม่", "ตั้งรหัสผ่านใหม่", url,
        "ลิงก์นี้หมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ขอรีเซ็ต ไม่ต้องทำอะไร รหัสเดิมยังใช้ได้"),
      "reset-password", url);
  }

}

/** minimal, email-client-safe HTML (inline styles, single column) */
function layout(heading: string, body: string, cta: string, url: string, note: string) {
  const esc = (s: string) => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  return `<!doctype html><html><body style="margin:0;background:#eef1f7;font-family:'Segoe UI',Tahoma,sans-serif;color:#0f1e3d">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="font-family:Arial,sans-serif;font-weight:800;letter-spacing:1px;font-size:20px;color:#2563eb;margin-bottom:20px">AXIOM SIAM</div>
    <div style="background:#fff;border:1px solid #dbe4f5;border-radius:16px;padding:28px 26px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
      <p style="font-size:14px;line-height:1.7;color:#334155">${esc(body)}</p>
      <a href="${url}" style="display:inline-block;margin:18px 0;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:30px">${esc(cta)}</a>
      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:14px 0 0">${esc(note)}</p>
      <p style="font-size:11px;color:#94a3b8;line-height:1.6;margin:12px 0 0;word-break:break-all">หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้: ${esc(url)}</p>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px">© Axiom Siam Co.,Ltd.</p>
  </div></body></html>`;
}
