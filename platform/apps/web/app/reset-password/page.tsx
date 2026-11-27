"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";
import { tri, useLang, type Lang } from "../../lib/i18n";

/** set a new password from the emailed link — in Thai, English or Japanese */
function ResetInner({ lang }: { lang: Lang }) {
  const L = tri(lang);
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (pw.length < 8) { setErr(L("รหัสผ่านอย่างน้อย 8 ตัวอักษร", "The password needs at least 8 characters", "パスワードは8文字以上にしてください")); return; }
    if (pw !== pw2) { setErr(L("รหัสผ่านทั้งสองช่องไม่ตรงกัน", "The two passwords don't match", "パスワードが一致しません")); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: pw }) });
      setMsg(L("ตั้งรหัสผ่านใหม่สำเร็จ ✓ กำลังพาไปหน้าเข้าสู่ระบบ...", "Your new password is set ✓ Taking you to sign in…", "新しいパスワードを設定しました ✓ ログイン画面へ移動します…"));
      setTimeout(() => router.push("/login"), 1500);
    } catch (e: any) {
      // the API answers in Thai; a 400 here is a link that's wrong, used or more than an hour old
      setErr(lang === "th" ? e.message
        : e.status === 400 ? L("", "This link is wrong or has expired — please ask for a new one", "このリンクは無効か期限切れです。もう一度リンクをお申し込みください")
        : L("", "Couldn't set the password — please try again", "パスワードを設定できませんでした。もう一度お試しください"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="acard center">
        <h1 className="atitle">{L("ลิงก์ไม่ถูกต้อง", "This link doesn't work", "無効なリンクです")}</h1>
        <p className="asub">{L("ไม่พบโทเคนสำหรับตั้งรหัสผ่านใหม่ กรุณาขอลิงก์ใหม่อีกครั้ง", "It has no code for setting a new password — please ask for a new link", "パスワード再設定用のコードがありません。もう一度リンクをお申し込みください")}</p>
        <Link href="/forgot-password" className="abtn solid block" style={{ marginTop: 18 }}>{L("ขอลิงก์รีเซ็ตใหม่", "Ask for a new link", "リンクを再送信")}</Link>
      </div>
    );
  }

  return (
    <form className="acard" onSubmit={onSubmit}>
      <div className="eyebrow">AXIOM SIAM</div>
      <h1 className="atitle">{L("ตั้งรหัสผ่านใหม่", "Set a new password", "新しいパスワードの設定")}</h1>
      <p className="asub">{L("กรอกรหัสผ่านใหม่ของคุณ", "Enter your new password", "新しいパスワードを入力してください")}</p>

      <label className="flabel" htmlFor="rp-pw">{L("รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)", "New password (at least 8 characters)", "新しいパスワード（8文字以上）")}</label>
      <input id="rp-pw" className="ainput" type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />

      <label className="flabel" htmlFor="rp-pw2">{L("ยืนยันรหัสผ่านใหม่", "Confirm the new password", "新しいパスワード（確認）")}</label>
      <input id="rp-pw2" className="ainput" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />

      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}

      <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
        {loading ? L("กำลังบันทึก...", "Saving…", "保存中…") : L("ตั้งรหัสผ่านใหม่", "Set the new password", "パスワードを設定")}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const [lang, setLang] = useLang();
  return (
    <AppShell auth lang={lang} onLang={setLang}>
      <Suspense fallback={<div className="acard"><p className="asub">{tri(lang)("กำลังโหลด...", "Loading…", "読み込み中…")}</p></div>}>
        <ResetInner lang={lang} />
      </Suspense>
    </AppShell>
  );
}
