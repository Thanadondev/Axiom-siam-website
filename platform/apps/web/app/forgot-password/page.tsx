"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";

export default function ForgotPasswordPage() {
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
        body: JSON.stringify({ email }),
      });
      setMsg(`${r.message} (dev: ดูลิงก์รีเซ็ตที่ console ของ API)`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell narrow>
      <form className="acard" onSubmit={onSubmit}>
        <div className="eyebrow">AXIOM SIAM</div>
        <h1 className="atitle">ลืมรหัสผ่าน</h1>
        <p className="asub">กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้</p>

        <label className="flabel">อีเมล</label>
        <input className="ainput" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />

        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ต"}
        </button>

        <p className="asub center" style={{ marginTop: 18 }}>
          จำรหัสได้แล้ว? <Link href="/login" style={{ color: "var(--brand)", fontWeight: 600 }}>เข้าสู่ระบบ</Link>
        </p>
      </form>
    </AppShell>
  );
}
