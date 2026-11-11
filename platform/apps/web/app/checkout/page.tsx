"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CheckoutScene, { type CheckoutPhase } from "../../components/CheckoutScene";
import PayPanel from "../../components/PayPanel";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api";
import { parseOrderDraft, linesFromQty, emptyQty, DRAFT_KEY, SIZES, type RosterRow, type Size } from "../../lib/order-draft";
import { KITS, kitById, restoreConfig, kitFabrics, kitTrims, kitPriceGarment, FABRIC_OPTIONS, TRIM_OPTIONS, type Kit, type KitConfig } from "../../lib/kits";
import { useKitAssets } from "../../lib/use-kit-assets";
import "../app.css";
import "../home.css";

interface Breakdown {
  totalQty: number; tierPrice: number; fabricSurcharge: number; trimSurcharge: number;
  garment?: string; garmentSurcharge?: number; reversibleSurcharge: number; unitPrice: number; subtotal: number; shippingFee: number;
  total: number; depositAmount: number; depositPct: number; freeShippingOver: number;
}
interface Address { id: string; label?: string | null; recipient: string; phone: string; line1: string; line2?: string | null; district?: string | null; province?: string | null; postalCode: string; isDefault: boolean }
type Step = 0 | 1 | 2 | 3;

const STEPS = ["จำนวน", "จัดส่ง", "ยืนยัน", "ชำระเงิน"];
const baht = (n: number) => "฿" + Math.round(n ?? 0).toLocaleString("th-TH");

/**
 * The 3D checkout for kits from /shop: sizes → delivery → review → pay.
 * The stage shows every shirt in the order on its size stack; placing the
 * order packs them into a labelled carton, and a confirmed payment sends the
 * carton off to production. Orders are created exactly like /order/new.
 */
function Checkout() {
  const { user, token, loading } = useAuth();
  const designId = useSearchParams().get("design") || "";

  const [kit, setKit] = useState<Kit>(KITS[0]);
  const [cfg, setCfg] = useState<KitConfig | null>(null);
  const [design, setDesign] = useState<any>(null);
  const [fabric, setFabric] = useState("mesh");
  const [trim, setTrim] = useState("full");
  // designs from the advanced designer can be two-sided; kit-studio designs never are
  const [reversible, setReversible] = useState(false);
  const [qty, setQty] = useState<Record<Size, number>>(emptyQty());
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addrId, setAddrId] = useState("");
  const [note, setNote] = useState("");
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<{ id: string; orderNo: string } | null>(null);
  const [payEnabled, setPayEnabled] = useState(false);
  const [paid, setPaid] = useState(false);

  // the hand-off from /shop/[kit] or the advanced designer: read once, then drop it
  useEffect(() => {
    if (!designId) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(DRAFT_KEY); if (raw) sessionStorage.removeItem(DRAFT_KEY); } catch { return; }
    const d = parseOrderDraft(raw, designId);
    if (!d) return;
    setFabric(d.fabric);
    setTrim(d.trim);
    setReversible(d.reversible);
    setRoster(d.roster);
    setQty(d.qty);
  }, [designId]);

  // the saved design: which kit, its colours and the name/number
  useEffect(() => {
    if (!designId || !token) return;
    apiFetch<any>(`/designs/${designId}`, { token })
      .then(d => {
        setDesign(d);
        const doc = d.stateJson || {};
        const k = kitById(String(doc.kit ?? "")) ?? KITS[0];
        setKit(k);
        const c = restoreConfig(k, doc);
        setCfg(c);
        setFabric(f => (f === "mesh" && doc.fabric ? c.fabric : f));
        setTrim(t => (t === "full" && doc.trim ? c.trim : t));
        if (Array.isArray(doc.roster)) setRoster(r => (r.length ? r : doc.roster));
      })
      .catch(() => setErr("โหลดแบบเสื้อไม่สำเร็จ"));
  }, [designId, token]);

  const loadAddresses = useCallback(() => {
    if (!token) return;
    apiFetch<Address[]>("/auth/addresses", { token })
      .then(a => { setAddresses(a); setAddrId(p => p || a.find(x => x.isDefault)?.id || a[0]?.id || ""); })
      .catch(() => setAddresses([]));
  }, [token]);
  useEffect(loadAddresses, [loadAddresses]);

  useEffect(() => {
    apiFetch<{ enabled: boolean }>("/payments/status").then(s => setPayEnabled(s.enabled)).catch(() => {});
  }, []);

  const totalQty = SIZES.reduce((n, s) => n + (qty[s] || 0), 0);
  // a hoodie or shorts is priced as such (the server reads the garment from the design itself)
  const garment = design?.stateJson?.kind === "kit-studio" ? kitPriceGarment(kit) : "jersey";
  useEffect(() => {
    if (totalQty === 0) { setBd(null); return; }
    const t = setTimeout(() => {
      apiFetch<Breakdown>(`/orders/quote?totalQty=${totalQty}&fabric=${fabric}&trim=${trim}&reversible=${reversible}&garment=${garment}`).then(setBd).catch(() => setBd(null));
    }, 200);
    return () => clearTimeout(t);
  }, [totalQty, fabric, trim, reversible, garment]);
  // only the fabrics and trims this garment is made with (advanced designs: all of them)
  const isKitDesign = !design || design?.stateJson?.kind === "kit-studio";
  const fabricChoices = isKitDesign ? FABRIC_OPTIONS.filter(f => kitFabrics(kit).includes(f.id)) : FABRIC_OPTIONS;
  const trimChoices = isKitDesign ? kitTrims(kit) : TRIM_OPTIONS.map(t => ({ id: t.id, label: t.label }));

  const rosterBySize = useMemo(() => {
    const m = emptyQty();
    roster.forEach(r => { m[r.size]++; });
    return m;
  }, [roster]);
  const rosterOver = SIZES.some(s => rosterBySize[s] > (qty[s] || 0));

  // the team's own logo/font, from this device or the files saved with the design
  const assets = useKitAssets({ ...(cfg ?? {}), assets: design?.stateJson?.assets });
  const look = useMemo(() => {
    const c = cfg ?? restoreConfig(kit, null);
    return {
      colors: c.colors, pattern: c.pattern, trim: c.trim, fabric: c.fabric, name: c.name.trim(), number: c.number, font: c.font,
      logo: assets.logo, logoTint: assets.logoTint, fontFamily: assets.fontFamily,
    };
  }, [cfg, kit, assets.logo, assets.logoTint, assets.fontFamily]);

  const phase: CheckoutPhase = paid ? "sent" : order ? "pack" : "build";
  // a design from the advanced designer has no 3D kit: show its own preview instead
  const isKit = isKitDesign;
  const backHref = isKit ? `/shop/${kit.id}` : `/design?design=${designId}`;
  const addr = addresses?.find(a => a.id === addrId);

  const setSize = (s: Size, n: number) => setQty(q => ({ ...q, [s]: Math.max(0, Math.min(5000, Math.trunc(n) || 0)) }));

  function next() {
    setErr("");
    if (step === 0) {
      if (totalQty === 0) { setErr("ใส่จำนวนอย่างน้อย 1 ตัว"); return; }
      if (rosterOver) { setErr("จำนวนรายชื่อเกินจำนวนเสื้อของบางไซซ์"); return; }
    }
    if (step === 1 && !addrId) { setErr("เลือกที่อยู่จัดส่งก่อน"); return; }
    setStep(s => (s < 2 ? ((s + 1) as Step) : s));
  }

  async function place() {
    setErr("");
    if (!addrId || totalQty === 0 || rosterOver) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string; orderNo: string }>("/orders", {
        method: "POST", token,
        body: JSON.stringify({
          designId: designId || undefined,
          designSnapshot: design?.stateJson,
          previewUrl: design?.previewUrl,
          fabric, trim, reversible,
          lines: linesFromQty(qty),
          roster: roster.filter(r => r.playerName || r.number).map(r => ({ ...r, qty: 1 })),
          shippingAddressId: addrId,
          note,
        }),
      });
      setOrder(res);
      setStep(3);
      // on a phone the stage is above the panel: bring the packing into view
      if (window.matchMedia("(max-width: 900px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErr(e.message || "สร้างออเดอร์ไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  if (loading) return <Shell><p className="ax-psub" style={{ padding: 40 }}>กำลังโหลด…</p></Shell>;
  if (!user) {
    return (
      <Shell>
        <div className="ax-ck-empty">
          <h1 className="ax-display">เข้าสู่ระบบก่อนสั่งผลิต</h1>
          <p className="ax-psub">เพื่อบันทึกออเดอร์และที่อยู่จัดส่งของทีม</p>
          <Link className="ax-btn solid sq" href={`/login?next=${encodeURIComponent(`/checkout?design=${designId}`)}`}>เข้าสู่ระบบ</Link>
        </div>
      </Shell>
    );
  }
  if (!designId) {
    return (
      <Shell>
        <div className="ax-ck-empty">
          <h1 className="ax-display">ยังไม่ได้เลือกเสื้อ</h1>
          <p className="ax-psub">เลือกทรงและออกแบบที่ราวเสื้อก่อน แล้วกดสั่งผลิตจากหน้าแบบ</p>
          <Link className="ax-btn solid sq" href="/shop">ไปที่ราวเสื้อ</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell back={step < 3 ? backHref : undefined}>
      <div className="ax-sbody">
        <section className="ax-sstage ax-ck-stage" aria-label="เสื้อที่กำลังสั่งผลิต">
          {isKit ? (
            <CheckoutScene kit={kit} look={look} counts={qty} phase={phase} label={order?.orderNo} />
          ) : (
            <div className="ax-ck-preview" data-phase={phase}>
              {design?.previewUrl ? <img src={design.previewUrl} alt={design.name || "แบบเสื้อ"} /> : <span className="ax-mono">ไม่มีภาพตัวอย่าง</span>}
              {phase !== "build" && <span className="stamp ax-mono">{order?.orderNo}</span>}
            </div>
          )}
          <div className="ax-sover ax-stitle">
            <span style={{ fontSize: 15, color: "#e3e1dc" }}>{isKit ? `${kit.name} · ${kit.code}` : `${design?.name ?? "แบบจากโปรแกรมออกแบบ"}${reversible ? " · สองด้าน" : ""}`}</span>
            <h1>{phase === "build" ? <>เช็กให้ครบ<br />ก่อนผลิต.</> : phase === "pack" ? <>แพ็กลงกล่อง<br />แล้ว.</> : <>ส่งเข้าคิว<br />ผลิตแล้ว.</>}</h1>
            <span className="bar" aria-hidden="true" />
            <span className="ax-tagline">{order ? order.orderNo : `${totalQty} PCS`}<br />{FABRIC_OPTIONS.find(f => f.id === fabric)?.label ?? fabric}</span>
          </div>
        </section>

        <aside className="ax-panel" aria-live="polite">
          <ol className="ax-ck-steps" aria-label="ขั้นตอนสั่งผลิต">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={step === i ? "step" : undefined} data-done={i < step || undefined}>
                <span>{String(i + 1).padStart(2, "0")}</span>{s}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <>
              <div>
                <h2>ไซซ์และจำนวน</h2>
                <p className="ax-psub">{roster.length ? `มีรายชื่อ ${roster.length} คนจากหน้าแบบ · เพิ่มตัวสำรองได้` : "ราคาต่อตัวลดลงเมื่อสั่งมากขึ้น"}</p>
              </div>
              <div>
                {SIZES.map(s => (
                  <div className="ax-step" key={s}>
                    <span style={{ fontFamily: "var(--ax-mono)", fontSize: 15 }}>
                      {s}{rosterBySize[s] > 0 && <small style={{ color: "var(--ax-mute)", marginLeft: 10 }}>รายชื่อ {rosterBySize[s]}</small>}
                    </span>
                    <div className="ctl">
                      <button type="button" aria-label={`ลด ${s}`} onClick={() => setSize(s, (qty[s] || 0) - 1)}>−</button>
                      <input aria-label={`จำนวนไซซ์ ${s}`} inputMode="numeric" value={qty[s] || 0} onChange={e => setSize(s, Number(e.target.value.replace(/\D/g, "")))} />
                      <button type="button" aria-label={`เพิ่ม ${s}`} onClick={() => setSize(s, (qty[s] || 0) + 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ax-grid2">
                <label>
                  <span className="ax-label">ผ้า</span>
                  <select className="ax-field" value={fabric} onChange={e => setFabric(e.target.value)}>
                    {fabricChoices.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="ax-label">ขลิบ</span>
                  <select className="ax-field" value={trim} onChange={e => setTrim(e.target.value)}>
                    {trimChoices.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
              </div>
              <PriceBox bd={bd} totalQty={totalQty} />
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2>ส่งไปที่ไหน</h2>
                <p className="ax-psub">เลือกที่อยู่ที่บันทึกไว้ในบัญชี</p>
              </div>
              {addresses === null ? (
                <p className="ax-psub">กำลังโหลดที่อยู่…</p>
              ) : addresses.length === 0 ? (
                <div className="ax-ck-card">
                  <p style={{ margin: 0 }}>ยังไม่มีที่อยู่ในบัญชี</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link className="ax-btn ghost sq" href="/account?tab=address" target="_blank">เพิ่มที่อยู่ (แท็บใหม่)</Link>
                    <button type="button" className="ax-sq" onClick={loadAddresses}>โหลดใหม่</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="radiogroup" aria-label="ที่อยู่จัดส่ง">
                  {addresses.map(a => (
                    <button key={a.id} type="button" role="radio" aria-checked={addrId === a.id} className="ax-opt left" aria-pressed={addrId === a.id} onClick={() => setAddrId(a.id)}>
                      <span><b>{a.recipient}</b> · {a.phone}{a.isDefault && <small style={{ marginLeft: 8 }}>ค่าเริ่มต้น</small>}</span>
                      <small>{[a.line1, a.line2, a.district, a.province, a.postalCode].filter(Boolean).join(" ")}</small>
                    </button>
                  ))}
                </div>
              )}
              <label>
                <span className="ax-label">หมายเหตุถึงโรงงาน</span>
                <textarea className="ax-field" style={{ minHeight: 90, fontFamily: "inherit" }} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ต้องการรับก่อนวันแข่ง 20 พ.ย." />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2>ตรวจสอบ</h2>
                <p className="ax-psub">กดยืนยันแล้วออเดอร์จะอยู่ในสถานะรอชำระเงิน ยังยกเลิกได้ก่อนชำระ</p>
              </div>
              <div className="ax-ck-card">
                <Row k="เสื้อ" v={`${kit.name} · ${kit.code}`} />
                <Row k="ผ้า / ขลิบ" v={`${FABRIC_OPTIONS.find(f => f.id === fabric)?.label ?? fabric} · ${trimChoices.find(t => t.id === trim)?.label ?? trim}`} />
                <Row k="ไซซ์" v={SIZES.filter(s => qty[s]).map(s => `${s} ${qty[s]}`).join(" · ")} />
                {roster.length > 0 && <Row k="ชื่อ-เบอร์" v={`${roster.filter(r => r.playerName || r.number).length} รายชื่อ`} />}
                {addr && <Row k="ส่งถึง" v={`${addr.recipient} · ${addr.province ?? ""} ${addr.postalCode}`} />}
              </div>
              <PriceBox bd={bd} totalQty={totalQty} detailed />
            </>
          )}

          {step === 3 && order && (
            <>
              <div>
                <h2>{paid ? "ชำระเรียบร้อย" : "ชำระเงิน"}</h2>
                <p className="ax-psub">
                  ออเดอร์ <b style={{ fontFamily: "var(--ax-mono)", color: "var(--ax-ink)" }}>{order.orderNo}</b>
                  {paid ? " ผ่านการตรวจสอบแล้ว · เข้าคิวผลิต" : bd ? ` · มัดจำ ${bd.depositPct}% ${baht(bd.depositAmount)} ก่อนเริ่มผลิต` : ""}
                </p>
              </div>
              {!paid && token && (payEnabled ? (
                <div className="ax-ck-pay"><PayPanel orderId={order.id} token={token} onPaid={() => setPaid(true)} /></div>
              ) : (
                <div className="ax-ck-card"><p style={{ margin: 0 }}>ยังไม่เปิดรับชำระเงินออนไลน์ · ทีมงานจะติดต่อกลับเพื่อแจ้งช่องทางชำระ</p></div>
              ))}
              {paid && (
                <ol className="ax-ck-card ax-ck-next">
                  <li><b>ตรวจแบบ</b><span>ทีมงานส่งแบบให้ยืนยันอีกครั้งก่อนพิมพ์</span></li>
                  <li><b>ผลิต</b><span>พิมพ์ ตัด เย็บ ตามจำนวนและรายชื่อ</span></li>
                  <li><b>จัดส่ง</b><span>แจ้งเลขพัสดุในหน้าออเดอร์</span></li>
                </ol>
              )}
              <Link className="ax-btn ghost sq" href={`/orders/${order.id}`}>ดูรายละเอียดออเดอร์</Link>
            </>
          )}

          {err && <p className="ax-err" role="alert">{err}</p>}

          {step < 3 && (
            <div className="ax-ck-nav">
              {step > 0 && <button type="button" className="ax-sq" onClick={() => { setErr(""); setStep(s => (s - 1) as Step); }}>ย้อนกลับ</button>}
              {step < 2 ? (
                <button type="button" className="ax-btn solid sq" onClick={next} disabled={step === 0 && totalQty === 0}>ต่อไป</button>
              ) : (
                <button type="button" className="ax-btn solid sq" onClick={place} disabled={busy || !bd || !addrId || rosterOver}>
                  {busy ? "กำลังสร้างออเดอร์…" : `ยืนยันสั่งผลิต${bd ? ` · ${baht(bd.total)}` : ""}`}
                </button>
              )}
            </div>
          )}
          <div className="ax-note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>
            ทุกงานตรวจแบบกับทีมก่อนเริ่มผลิต
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children, back }: { children: React.ReactNode; back?: string }) {
  return (
    <div className="ax ax-studio">
      <header className="ax-sbar">
        <Link href="/shop" className="ax-sbrand" aria-label="กลับไปที่ราวเสื้อ">
          <span>A</span><span>AXIOM / CHECKOUT</span>
        </Link>
        <div className="ax-sbar-right">
          {back && <><Link href={back}>กลับไปแก้แบบ</Link><span className="sep" aria-hidden="true" /></>}
          <Link href="/account">บัญชีของฉัน</Link>
        </div>
      </header>
      {children}
    </div>
  );
}

function PriceBox({ bd, totalQty, detailed }: { bd: Breakdown | null; totalQty: number; detailed?: boolean }) {
  if (!bd) return <p className="ax-psub" style={{ fontSize: 13, margin: 0 }}>{totalQty ? "กำลังคำนวณราคา…" : "ใส่จำนวนเพื่อดูราคา"}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>ราคาต่อตัว · {bd.totalQty} ตัว</span><span>{baht(bd.unitPrice)}</span></div>
      {detailed && bd.fabricSurcharge > 0 && <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>รวมค่าผ้า</span><span>+{baht(bd.fabricSurcharge)}/ตัว</span></div>}
      {detailed && bd.trimSurcharge > 0 && <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>รวมค่าขลิบ</span><span>+{baht(bd.trimSurcharge)}/ตัว</span></div>}
      {detailed && !!bd.garmentSurcharge && (
        <div className="ax-price">
          <span style={{ color: "var(--ax-mute)" }}>{GARMENT_TH[bd.garment ?? ""] ?? "เสื้อฮู้ด"} (จากราคาเสื้อ)</span>
          <span>{bd.garmentSurcharge > 0 ? "+" : "−"}{baht(Math.abs(bd.garmentSurcharge))}/ตัว</span>
        </div>
      )}
      <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>ค่าส่ง</span><span>{bd.shippingFee ? baht(bd.shippingFee) : "ฟรี"}</span></div>
      <div className="ax-price"><span>ยอดรวม</span><b>{baht(bd.total)}</b></div>
      <p className="ax-psub" style={{ fontSize: 13, margin: 0 }}>มัดจำ {bd.depositPct}% · {baht(bd.depositAmount)}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="ax-price" style={{ fontSize: 14 }}>
      <span style={{ color: "var(--ax-mute)" }}>{k}</span><span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}

/** what a non-jersey garment is called on the price breakdown */
const GARMENT_TH: Record<string, string> = {
  hoodie: "เสื้อฮู้ด", shorts: "กางเกง", piste: "เสื้อวอร์ม", piste_zip: "เสื้อวอร์มซิป", pants: "กางเกงวอร์ม",
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="ax ax-studio" />}>
      <Checkout />
    </Suspense>
  );
}
