"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import { tri, type Lang } from "../lib/i18n";

interface Status { enabled: boolean; recoveryCodesLeft: number; recommended: boolean }

/** two-step sign-in, in the account page's language.
 *  No QR image (that would mean a public image endpoint): we show the secret for
 *  manual entry plus a link the phone can open. */
export default function TwoFactorCard({ lang = "th" }: { lang?: Lang }) {
  const L = tri(lang);
  const { token, user } = useAuth();
  const hasPassword = user?.hasPassword ?? true;
  const [st, setSt] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  /** the API answers in Thai: in other languages, say it by what kind of failure it was */
  const failure = (e: any) => lang === "th" ? e.message
    : e.status === 401 ? L("", "The current password is incorrect", "現在のパスワードが正しくありません")
    : e.status === 400 ? L("", "The code is incorrect — check the app and try again", "コードが正しくありません。アプリを確認してもう一度お試しください")
    : L("", "Something went wrong — please try again", "エラーが発生しました。もう一度お試しください");

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<Status>("/auth/2fa", { token }).then(setSt).catch(() => {});
  }, [token]);
  useEffect(load, [load]);

  async function start() {
    setErr(""); setBusy(true);
    try { setSetup(await apiFetch("/auth/2fa/setup", { method: "POST", token })); }
    catch (e: any) { setErr(failure(e)); }
    finally { setBusy(false); }
  }

  async function enable() {
    setErr(""); setBusy(true);
    try {
      const r = await apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/enable", {
        method: "POST", token, body: JSON.stringify({ code }),
      });
      setCodes(r.recoveryCodes);
      setSetup(null); setCode(""); setMsg(L("เปิดใช้งาน 2FA แล้ว ✓", "Two-step sign-in is on ✓", "2段階認証を有効にしました ✓"));
      load();
    } catch (e: any) { setErr(failure(e)); }
    finally { setBusy(false); }
  }

  async function disable() {
    setErr(""); setBusy(true);
    try {
      await apiFetch("/auth/2fa/disable", { method: "POST", token, body: JSON.stringify({ password: pw, code }) });
      setMsg(L("ปิด 2FA แล้ว", "Two-step sign-in is off", "2段階認証を無効にしました")); setPw(""); setCode(""); setCodes(null);
      load();
    } catch (e: any) { setErr(failure(e)); }
    finally { setBusy(false); }
  }

  if (!st) return null;

  return (
    <div className="acard">
      <div className="eyebrow">{L("ความปลอดภัย", "Security", "セキュリティ")}</div>
      <h2 className="ah2" style={{ marginTop: 6 }}>
        {L("ยืนยันตัวตน 2 ชั้น (2FA)", "Two-step sign-in (2FA)", "2段階認証（2FA）")}{" "}
        {st.enabled ? <span className="tag green">{L("เปิดอยู่", "On", "有効")}</span> : <span className="tag red">{L("ปิดอยู่", "Off", "無効")}</span>}
      </h2>
      <p className="asub">
        {st.recommended
          ? L("บัญชีผู้ดูแลระบบควรเปิด 2FA — รหัสผ่านที่รั่วอย่างเดียวจะเข้าระบบไม่ได้", "Admin accounts should turn this on — a leaked password alone won't get in", "管理者アカウントは有効にしてください。パスワードが漏れてもログインされません")
          : L("เพิ่มชั้นความปลอดภัยด้วยแอป Authenticator", "Add a second step with an authenticator app", "認証アプリでセキュリティを強化できます")}
      </p>

      {/* newly issued recovery codes — shown exactly once */}
      {codes && (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 12, padding: 14, marginTop: 12 }}>
          <b style={{ color: "#b45309" }}>⚠ {L("เก็บรหัสสำรองนี้ไว้ให้ดี — จะแสดงครั้งเดียวเท่านั้น", "Keep these backup codes safe — they're shown only once", "このバックアップコードは大切に保管してください。表示は一度だけです")}</b>
          <p className="dim" style={{ marginTop: 4 }}>{L("ใช้เข้าระบบได้เมื่อเข้าแอป Authenticator ไม่ได้ · ใช้ได้รหัสละครั้ง", "Sign in with one when you can't use the app · each works once", "アプリが使えないときのログイン用です · 各コードは1回のみ使えます")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 6, marginTop: 10 }}>
            {codes.map(c => (
              <code key={c} style={{ background: "var(--field-bg, #fff)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12.5, userSelect: "all" }}>{c}</code>
            ))}
          </div>
          <button className="minibtn" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard?.writeText(codes.join("\n")); setMsg(L("คัดลอกรหัสสำรองแล้ว", "Backup codes copied", "バックアップコードをコピーしました")); }}>{L("คัดลอกทั้งหมด", "Copy all", "すべてコピー")}</button>
          <button className="minibtn" style={{ marginTop: 10, marginLeft: 6 }} onClick={() => setCodes(null)}>{L("เก็บแล้ว ปิด", "Saved them — close", "保管しました（閉じる）")}</button>
        </div>
      )}

      {/* enrolment */}
      {!st.enabled && !setup && (
        <button className="abtn solid" style={{ marginTop: 14 }} disabled={busy} onClick={start}>{L("เริ่มตั้งค่า 2FA", "Set up 2FA", "2FAを設定する")}</button>
      )}

      {!st.enabled && setup && (
        <div style={{ marginTop: 14 }}>
          <p className="asub">{L("1. เปิดแอป Authenticator แล้วเพิ่มบัญชีด้วยคีย์นี้ (พิมพ์เอง):", "1. In your authenticator app, add an account with this key (type it in):", "1. 認証アプリを開き、このキーでアカウントを追加してください（手入力）：")}</p>
          <code style={{ display: "block", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, letterSpacing: 1, userSelect: "all", wordBreak: "break-all" }}>
            {setup.secret}
          </code>
          <p className="asub" style={{ marginTop: 8 }}>
            {L("หรือเปิดลิงก์นี้บนมือถือ:", "Or open this link on your phone:", "またはスマートフォンでこのリンクを開いてください：")}{" "}
            <a className="dlink" href={setup.otpauthUrl}>{L("เพิ่มลงแอปอัตโนมัติ", "Add it to the app", "アプリに自動で追加")}</a>
          </p>
          <label className="flabel">{L("2. กรอกรหัส 6 หลักที่แอปแสดง", "2. Enter the 6-digit code the app shows", "2. アプリに表示された6桁のコードを入力")}</label>
          <input className="ainput" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" style={{ maxWidth: 200 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="abtn solid" disabled={busy || code.length < 6} onClick={enable}>{L("ยืนยันและเปิดใช้งาน", "Confirm and turn on", "確認して有効にする")}</button>
            <button className="minibtn" disabled={busy} onClick={() => { setSetup(null); setCode(""); }}>{L("ยกเลิก", "Cancel", "キャンセル")}</button>
          </div>
        </div>
      )}

      {/* disable */}
      {st.enabled && (
        <div style={{ marginTop: 14 }}>
          <p className="dim">{L(`รหัสสำรองเหลือ ${st.recoveryCodesLeft} รหัส`, `${st.recoveryCodesLeft} backup code${st.recoveryCodesLeft === 1 ? "" : "s"} left`, `バックアップコード残り ${st.recoveryCodesLeft} 個`)}</p>
          <details>
            <summary style={{ cursor: "pointer", color: "var(--err, #dc2626)", fontSize: 13.5, fontWeight: 600, marginTop: 8 }}>{L("ปิดใช้งาน 2FA", "Turn off 2FA", "2FAを無効にする")}</summary>
            <div style={{ display: "grid", gap: 8, maxWidth: 320, marginTop: 10 }}>
              {/* an account without a password: the code alone is enough */}
              {hasPassword && (
                <input className="ainput" type="password" placeholder={L("รหัสผ่านปัจจุบัน", "Current password", "現在のパスワード")} value={pw} onChange={e => setPw(e.target.value)} />
              )}
              <input className="ainput" placeholder={L("รหัส 6 หลัก หรือรหัสสำรอง", "6-digit code or a backup code", "6桁のコードまたはバックアップコード")} value={code} onChange={e => setCode(e.target.value)} />
              <button className="minibtn danger" disabled={busy || (hasPassword && !pw) || !code} onClick={disable}>{L("ยืนยันปิด 2FA", "Turn it off", "無効にする")}</button>
            </div>
          </details>
        </div>
      )}

      {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 10 }}>⚠ {err}</p>}
      {msg && <p style={{ color: "var(--okc, #16a34a)", fontSize: 13, marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
