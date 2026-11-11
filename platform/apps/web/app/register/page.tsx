"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import AppShell from "../../components/AppShell";
import AuthAlternatives from "../../components/AuthAlternatives";
import { nextPath } from "../../lib/next-path";
import { tri, useLang } from "../../lib/i18n";

/** sign up — in Thai, English or Japanese; afterwards, back to where they were going (?next=) */
export default function RegisterPage() {
  const { register, login } = useAuth();
  const router = useRouter();
  const [lang, setLang] = useLang();
  const L = tri(lang);
  const th = lang === "th";
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", companyName: "", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const r = await register(form);
      setMsg(th ? `${r.message} — กำลังเข้าสู่ระบบ...` : L("", "Account created — signing you in…", "アカウントを作成しました。ログインしています…"));
      try {
        await login(form.email, form.password);
        router.push(nextPath());
      } catch {
        setMsg(th ? `${r.message} — ตรวจอีเมลเพื่อยืนยัน (dev: ดูลิงก์ที่ console ของ API)` : L("", "Account created — please check your email to confirm it", "アカウントを作成しました。確認メールをご確認ください"));
      }
    } catch (e: any) {
      // the API answers in Thai: in other languages, say it by what kind of failure it was
      setErr(th ? e.message
        : e.status === 409 ? L("", "This email already has an account — please sign in", "このメールアドレスは登録済みです。ログインしてください")
        : e.status === 429 ? L("", "Too many sign-ups from here — please try again later", "登録の試行回数が多すぎます。時間をおいてお試しください")
        : e.status === 400 ? L("", "Please check your details (password at least 8 characters)", "入力内容をご確認ください（パスワードは8文字以上）")
        : L("", "Couldn't create the account — please try again", "アカウントを作成できませんでした。もう一度お試しください"));
    } finally {
      setLoading(false);
    }
  }

  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
  return (
    <AppShell auth lang={lang} onLang={setLang}>
      <form className="acard" onSubmit={onSubmit}>
        <div className="eyebrow">AXIOM SIAM</div>
        <h1 className="atitle">{L("สมัครสมาชิก", "Sign up", "新規登録")}</h1>
        <p className="asub">{L("สร้างบัญชีเพื่อบันทึกดีไซน์ ขอใบเสนอราคา และสั่งผลิต", "Create an account to save designs, send your files and place orders", "デザインの保存、データ入稿、ご注文のためのアカウントを作成します")}</p>

        <label className="flabel" htmlFor="rg-name">{L("ชื่อ-นามสกุล *", "Full name *", "お名前 *")}</label>
        <input id="rg-name" className="ainput" required autoComplete="name" value={form.fullName} onChange={set("fullName")} placeholder={L("เช่น สมชาย ใจดี", "e.g. Taro Yamada", "例：山田 太郎")} />

        <label className="flabel" htmlFor="rg-email">{L("อีเมล *", "Email *", "メールアドレス *")}</label>
        <input id="rg-email" className="ainput" type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@email.com" />

        <div className="row2">
          <div>
            <label className="flabel" htmlFor="rg-phone">{L("เบอร์โทร", "Phone", "電話番号")}</label>
            <input id="rg-phone" className="ainput" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder={L("08X-XXX-XXXX", "+81 …", "090-XXXX-XXXX")} />
          </div>
          <div>
            <label className="flabel" htmlFor="rg-team">{L("ชื่อบริษัท / ทีม", "Team / company", "チーム名・会社名")}</label>
            <input id="rg-team" className="ainput" value={form.companyName} onChange={set("companyName")} placeholder={L("(ถ้ามี)", "(optional)", "（任意）")} />
          </div>
        </div>

        <label className="flabel" htmlFor="rg-pw">{L("รหัสผ่าน (อย่างน้อย 8 ตัว) *", "Password (at least 8 characters) *", "パスワード（8文字以上）*")}</label>
        <input id="rg-pw" className="ainput" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} />

        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? L("กำลังสมัคร...", "Creating your account…", "登録中…") : L("สมัครสมาชิก", "Sign up", "登録する")}
        </button>

        <AuthAlternatives lang={lang} />

        <p className="asub center" style={{ marginTop: 18 }}>
          {L("มีบัญชีแล้ว?", "Already have an account?", "アカウントをお持ちの方は")}{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} style={{ color: "var(--brand)", fontWeight: 600 }}>{L("เข้าสู่ระบบ", "Sign in", "ログイン")}</Link>
        </p>
      </form>
    </AppShell>
  );
}
