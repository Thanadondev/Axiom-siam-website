"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";

function ResetInner() {
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
    if (pw.length < 8) { setErr("รหัสผ่านอย่างน้อย 8 ตัวอักษร"); return; }
    if (pw !== pw2) { setErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: pw }) });
      setMsg("ตั้งรหัสผ่านใหม่สำเร็จ ✓ กำลังพาไปหน้าเข้าสู่ระบบ...");
      setTimeout(() => router.push("/login"), 1500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="acard center">
        <h1 className="atitle">ลิงก์ไม่ถูกต้อง</h1>
        <p className="asub">ไม่พบโทเคนสำหรับตั้งรหัสผ่านใหม่ กรุณาขอลิงก์ใหม่อีกครั้ง</p>
        <Link href="/forgot-password" className="abtn solid block" style={{ marginTop: 18 }}>ขอลิงก์รีเซ็ตใหม่</Link>
      </div>
    );
  }

  return (
    <form className="acard" onSubmit={onSubmit}>
      <div className="eyebrow">AXIOM SIAM</div>
      <h1 className="atitle">ตั้งรหัสผ่านใหม่</h1>
      <p className="asub">กรอกรหัสผ่านใหม่ของคุณ</p>

      <label className="flabel">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label>
      <input className="ainput" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />

      <label className="flabel">ยืนยันรหัสผ่านใหม่</label>
      <input className="ainput" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />

      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}

      <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
        {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AppShell narrow>
      <Suspense fallback={<div className="acard"><p className="asub">กำลังโหลด...</p></div>}>
        <ResetInner />
      </Suspense>
    </AppShell>
  );
}
