"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import AppShell from "../../components/AppShell";
import AuthAlternatives from "../../components/AuthAlternatives";
import { nextPath } from "../../lib/next-path";
import { tri, useLang } from "../../lib/i18n";

/** sign in — in Thai, English or Japanese (teams in Japan order bibs by zip) */
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [lang, setLang] = useLang();
  const L = tri(lang);
  const [form, setForm] = useState({ email: "", password: "" });
  const [totpCode, setTotpCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  /** the API answers in Thai: in other languages, say it by what kind of failure it was */
  const failure = (e: any) => lang === "th" ? e.message
    : e.status === 401 ? L("", "The email or password is incorrect", "メールアドレスまたはパスワードが正しくありません")
    : e.status === 429 ? L("", "Too many attempts — please wait a few minutes", "試行回数が多すぎます。数分後にお試しください")
    : e.status === 403 ? L("", "This account can't sign in — please contact us", "このアカウントではログインできません。お問い合わせください")
    : L("", "Couldn't sign in — please try again", "ログインできませんでした。もう一度お試しください");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(form.email, form.password, needs2fa ? totpCode : undefined);
      router.push(nextPath());
    } catch (e: any) {
      // the API answers 401 + { twoFactorRequired: true } when 2FA is enrolled
      if (e.body?.twoFactorRequired) {
        setNeeds2fa(true);
        setErr(totpCode ? failure(e) : "");
      } else {
        setErr(failure(e));
      }
    } finally {
      setLoading(false);
    }
  }

  // carry ?next= over to sign-up, so a new customer lands where they were going
  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
  return (
    <AppShell auth lang={lang} onLang={setLang}>
      <form className="acard" onSubmit={onSubmit}>
        <div className="eyebrow">AXIOM SIAM</div>
        <h1 className="atitle">{L("เข้าสู่ระบบ", "Sign in", "ログイン")}</h1>
        <p className="asub">{L("ยินดีต้อนรับกลับ 👋", "Welcome back 👋", "おかえりなさい 👋")}</p>

        <label className="flabel" htmlFor="li-email">{L("อีเมล", "Email", "メールアドレス")}</label>
        <input id="li-email" className="ainput" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />

        <label className="flabel" htmlFor="li-pw">{L("รหัสผ่าน", "Password", "パスワード")}</label>
        <input id="li-pw" className="ainput" type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

        {needs2fa && (
          <>
            <label className="flabel" htmlFor="li-2fa">{L("รหัสยืนยัน 2 ชั้น", "Two-step code", "2段階認証コード")}</label>
            <input id="li-2fa" className="ainput" inputMode="text" autoFocus required value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)} placeholder={L("6 หลักจากแอป หรือรหัสสำรอง", "6 digits from the app, or a backup code", "アプリの6桁、またはバックアップコード")} />
            <p className="asub" style={{ fontSize: 12, marginTop: 6 }}>
              {L("เปิดแอป Authenticator แล้วกรอกรหัส 6 หลัก · ถ้าเข้าแอปไม่ได้ ใช้รหัสสำรอง (XXXXX-XXXXX)", "Open your authenticator app and enter the 6-digit code · without the app, use a backup code (XXXXX-XXXXX)", "認証アプリの6桁のコードを入力してください · アプリが使えない場合はバックアップコード（XXXXX-XXXXX）")}
            </p>
          </>
        )}

        <div style={{ textAlign: "right", marginTop: 8 }}>
          <Link href="/forgot-password" style={{ color: "var(--brand)", fontSize: 13, fontWeight: 600 }}>{L("ลืมรหัสผ่าน?", "Forgot your password?", "パスワードをお忘れですか？")}</Link>
        </div>

        {err && <div className="err">{err}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? L("กำลังเข้าสู่ระบบ...", "Signing in…", "ログイン中…") : needs2fa ? L("ยืนยันรหัส", "Confirm code", "コードを確認") : L("เข้าสู่ระบบ", "Sign in", "ログイン")}
        </button>

        {!needs2fa && <AuthAlternatives lang={lang} />}

        <p className="asub center" style={{ marginTop: 18 }}>
          {L("ยังไม่มีบัญชี?", "No account yet?", "アカウントをお持ちでない方は")}{" "}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} style={{ color: "var(--brand)", fontWeight: 600 }}>{L("สมัครสมาชิก", "Sign up", "新規登録")}</Link>
        </p>
      </form>
    </AppShell>
  );
}
