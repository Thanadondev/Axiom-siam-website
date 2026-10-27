"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import StoreHeader from "../../../components/StoreHeader";
import StoreFooter from "../../../components/StoreFooter";
import VariantPreview from "../../../components/VariantPreview";
import TemplateCard, { tplPrice, type TemplateCardData } from "../../../components/TemplateCard";
import { variantQuery, type Variant } from "../../../lib/garment-options";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import "../../app.css";
import "../../home.css";

interface Detail extends TemplateCardData {
  description?: string | null;
  tags: string[];
  designer: { id: string; fullName?: string | null };
  owned: boolean;
}

const NAV = [
  { href: "/shop", label: "ออกแบบเสื้อ" },
  { href: "/templates", label: "ตลาดลาย" },
  { href: "/design", label: "ออกแบบขั้นสูง" },
];
const REASONS = [
  { id: "copyright", label: "ละเมิดลิขสิทธิ์ (ภาพ/ลาย)" },
  { id: "trademark", label: "ละเมิดเครื่องหมายการค้า/โลโก้" },
  { id: "illegal", label: "เนื้อหาผิดกฎหมาย/ไม่เหมาะสม" },
  { id: "other", label: "อื่นๆ" },
];

export default function TemplateDetail() {
  const id = String(useParams().id);
  const router = useRouter();
  const { user, token } = useAuth();
  const [t, setT] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [more, setMore] = useState<TemplateCardData[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // the colourway the buyer is looking at — carried into the designer on open
  const [variant, setVariant] = useState<Variant | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("copyright");
  const [detail, setDetail] = useState("");

  const load = useCallback(
    () => apiFetch<Detail>(`/templates/${id}`, { token: token || undefined }).then(d => { setT(d); setMissing(false); }).catch(() => setMissing(true)),
    [id, token],
  );
  useEffect(() => { load(); }, [load]);

  // more from the same designer
  useEffect(() => {
    if (!t?.designer?.id) return;
    apiFetch<{ items: TemplateCardData[] }>(`/templates/designer/${t.designer?.id}`)
      .then(p => setMore(p.items.filter(x => x.id !== t.id).slice(0, 4)))
      .catch(() => {});
  }, [t?.designer?.id, t?.id]);

  async function buy() {
    if (!user || !token) { router.push(`/login?next=${encodeURIComponent(`/templates/${id}`)}`); return; }
    setBusy(true); setMsg(null);
    try {
      await apiFetch(`/templates/${id}/buy`, { method: "POST", token });
      setMsg({ ok: true, text: "ซื้อสำเร็จ · ลายนี้เป็นของคุณแล้ว เปิดในโปรแกรมออกแบบได้เลย" });
      await load();
    } catch (e: any) { setMsg({ ok: false, text: e.message || "ซื้อไม่สำเร็จ" }); }
    finally { setBusy(false); }
  }

  async function sendReport() {
    setBusy(true);
    try {
      const r = await apiFetch<{ message: string }>(`/templates/${id}/report`, {
        method: "POST", token: token || undefined, body: JSON.stringify({ reason, detail }),
      });
      setMsg({ ok: true, text: r.message });
      setReporting(false); setDetail("");
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  if (missing) {
    return (
      <div className="ax">
        <StoreHeader nav={NAV} />
        <div className="ax-mk-empty" style={{ minHeight: "60vh" }}>
          <h1 className="ax-display">ไม่พบลายนี้</h1>
          <p>ลายอาจถูกปิดขายหรือถูกลบไปแล้ว</p>
          <Link href="/templates" className="ax-btn solid">กลับไปตลาดลาย</Link>
        </div>
      </div>
    );
  }

  const isOwner = !!user && t?.designer?.id === user.id;
  const own = !!t && (t.owned || isOwner);
  const designer = t?.designer?.fullName || "ดีไซเนอร์";

  return (
    <div className="ax">
      <StoreHeader nav={NAV} />
      <main className="ax-wrap">
        <nav className="ax-mk-crumbs" aria-label="ตำแหน่ง">
          <Link href="/templates">ตลาดลาย</Link>
          {t?.category && <><span aria-hidden="true">/</span><span>{t.category}</span></>}
        </nav>

        <div className="ax-mk-detail">
          <div className="ax-mk-variant">
            <VariantPreview templateId={id} onVariantChange={setVariant} />
          </div>

          <aside className="ax-mk-buy" aria-busy={!t}>
            {!t ? <p className="ax-psub">กำลังโหลด…</p> : (
              <>
                {t.category && <span className="ax-mk-cat static">{t.category}</span>}
                <h1>{t.name}</h1>
                <Link href={`/designers/${t.designer?.id}`} className="ax-mk-by">
                  <span className="av" aria-hidden="true">{designer.trim()[0]?.toUpperCase()}</span>
                  <span><small>ออกแบบโดย</small><b>{designer}</b></span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </Link>
                {t.description && <p className="ax-mk-desc">{t.description}</p>}
                {t.tags?.length > 0 && <div className="ax-mk-tags">{t.tags.map(x => <span key={x}>#{x}</span>)}</div>}

                <div className="ax-mk-pricebox">
                  <div>
                    <span className="ax-mono">ราคาลาย</span>
                    <b data-free={t.price === 0 || undefined}>{tplPrice(t.price)}</b>
                  </div>
                  {t.salesCount > 0 && <span className="ax-mk-sold">ทีมซื้อไปแล้ว {t.salesCount.toLocaleString("th-TH")} ครั้ง</span>}
                </div>

                {own ? (
                  // carry the colourway across — picking a colour then losing it on open would feel broken
                  <Link href={`/design?template=${t.id}${variantQuery(variant)}`} className="ax-btn solid ax-mk-cta">
                    {isOwner && !t.owned ? "เปิดลายของคุณในโปรแกรมออกแบบ" : "เปิดใช้ในโปรแกรมออกแบบ"}
                  </Link>
                ) : (
                  <button type="button" className="ax-btn solid ax-mk-cta" onClick={buy} disabled={busy}>
                    {busy ? "กำลังดำเนินการ…" : !user ? (t.price === 0 ? "เข้าสู่ระบบเพื่อรับลายฟรี" : "เข้าสู่ระบบเพื่อซื้อลาย") : t.price === 0 ? "รับลายนี้ฟรี" : `ซื้อลายนี้ · ${tplPrice(t.price)}`}
                  </button>
                )}
                {msg && <p className={msg.ok ? "ax-ok" : "ax-err"} role="status">{msg.text}</p>}

                <ul className="ax-mk-points">
                  <li><b>ซื้อครั้งเดียว ใช้ได้ตลอด</b><span>เปลี่ยนสี ใส่ชื่อ-เบอร์ สั่งผลิตกี่ครั้งก็ได้</span></li>
                  <li><b>สีตรงกับที่พิมพ์จริง</b><span>ตัวอย่างใช้ชาร์ตสีและแพทเทิร์นเดียวกับโรงงาน</span></li>
                  <li><b>ราคาลายแยกจากค่าผลิต</b><span>ค่าเสื้อคิดตามจำนวนตอนสั่งผลิต</span></li>
                </ul>

                {!reporting ? (
                  <button type="button" className="ax-mk-report" onClick={() => setReporting(true)}>แจ้งลายละเมิดลิขสิทธิ์</button>
                ) : (
                  <div className="ax-mk-reportbox">
                    <p className="ax-psub" style={{ fontSize: 13, margin: 0 }}>แจ้งทีมงานหากลายนี้ใช้ภาพหรือโลโก้ที่มีลิขสิทธิ์โดยไม่ได้รับอนุญาต</p>
                    <select className="ax-field" value={reason} onChange={e => setReason(e.target.value)} aria-label="เหตุผล">
                      {REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <textarea className="ax-field" style={{ minHeight: 80, fontFamily: "inherit" }} placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" value={detail} onChange={e => setDetail(e.target.value)} />
                    <div className="ax-ck-nav">
                      <button type="button" className="ax-sq" onClick={() => setReporting(false)} disabled={busy}>ยกเลิก</button>
                      <button type="button" className="ax-btn solid sq" onClick={sendReport} disabled={busy}>{busy ? "กำลังส่ง…" : "ส่งรายงาน"}</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>

        {more.length > 0 && t && (
          <section className="ax-mk-more" aria-labelledby="more-title">
            <div className="ax-sec-head" style={{ marginBottom: 24 }}>
              <h2 id="more-title" className="ax-display" style={{ fontSize: "clamp(32px,4vw,52px)" }}>ลายอื่นจาก {designer}</h2>
              <Link href={`/designers/${t.designer?.id}`} className="ax-btn ghost">ดูร้านทั้งหมด</Link>
            </div>
            <div className="ax-mk-grid">{more.map(m => <TemplateCard key={m.id} t={m} />)}</div>
          </section>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
