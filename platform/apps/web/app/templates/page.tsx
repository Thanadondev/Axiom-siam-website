"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import StoreHeader from "../../components/StoreHeader";
import StoreFooter from "../../components/StoreFooter";
import TemplateCard, { type TemplateCardData } from "../../components/TemplateCard";
import { apiFetch } from "../../lib/api";
import "../app.css";
import "../home.css";

const PAGE = 24;
const SORTS = [
  { id: "newest", label: "ใหม่ล่าสุด" },
  { id: "popular", label: "ขายดี" },
  { id: "price_asc", label: "ราคาต่ำ → สูง" },
  { id: "price_desc", label: "ราคาสูง → ต่ำ" },
];
const NAV = [
  { href: "/shop", label: "ออกแบบเสื้อ" },
  { href: "/templates", label: "ตลาดลาย" },
  { href: "/design", label: "ออกแบบขั้นสูง" },
];

/**
 * The template marketplace. Designers sell patterns made in the advanced
 * designer; a buyer owns the template for good and opens it in the designer
 * to add names and numbers and order from the factory.
 */
export default function TemplatesPage() {
  const [items, setItems] = useState<TemplateCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [top, setTop] = useState<TemplateCardData[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const query = useCallback((skip: number) => {
    const p = new URLSearchParams({ sort, take: String(PAGE), skip: String(skip) });
    if (q.trim()) p.set("q", q.trim());
    if (cat) p.set("category", cat);
    return apiFetch<{ items: TemplateCardData[]; total: number }>(`/templates?${p}`);
  }, [q, cat, sort]);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    const t = setTimeout(() => {
      query(0)
        .then(r => { if (!dead) { setItems(r.items); setTotal(r.total); setFailed(false); } })
        .catch(() => { if (!dead) { setItems([]); setTotal(0); setFailed(true); } })
        .finally(() => !dead && setLoading(false));
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    apiFetch<string[]>("/templates/categories").then(setCats).catch(() => {});
    apiFetch<{ items: TemplateCardData[] }>("/templates?sort=popular&take=3").then(r => setTop(r.items)).catch(() => {});
  }, []);

  async function loadMore() {
    setMore(true);
    try {
      const r = await query(items.length);
      setItems(list => [...list, ...r.items.filter(n => !list.some(o => o.id === n.id))]);
      setTotal(r.total);
    } catch { /* keep what we have */ }
    finally { setMore(false); }
  }

  const filtered = !!(q.trim() || cat);

  return (
    <div className="ax">
      <StoreHeader nav={NAV} />
      <main>
        <section className="ax-wrap ax-mk-hero" aria-labelledby="mk-title">
          <div className="ax-mk-hero-copy">
            <span className="ax-mono">Template marketplace</span>
            <h1 id="mk-title" className="ax-display">ตลาด<em>ลาย</em></h1>
            <p>ลายเสื้อจากดีไซเนอร์ ซื้อครั้งเดียวเป็นของทีมถาวร เปิดในโปรแกรมออกแบบเพื่อเปลี่ยนสี ใส่ชื่อ-เบอร์ แล้วสั่งผลิตกับโรงงานได้ทันที</p>
            <form className="ax-mk-search" role="search" onSubmit={e => e.preventDefault()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาลาย ทีม หรือกีฬา" aria-label="ค้นหาลาย" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="ล้างคำค้น">×</button>}
            </form>
            <div className="ax-mk-facts">
              <div><b>{total.toLocaleString("th-TH")}</b><span>ลายที่เปิดขาย{filtered ? "ตามตัวกรอง" : ""}</span></div>
              <div><b>{cats.length}</b><span>หมวด</span></div>
              <div><b>100%</b><span>พิมพ์จริงตามสีโรงงาน</span></div>
            </div>
          </div>
          <Fan items={top} />
        </section>

        <section className="ax-wrap ax-mk-browse" aria-label="รายการลาย">
          <div className="ax-mk-bar">
            <div className="ax-mk-cats" role="tablist" aria-label="หมวด">
              <button type="button" role="tab" aria-selected={cat === ""} onClick={() => setCat("")}>ทั้งหมด</button>
              {cats.map(c => <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}>{c}</button>)}
            </div>
            <label className="ax-mk-sort">
              <span className="ax-mono">เรียง</span>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {loading ? (
            <div className="ax-mk-grid" aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="ax-mk-card ax-mk-ghost"><div className="ax-mk-pic" /><div className="ax-mk-meta"><div><b>&nbsp;</b><small>&nbsp;</small></div></div></div>)}
            </div>
          ) : items.length === 0 ? (
            <div className="ax-mk-empty">
              <h2 className="ax-display">{failed ? "โหลดไม่สำเร็จ" : filtered ? "ไม่พบลายนี้" : "ยังไม่มีลาย"}</h2>
              <p>{failed ? "ลองรีเฟรชอีกครั้งในอีกสักครู่" : filtered ? "ลองคำค้นอื่น หรือดูทุกหมวด" : "เป็นดีไซเนอร์? เปิดร้านแล้ววางขายลายแรกได้เลย"}</p>
              {filtered ? <button type="button" className="ax-btn ghost" onClick={() => { setQ(""); setCat(""); }}>ล้างตัวกรอง</button>
                : <Link href="/account" className="ax-btn solid">วางขายลาย</Link>}
            </div>
          ) : (
            <>
              <p className="ax-mk-count">{filtered ? `พบ ${total.toLocaleString("th-TH")} ลาย` : `${total.toLocaleString("th-TH")} ลาย`}{cat ? ` ในหมวด ${cat}` : ""}{q.trim() ? ` สำหรับ “${q.trim()}”` : ""}</p>
              <div className="ax-mk-grid">
                {items.map(t => <TemplateCard key={t.id} t={t} />)}
              </div>
              {items.length < total && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 36 }}>
                  <button type="button" className="ax-btn ghost" onClick={loadMore} disabled={more}>{more ? "กำลังโหลด…" : `ดูเพิ่มอีก ${Math.min(PAGE, total - items.length)} ลาย`}</button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="ax-wrap" style={{ paddingTop: 96 }}>
          <div className="ax-cta">
            <h2 className="ax-display">ขายลาย<br />ของคุณ</h2>
            <div>
              <p>ออกแบบในโปรแกรมของเรา วางขายได้ทันที ได้ส่วนแบ่งทุกครั้งที่มีทีมซื้อลายไปผลิต</p>
              <div className="ax-row">
                <Link href="/design" className="ax-btn dark">เริ่มออกแบบลาย</Link>
                <Link href="/account" className="ax-btn ghost" style={{ borderColor: "rgba(13,14,16,.35)", color: "#0d0e10" }}>จัดการร้านของฉัน</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </div>
  );
}

/** the three best sellers, fanned like printed proofs; they lean toward the pointer */
function Fan({ items }: { items: TemplateCardData[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = box.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
    };
    const leave = () => setTilt({ x: 0, y: 0 });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, []);
  const slots = [
    { r: -14, x: -34, y: 6, z: 0 },
    { r: 9, x: 30, y: -2, z: 1 },
    { r: -2, x: 0, y: -10, z: 2 },
  ];
  return (
    <div className="ax-mk-fan" ref={box} aria-label="ลายขายดี">
      <div className="ax-mk-fan-in" style={{ transform: `rotateX(${(-tilt.y * 6).toFixed(2)}deg) rotateY(${(tilt.x * 9).toFixed(2)}deg)` }}>
        {items.length === 0 && <div className="ax-mk-proof placeholder" style={{ transform: "rotate(-3deg)" }}><span className="ax-mono">AXIOM · PROOF</span></div>}
        {items.map((t, i) => {
          const s = slots[slots.length - 1 - i]; // the best seller sits on top
          return (
            <Link key={t.id} href={`/templates/${t.id}`} className="ax-mk-proof"
              style={{ transform: `translate3d(${s.x + tilt.x * (i + 1) * 4}%, ${s.y + tilt.y * (i + 1) * 3}%, ${s.z * 40}px) rotate(${s.r}deg)`, zIndex: s.z }}>
              <div className="pic">{t.previewUrl ? <img src={t.previewUrl} alt="" /> : null}</div>
              <div className="cap"><span>#{i + 1} ขายดี</span><b>{t.name}</b></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
