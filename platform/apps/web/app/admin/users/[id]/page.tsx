"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "../../../../components/AppShell";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch } from "../../../../lib/api";

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");
const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const ROLES = ["customer", "staff", "production", "admin"];

export default function AdminUserDetail() {
  const id = String(useParams().id);
  const { user: me, token, loading } = useAuth();
  const [u, setU] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<any>(`/admin/users/${id}`, { token }).then(setU).catch(e => setErr(e.message));
  }, [id, token]);
  useEffect(load, [load]);

  async function patch(body: any) {
    setBusy(true);
    try { await apiFetch(`/admin/users/${id}`, { method: "PATCH", token, body: JSON.stringify(body) }); load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function toggleSuspend() {
    if (u.suspendedAt) {
      if (!confirm(`ปลดระงับ ${u.email}?`)) return;
      return patch({ suspended: false });
    }
    const reason = prompt(`เหตุผลที่ระงับ ${u.email}:`, "ละเมิดเงื่อนไขการใช้งาน");
    if (reason === null) return;
    return patch({ suspended: true, suspendReason: reason });
  }

  if (loading || (!u && !err)) return <AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>;
  if (me?.role !== "admin") return <AppShell narrow><div className="acard"><div className="eyebrow">403</div><h1 className="atitle">ไม่มีสิทธิ์เข้าถึง</h1></div></AppShell>;
  if (err && !u) return <AppShell narrow><div className="acard"><h1 className="atitle">ไม่พบผู้ใช้</h1><p className="asub">{err}</p><Link className="abtn ghost" href="/admin">กลับไปแอดมิน</Link></div></AppShell>;

  const isSelf = me?.id === u.id;

  return (
    <AppShell wide>
      <Link href="/admin" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>← กลับไปแอดมิน</Link>

      <div className="acard">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow">สมาชิก</div>
            <h1 className="atitle" style={{ marginBottom: 2 }}>{u.fullName || u.email}</h1>
            <p className="asub">{u.email}{u.phone ? ` · ${u.phone}` : ""}{u.companyName ? ` · ${u.companyName}` : ""}</p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
              <span className="tag blue">{u.role}</span>
              <span className={`tag ${u.isVerified ? "green" : ""}`}>{u.isVerified ? "ยืนยันอีเมลแล้ว" : "ยังไม่ยืนยัน"}</span>
              {u.suspendedAt && <span className="tag red">ถูกระงับ {dt(u.suspendedAt)}</span>}
              <span className="tag">สมัคร {dt(u.createdAt)}</span>
            </div>
            {u.suspendReason && <p className="dim" style={{ marginTop: 6 }}>เหตุผล: {u.suspendReason}</p>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 190 }}>
            <label className="flabel" style={{ margin: 0 }}>สิทธิ์</label>
            <select className="ainput" value={u.role} disabled={busy || isSelf} onChange={e => patch({ role: e.target.value })}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className={`minibtn${u.suspendedAt ? "" : " danger"}`} disabled={busy || isSelf} onClick={toggleSuspend}>
              {u.suspendedAt ? "ปลดระงับบัญชี" : "ระงับบัญชี"}
            </button>
            {isSelf && <p className="dim">เปลี่ยนสิทธิ์/ระงับบัญชีตัวเองไม่ได้</p>}
            <Link className="minibtn" href={`/designers/${u.id}`} target="_blank">ดูโปรไฟล์สาธารณะ</Link>
          </div>
        </div>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
      </div>

      <div className="acard">
        <h2 className="ah2">สรุป</h2>
        <div className="kpigrid">
          <Kpi label="รายได้จากการขายลาย" value={baht(u.earnings.total)} sub={`${u.earnings.sales} ครั้ง`} />
          <Kpi label="ค้างจ่าย" value={baht(u.earnings.unpaid)} sub="ไม่รวมลายที่ถูกอายัด" />
          <Kpi label="ดีไซน์" value={String(u._count.designs)} sub={`ออเดอร์ ${u._count.orders}`} />
          <Kpi label="ลายที่ขาย" value={String(u.marketTemplates.length)} sub={`ซื้อไว้ ${u.templatePurchases.length}`} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 18 }}>
        <div className="acard" style={{ marginTop: 0 }}>
          <h2 className="ah2">ลายที่วางขาย</h2>
          {u.marketTemplates.length === 0 ? <p className="asub">ไม่มี</p> : (
            <div className="tablewrap">
              <table className="atable" style={{ minWidth: 300 }}>
                <thead><tr><th>ลาย</th><th>ราคา</th><th>ขาย</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {u.marketTemplates.map((t: any) => (
                    <tr key={t.id}>
                      <td><Link className="dlink" href={`/templates/${t.id}`} target="_blank">{t.name}</Link></td>
                      <td>{baht(t.price)}</td><td>{t.salesCount}</td>
                      <td>{t.takedownAt ? <span className="tag red">ถูกถอด</span> : <span className={`tag ${t.status === "published" ? "green" : ""}`}>{t.status}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="acard" style={{ marginTop: 0 }}>
          <h2 className="ah2">เทมเพลตที่ซื้อไว้</h2>
          {u.templatePurchases.length === 0 ? <p className="asub">ไม่มี</p> : (
            <div className="tablewrap">
              <table className="atable" style={{ minWidth: 260 }}>
                <thead><tr><th>ลาย</th><th>ราคา</th><th>เมื่อ</th></tr></thead>
                <tbody>
                  {u.templatePurchases.map((p: any) => (
                    <tr key={p.id}><td>{p.template.name}</td><td>{baht(p.price)}</td><td className="dim">{dt(p.createdAt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="acard">
        <h2 className="ah2">หลักฐานการยอมรับเงื่อนไข</h2>
        <p className="asub">บันทึกทุกครั้งที่ผู้ใช้กดยอมรับข้อตกลงลิขสิทธิ์ตอนเผยแพร่ขาย</p>
        {u.termsAcceptances.length === 0 ? <p className="asub">ไม่มี</p> : (
          <div className="tablewrap">
            <table className="atable" style={{ minWidth: 520 }}>
              <thead><tr><th>ประเภท</th><th>เวอร์ชัน</th><th>อ้างอิง</th><th>IP</th><th>เมื่อ</th></tr></thead>
              <tbody>
                {u.termsAcceptances.map((l: any) => (
                  <tr key={l.id}>
                    <td className="dim">{l.kind}</td><td>{l.version}</td>
                    <td className="dim">{l.ref ? String(l.ref).slice(0, 8) : "-"}</td>
                    <td className="dim">{l.ip ?? "-"}</td><td className="dim">{dt(l.acceptedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpilabel">{label}</div>
      <div className="kpivalue">{value}</div>
      {sub && <div className="kpisub">{sub}</div>}
    </div>
  );
}
