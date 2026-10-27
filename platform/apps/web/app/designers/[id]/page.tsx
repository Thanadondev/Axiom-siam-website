"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import StoreHeader from "../../../components/StoreHeader";
import StoreFooter from "../../../components/StoreFooter";
import TemplateCard, { type TemplateCardData } from "../../../components/TemplateCard";
import { apiFetch } from "../../../lib/api";
import "../../app.css";
import "../../home.css";

interface Profile {
  id: string; fullName?: string | null; companyName?: string | null; bio?: string | null;
  createdAt: string; items: TemplateCardData[]; stats: { templates: number; totalSales: number };
}

const NAV = [
  { href: "/shop", label: "ออกแบบเสื้อ" },
  { href: "/templates", label: "ตลาดลาย" },
  { href: "/design", label: "ออกแบบขั้นสูง" },
];

/** a designer's shop: who they are, then every template they have on sale */
export default function DesignerProfile() {
  const id = String(useParams().id);
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    apiFetch<Profile>(`/templates/designer/${id}`).then(setP).catch(e => setErr(e.message || "ไม่พบดีไซเนอร์"));
  }, [id]);

  const cats = useMemo(() => [...new Set((p?.items ?? []).map(i => i.category).filter(Boolean) as string[])], [p]);
  const shown = (p?.items ?? []).filter(i => !cat || i.category === cat);

  if (err) {
    return (
      <div className="ax">
        <StoreHeader nav={NAV} />
        <div className="ax-mk-empty" style={{ minHeight: "60vh" }}>
          <h1 className="ax-display">ไม่พบดีไซเนอร์</h1>
          <p>{err}</p>
          <Link href="/templates" className="ax-btn solid">กลับไปตลาดลาย</Link>
        </div>
      </div>
    );
  }

  const name = p?.fullName || "ดีไซเนอร์";
  const joined = p ? new Date(p.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "long" }) : "";

  return (
    <div className="ax">
      <StoreHeader nav={NAV} />
      <main className="ax-wrap">
        <nav className="ax-mk-crumbs" aria-label="ตำแหน่ง">
          <Link href="/templates">ตลาดลาย</Link><span aria-hidden="true">/</span><span>ดีไซเนอร์</span>
        </nav>
        <section className="ax-mk-profile" aria-busy={!p}>
          <span className="av" aria-hidden="true">{name.trim()[0]?.toUpperCase()}</span>
          <div className="who">
            <span className="ax-mono">Designer</span>
            <h1 className="ax-display">{p ? name : "…"}</h1>
            <p className="ax-psub" style={{ margin: 0 }}>{p?.companyName ? `${p.companyName} · ` : ""}{p ? `เข้าร่วมเมื่อ ${joined}` : ""}</p>
            {p?.bio && <p className="bio">{p.bio}</p>}
          </div>
          {p && (
            <div className="ax-mk-facts">
              <div><b>{p.stats.templates.toLocaleString("th-TH")}</b><span>ลายที่วางขาย</span></div>
              <div><b>{p.stats.totalSales.toLocaleString("th-TH")}</b><span>ขายไปแล้ว (ครั้ง)</span></div>
            </div>
          )}
        </section>

        {p && (
          <section className="ax-mk-browse" aria-label="ผลงานที่วางขาย">
            {cats.length > 1 && (
              <div className="ax-mk-bar">
                <div className="ax-mk-cats" role="tablist" aria-label="หมวด">
                  <button type="button" role="tab" aria-selected={cat === ""} onClick={() => setCat("")}>ทั้งหมด</button>
                  {cats.map(c => <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}>{c}</button>)}
                </div>
              </div>
            )}
            {shown.length === 0 ? (
              <div className="ax-mk-empty"><h2 className="ax-display">ยังไม่มีลายที่เปิดขาย</h2><p>กลับมาดูใหม่เร็วๆ นี้</p></div>
            ) : (
              <div className="ax-mk-grid">{shown.map((t, i) => <TemplateCard key={t.id} t={{ ...t, designer: undefined }} rank={!cat && i < 3 && t.salesCount > 0 ? i + 1 : undefined} />)}</div>
            )}
          </section>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
