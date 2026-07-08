"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import AppShell from "../../components/AppShell";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      router.push("/account");
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
        <h1 className="atitle">เข้าสู่ระบบ</h1>
        <p className="asub">ยินดีต้อนรับกลับ 👋</p>

        <label className="flabel">อีเมล</label>
        <input className="ainput" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />

        <label className="flabel">รหัสผ่าน</label>
        <input className="ainput" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

        <div style={{ textAlign: "right", marginTop: 8 }}>
          <Link href="/forgot-password" style={{ color: "var(--brand)", fontSize: 13, fontWeight: 600 }}>ลืมรหัสผ่าน?</Link>
        </div>

        {err && <div className="err">{err}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>

        <p className="asub center" style={{ marginTop: 18 }}>
          ยังไม่มีบัญชี? <Link href="/register" style={{ color: "var(--brand)", fontWeight: 600 }}>สมัครสมาชิก</Link>
        </p>
      </form>
    </AppShell>
  );
}
