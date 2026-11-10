"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import AppShell from "../../components/AppShell";
import AuthAlternatives from "../../components/AuthAlternatives";
import { nextPath } from "../../lib/next-path";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [totpCode, setTotpCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
        setErr(totpCode ? e.message : "");
      } else {
        setErr(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell auth>
      <form className="acard" onSubmit={onSubmit}>
        <div className="eyebrow">AXIOM SIAM</div>
        <h1 className="atitle">เข้าสู่ระบบ</h1>
        <p className="asub">ยินดีต้อนรับกลับ 👋</p>

        <label className="flabel">อีเมล</label>
        <input className="ainput" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />

        <label className="flabel">รหัสผ่าน</label>
        <input className="ainput" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

        {needs2fa && (
          <>
            <label className="flabel">รหัสยืนยัน 2 ชั้น</label>
            <input className="ainput" inputMode="text" autoFocus required value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)} placeholder="6 หลักจากแอป หรือรหัสสำรอง" />
            <p className="asub" style={{ fontSize: 12, marginTop: 6 }}>
              เปิดแอป Authenticator แล้วกรอกรหัส 6 หลัก · ถ้าเข้าแอปไม่ได้ ใช้รหัสสำรอง (XXXXX-XXXXX)
            </p>
          </>
        )}

        <div style={{ textAlign: "right", marginTop: 8 }}>
          <Link href="/forgot-password" style={{ color: "var(--brand)", fontSize: 13, fontWeight: 600 }}>ลืมรหัสผ่าน?</Link>
        </div>

        {err && <div className="err">{err}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : needs2fa ? "ยืนยันรหัส" : "เข้าสู่ระบบ"}
        </button>

        {!needs2fa && <AuthAlternatives />}

        <p className="asub center" style={{ marginTop: 18 }}>
          ยังไม่มีบัญชี? <Link href="/register" style={{ color: "var(--brand)", fontWeight: 600 }}>สมัครสมาชิก</Link>
        </p>
      </form>
    </AppShell>
  );
}
