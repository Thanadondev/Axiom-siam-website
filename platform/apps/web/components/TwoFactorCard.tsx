"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";

interface Status { enabled: boolean; recoveryCodesLeft: number; recommended: boolean }

/** free, no-dependency QR renderer via a public image endpoint is NOT used —
 *  we show the secret for manual entry plus a link the phone can open. */
export default function TwoFactorCard() {
  const { token } = useAuth();
  const [st, setSt] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<Status>("/auth/2fa", { token }).then(setSt).catch(() => {});
  }, [token]);
  useEffect(load, [load]);

  async function start() {
    setErr(""); setBusy(true);
    try { setSetup(await apiFetch("/auth/2fa/setup", { method: "POST", token })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function enable() {
    setErr(""); setBusy(true);
    try {
      const r = await apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/enable", {
        method: "POST", token, body: JSON.stringify({ code }),
      });
      setCodes(r.recoveryCodes);
      setSetup(null); setCode(""); setMsg("เปิดใช้งาน 2FA แล้ว ✓");
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function disable() {
    setErr(""); setBusy(true);
    try {
      await apiFetch("/auth/2fa/disable", { method: "POST", token, body: JSON.stringify({ password: pw, code }) });
      setMsg("ปิด 2FA แล้ว"); setPw(""); setCode(""); setCodes(null);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!st) return null;

  return (
    <div className="acard">
      <div className="eyebrow">ความปลอดภัย</div>
      <h2 className="ah2" style={{ marginTop: 6 }}>
        ยืนยันตัวตน 2 ชั้น (2FA){" "}
        {st.enabled ? <span className="tag green">เปิดอยู่</span> : <span className="tag red">ปิดอยู่</span>}
      </h2>
      <p className="asub">
        {st.recommended
          ? "บัญชีผู้ดูแลระบบควรเปิด 2FA — รหัสผ่านที่รั่วอย่างเดียวจะเข้าระบบไม่ได้"
          : "เพิ่มชั้นความปลอดภัยด้วยแอป Authenticator"}
      </p>

      {/* newly issued recovery codes — shown exactly once */}
      {codes && (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 12, padding: 14, marginTop: 12 }}>
          <b style={{ color: "#b45309" }}>⚠ เก็บรหัสสำรองนี้ไว้ให้ดี — จะแสดงครั้งเดียวเท่านั้น</b>
          <p className="dim" style={{ marginTop: 4 }}>ใช้เข้าระบบได้เมื่อเข้าแอป Authenticator ไม่ได้ · ใช้ได้รหัสละครั้ง</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 6, marginTop: 10 }}>
            {codes.map(c => (
              <code key={c} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12.5, userSelect: "all" }}>{c}</code>
            ))}
          </div>
          <button className="minibtn" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard?.writeText(codes.join("\n")); setMsg("คัดลอกรหัสสำรองแล้ว"); }}>คัดลอกทั้งหมด</button>
          <button className="minibtn" style={{ marginTop: 10, marginLeft: 6 }} onClick={() => setCodes(null)}>เก็บแล้ว ปิด</button>
        </div>
      )}

      {/* enrolment */}
      {!st.enabled && !setup && (
        <button className="abtn solid" style={{ marginTop: 14 }} disabled={busy} onClick={start}>เริ่มตั้งค่า 2FA</button>
      )}

      {!st.enabled && setup && (
        <div style={{ marginTop: 14 }}>
          <p className="asub">1. เปิดแอป Authenticator แล้วเพิ่มบัญชีด้วยคีย์นี้ (พิมพ์เอง):</p>
          <code style={{ display: "block", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, letterSpacing: 1, userSelect: "all", wordBreak: "break-all" }}>
            {setup.secret}
          </code>
          <p className="asub" style={{ marginTop: 8 }}>
            หรือเปิดลิงก์นี้บนมือถือ:{" "}
            <a className="dlink" href={setup.otpauthUrl}>เพิ่มลงแอปอัตโนมัติ</a>
          </p>
          <label className="flabel">2. กรอกรหัส 6 หลักที่แอปแสดง</label>
          <input className="ainput" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" style={{ maxWidth: 200 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="abtn solid" disabled={busy || code.length < 6} onClick={enable}>ยืนยันและเปิดใช้งาน</button>
            <button className="minibtn" disabled={busy} onClick={() => { setSetup(null); setCode(""); }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* disable */}
      {st.enabled && (
        <div style={{ marginTop: 14 }}>
          <p className="dim">รหัสสำรองเหลือ {st.recoveryCodesLeft} รหัส</p>
          <details>
            <summary style={{ cursor: "pointer", color: "#dc2626", fontSize: 13.5, fontWeight: 600, marginTop: 8 }}>ปิดใช้งาน 2FA</summary>
            <div style={{ display: "grid", gap: 8, maxWidth: 320, marginTop: 10 }}>
              <input className="ainput" type="password" placeholder="รหัสผ่านปัจจุบัน" value={pw} onChange={e => setPw(e.target.value)} />
              <input className="ainput" placeholder="รหัส 6 หลัก หรือรหัสสำรอง" value={code} onChange={e => setCode(e.target.value)} />
              <button className="minibtn danger" disabled={busy || !pw || !code} onClick={disable}>ยืนยันปิด 2FA</button>
            </div>
          </details>
        </div>
      )}

      {err && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>⚠ {err}</p>}
      {msg && <p style={{ color: "#16a34a", fontSize: 13, marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
