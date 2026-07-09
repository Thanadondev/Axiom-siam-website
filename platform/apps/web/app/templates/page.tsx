"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";

interface Card {
  id: string; name: string; description?: string | null; category?: string | null;
  tags: string[]; price: number; previewUrl?: string | null; salesCount: number;
  designer: { id: string; fullName?: string | null };
}
const baht = (n: number) => (n === 0 ? "ฟรี" : "฿" + n.toLocaleString("th-TH"));

export default function TemplatesPage() {
  const [items, setItems] = useState<Card[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cat) params.set("category", cat);
      if (sort) params.set("sort", sort);
      const r = await apiFetch<{ items: Card[]; total: number }>(`/templates?${params.toString()}`);
      setItems(r.items);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [q, cat, sort]);

  useEffect(() => { apiFetch<string[]>("/templates/categories").then(setCats).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <AppShell wide>
      <div className="acard" style={{ marginBottom: 18 }}>
        <div className="eyebrow">MARKETPLACE</div>
        <h1 className="atitle">ตลาดลาย & เทมเพลต</h1>
        <p className="asub">ไม่รู้จะออกแบบยังไง? เลือกซื้อเทมเพลตที่ดีไซเนอร์ทำไว้ แล้วเปิดแก้/สั่งผลิตต่อได้เลย</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <input className="ainput" style={{ flex: "1 1 220px", margin: 0 }} placeholder="ค้นหาลาย / ทีม / กีฬา…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="ainput" style={{ width: "auto", margin: 0 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">ใหม่ล่าสุด</option>
            <option value="popular">ขายดี</option>
            <option value="price_asc">ราคาต่ำ→สูง</option>
            <option value="price_desc">ราคาสูง→ต่ำ</option>
          </select>
        </div>
        {cats.length > 0 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
            <button className={"chip" + (cat === "" ? " on" : "")} onClick={() => setCat("")}>ทั้งหมด</button>
            {cats.map((c) => <button key={c} className={"chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        )}
      </div>

      {loading ? (
        <p className="asub">กำลังโหลด…</p>
      ) : items.length === 0 ? (
        <div className="acard"><p className="asub">ยังไม่มีเทมเพลตในหมวดนี้ — เป็นดีไซเนอร์? <Link href="/account" style={{ color: "var(--brand)", fontWeight: 600 }}>เผยแพร่ขายได้ที่นี่</Link></p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
          {items.map((t) => (
            <Link key={t.id} href={`/templates/${t.id}`} className="tplcard">
              <div className="tplthumb">
                {t.previewUrl ? <img src={t.previewUrl} alt={t.name} /> : <span className="asub" style={{ fontSize: 12 }}>ไม่มีตัวอย่าง</span>}
                {t.category && <span className="tplcat">{t.category}</span>}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                <div className="asub" style={{ fontSize: 11.5 }}>โดย {t.designer.fullName || "ดีไซเนอร์"}{t.salesCount ? ` · ขายแล้ว ${t.salesCount}` : ""}</div>
                <div style={{ marginTop: 6, fontWeight: 800, color: "var(--brand)", fontSize: 15 }}>{baht(t.price)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
