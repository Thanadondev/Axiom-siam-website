"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import AppShell from "../../components/AppShell";
import AuthAlternatives from "../../components/AuthAlternatives";

export default function RegisterPage() {
  const { register, login } = useAuth();
  const router = useRouter();
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
      setMsg(`${r.message} — กำลังเข้าสู่ระบบ...`);
      try {
        await login(form.email, form.password);
        router.push("/account");
      } catch {
        setMsg(`${r.message} — ตรวจอีเมลเพื่อยืนยัน (dev: ดูลิงก์ที่ console ของ API)`);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell auth>
      <form className="acard" onSubmit={onSubmit}>
        <div className="eyebrow">AXIOM SIAM</div>
        <h1 className="atitle">สมัครสมาชิก</h1>
        <p className="asub">สร้างบัญชีเพื่อบันทึกดีไซน์ ขอใบเสนอราคา และสั่งผลิต</p>

        <label className="flabel">ชื่อ-นามสกุล *</label>
        <input className="ainput" required value={form.fullName} onChange={set("fullName")} placeholder="เช่น สมชาย ใจดี" />

        <label className="flabel">อีเมล *</label>
        <input className="ainput" type="email" required value={form.email} onChange={set("email")} placeholder="you@email.com" />

        <div className="row2">
          <div>
            <label className="flabel">เบอร์โทร</label>
            <input className="ainput" value={form.phone} onChange={set("phone")} placeholder="08X-XXX-XXXX" />
          </div>
          <div>
            <label className="flabel">ชื่อบริษัท / ทีม</label>
            <input className="ainput" value={form.companyName} onChange={set("companyName")} placeholder="(ถ้ามี)" />
          </div>
        </div>

        <label className="flabel">รหัสผ่าน (อย่างน้อย 8 ตัว) *</label>
        <input className="ainput" type="password" required minLength={8} value={form.password} onChange={set("password")} />

        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}

        <button className="abtn solid block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
        </button>

        <AuthAlternatives />

        <p className="asub center" style={{ marginTop: 18 }}>
          มีบัญชีแล้ว? <Link href="/login" style={{ color: "var(--brand)", fontWeight: 600 }}>เข้าสู่ระบบ</Link>
        </p>
      </form>
    </AppShell>
  );
}
