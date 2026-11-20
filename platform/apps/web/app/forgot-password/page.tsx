"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";
import { tri, useLang } from "../../lib/i18n";

/** ask for a link to set a new password — in Thai, English or Japanese, like sign-in */
export default function ForgotPasswordPage() {
  const [lang, setLang] = useLang();
  const L = tri(lang);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg(""); setLoading(true);
    try {
      const r = await apiFetch<{ message: string }>("/auth/request-reset", {
        method: "POST",
        body: JSON.stringify({ email, locale: lang }),
      });
      // the API answers in Thai, and the same whether or not the email has an account
      const sent = L(r.message, "If this email has an account, we've sent it a link to set a new password", "このメールアドレスが登録されていれば、パスワード再設定のリンクをお送りしました");
      setMsg(sent + (process.env.NODE_ENV === "production" ? "" : " (dev: ดูลิงก์รีเซ็ตที่ console ของ API)"));
    } catch (e: any) {
      setErr(lang === "th" ? e.message
        : e.status === 429 ? L("", "Too many requests — please wait a few minutes", "リクエストが多すぎます。数分後にお試しください")
        : L("", "Couldn't send the link — please try again", "リンクを送信できませんでした。もう一度お試しください"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell auth lang={lang} onLang={setLang}>
      <form className="acard" onSubmit={onSubmit}>
        <div className="eyebrow">AXIOM SIAM</div>
        <h1 className="atitle">{L("ลืมรหัสผ่าน", "Forgot your password?", "パスワードをお忘れの方")}</h1>
        <p className="asub">{L("กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้", "Enter the email you signed up with and we'll send you a link to set a new password", "ご登録のメールアドレスを入力してください。パスワード再設定のリンクをお送りします")}</p>

        <label className="flabel" htmlFor="fp-email">{L("อีเมล", "Email", "メールアドレス")}</label>
        <input id="fp-email" className="ainput" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />

        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? L("กำลังส่ง...", "Sending…", "送信中…") : L("ส่งลิงก์รีเซ็ต", "Send the link", "リンクを送信")}
        </button>

        <p className="asub center" style={{ marginTop: 18 }}>
          {L("จำรหัสได้แล้ว?", "Remembered it?", "パスワードを思い出した方は")}{" "}
          <Link href="/login" style={{ color: "var(--brand)", fontWeight: 600 }}>{L("เข้าสู่ระบบ", "Sign in", "ログイン")}</Link>
        </p>
      </form>
    </AppShell>
  );
}
