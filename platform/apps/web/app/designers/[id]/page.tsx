"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";

interface Card {
  id: string; name: string; category?: string | null; price: number;
  previewUrl?: string | null; salesCount: number;
}
interface Profile {
  id: string; fullName?: string | null; companyName?: string | null; bio?: string | null;
  createdAt: string; items: Card[]; stats: { templates: number; totalSales: number };
}

const baht = (n: number) => (n === 0 ? "ฟรี" : "฿" + n.toLocaleString("th-TH"));
const initials = (n?: string | null) => (n?.trim()?.[0] ?? "?").toUpperCase();

export default function DesignerProfile() {
  const id = String(useParams().id);
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch<Profile>(`/templates/designer/${id}`).then(setP).catch(e => setErr(e.message));
  }, [id]);

  if (err) return <AppShell narrow><div className="acard"><h1 className="atitle">ไม่พบดีไซเนอร์</h1><p className="asub">{err}</p><Link className="abtn ghost" href="/templates">กลับไปตลาดลาย</Link></div></AppShell>;
  if (!p) return <AppShell><p className="asub">กำลังโหลด…</p></AppShell>;

  const name = p.fullName || "ดีไซเนอร์";
  const joined = new Date(p.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "long" });

  return (
    <AppShell wide>
      <Link href="/templates" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>← กลับไปตลาดลาย</Link>

      <div className="acard">
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div className="avatar">{initials(p.fullName)}</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="eyebrow">DESIGNER</div>
            <h1 className="atitle" style={{ marginBottom: 2 }}>{name}</h1>
            <p className="asub">{p.companyName ? `${p.companyName} · ` : ""}เข้าร่วมเมื่อ {joined}</p>
            {p.bio && <p style={{ fontSize: 14, lineHeight: 1.75, marginTop: 8 }}>{p.bio}</p>}
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            <div style={{ textAlign: "center" }}>
              <div className="kpivalue" style={{ fontSize: 22 }}>{p.stats.templates}</div>
              <div className="dim">ลายที่ขาย</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="kpivalue" style={{ fontSize: 22, color: "var(--brand)" }}>{p.stats.totalSales}</div>
              <div className="dim">ขายไปแล้ว</div>
            </div>
          </div>
        </div>
      </div>

      <div className="acard">
        <h2 className="ah2">ผลงานที่วางขาย</h2>
        {p.items.length === 0 ? (
          <p className="asub">ยังไม่มีลายที่เปิดขาย</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginTop: 14 }}>
            {p.items.map(t => (
              <Link key={t.id} href={`/templates/${t.id}`} className="tplcard">
                <div className="tplthumb">
                  {t.category && <span className="tplcat">{t.category}</span>}
                  {t.previewUrl ? <img src={t.previewUrl} alt={t.name} /> : <span className="asub">ไม่มีตัวอย่าง</span>}
                </div>
                <div style={{ padding: "10px 12px 12px" }}>
                  <b style={{ fontSize: 14 }}>{t.name}</b>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ color: "var(--brand)", fontWeight: 800 }}>{baht(t.price)}</span>
                    <span className="dim">ขายแล้ว {t.salesCount}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
