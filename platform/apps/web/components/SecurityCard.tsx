"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";

/**
 * Sign-in method + password management.
 *
 * A Google-only account has no password (`hasPassword === false`). It shows a
 * "set a password" form so the user can also sign in with email+password;
 * accounts that already have one see a "change password" form instead.
 */
export default function SecurityCard() {
  const { user, token, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const hasPw = user.hasPassword;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (next.length < 8) { setErr("รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร"); return; }
    if (next !== confirm) { setErr("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน"); return; }
    setBusy(true);
    try {
      const r = await apiFetch<{ message: string }>("/auth/password", {
        method: "POST", token,
        body: JSON.stringify({ current: hasPw ? cur : undefined, newPassword: next }),
      });
      setMsg(r.message);
      setOpen(false); setCur(""); setNext(""); setConfirm("");
      // reflect the new state so the card flips to "change password"
      if (!hasPw) setUser({ ...user, hasPassword: true });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="acard">
      <div className="eyebrow">ความปลอดภัย</div>
      <h2 className="ah2" style={{ marginTop: 6 }}>การเข้าสู่ระบบ</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <span className="tag blue">📧 อีเมล + รหัสผ่าน {hasPw ? "" : "(ยังไม่ได้ตั้ง)"}</span>
        {/* Google linkage is inferred: a verified account with no password came from Google */}
        {!hasPw && <span className="tag green">🔵 Google</span>}
      </div>

      <p className="asub" style={{ marginTop: 10 }}>
        {hasPw
          ? "เข้าสู่ระบบได้ทั้งอีเมล+รหัสผ่าน และ Google (ถ้าอีเมลตรงกัน)"
          : "บัญชีนี้เข้าสู่ระบบด้วย Google — ตั้งรหัสผ่านเพิ่มเพื่อเข้าด้วยอีเมล+รหัสผ่านได้ด้วย"}
      </p>

      {!open ? (
        <button className="abtn ghost" style={{ marginTop: 12 }} onClick={() => { setOpen(true); setMsg(""); }}>
          {hasPw ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
        </button>
      ) : (
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 340, marginTop: 12 }}>
          {hasPw && (
            <input className="ainput" type="password" placeholder="รหัสผ่านปัจจุบัน" value={cur}
              onChange={e => setCur(e.target.value)} autoComplete="current-password" required />
          )}
          <input className="ainput" type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={next}
            onChange={e => setNext(e.target.value)} autoComplete="new-password" required />
          <input className="ainput" type="password" placeholder="ยืนยันรหัสผ่านใหม่" value={confirm}
            onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="abtn solid" disabled={busy}>{busy ? "กำลังบันทึก…" : hasPw ? "บันทึกรหัสใหม่" : "ตั้งรหัสผ่าน"}</button>
            <button type="button" className="minibtn" onClick={() => { setOpen(false); setErr(""); }}>ยกเลิก</button>
          </div>
        </form>
      )}

      {err && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>⚠ {err}</p>}
      {msg && <p style={{ color: "#16a34a", fontSize: 13, marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
