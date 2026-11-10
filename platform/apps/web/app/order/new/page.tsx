"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { parseOrderDraft, qtyFromRoster, linesFromQty, DRAFT_KEY, type RosterRow } from "../../../lib/order-draft";

const SIZES = ["S", "M", "L", "XL"] as const;
const FABRICS = [
  { id: "mesh", label: "Mesh (ตาข่าย ระบายอากาศดี)" },
  { id: "B1", label: "B1 (เนื้อนุ่ม ทิ้งตัว)" },
  { id: "C1", label: "C1 (พรีเมียม เนื้อแน่น)" },
];
const TRIMS = [
  { id: "none", label: "ไม่มีขลิบ" },
  { id: "neck", label: "ขลิบคอ" },
  { id: "neckarm", label: "ขลิบคอ + แขน" },
  { id: "full", label: "ขลิบเต็ม (คอ + แขน + ชายเสื้อ)" },
];

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");

interface Breakdown {
  totalQty: number; tierPrice: number; fabricSurcharge: number; trimSurcharge: number;
  reversibleSurcharge: number; unitPrice: number; subtotal: number; shippingFee: number;
  total: number; depositAmount: number; depositPct: number; freeShippingOver: number;
}
interface Table { tiers: { minQty: number; price: number }[]; freeShippingOver: number; depositPct: number }
interface Address { id: string; label?: string | null; recipient: string; phone: string; line1: string; line2?: string | null; district?: string | null; province?: string | null; postalCode: string; isDefault: boolean }

function Checkout() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const designId = useSearchParams().get("design") || undefined;

  const [design, setDesign] = useState<any>(null);
  const [fabric, setFabric] = useState("mesh");
  const [trim, setTrim] = useState("full");
  const [reversible, setReversible] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({ S: 0, M: 0, L: 0, XL: 0 });
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrId, setAddrId] = useState("");
  const [note, setNote] = useState("");
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const totalQty = useMemo(() => SIZES.reduce((s, z) => s + (qty[z] || 0), 0), [qty]);

  // price table (public)
  useEffect(() => { apiFetch<Table>("/orders/price-table").then(setTable).catch(() => {}); }, []);

  const [prefilled, setPrefilled] = useState(0); // how many roster rows came from the designer

  // A "สั่งผลิตเลย" hand-off from the designer leaves the roster + spec here.
  // Read it once, then drop it so a refresh doesn't resurrect stale data.
  useEffect(() => {
    if (!designId) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) sessionStorage.removeItem(DRAFT_KEY);
    } catch { return; } // private mode
    const draft = parseOrderDraft(raw, designId);
    if (!draft) return;

    setFabric(draft.fabric);
    setTrim(draft.trim);
    setReversible(draft.reversible);
    if (draft.roster.length === 0) return;

    setRoster(draft.roster);
    setQty(draft.qty); // one shirt per player → the size breakdown writes itself
    setPrefilled(draft.roster.length);
  }, [designId]);

  // load the design being ordered — prefill fabric/trim/style from its saved state
  useEffect(() => {
    if (!designId || !token) return;
    apiFetch<any>(`/designs/${designId}`, { token })
      .then(d => {
        setDesign(d);
        const doc = d.stateJson || {};
        // a roster doc nests the real design under `template`
        const spec = doc.template ?? doc;
        // never clobber values the designer hand-off already set
        setFabric(f => (f === "mesh" && spec.fabric ? spec.fabric : f));
        setTrim(t => (t === "full" && spec.trim ? spec.trim : t));
        if (spec.style === 2 || doc.style === 2 || d.mode === "reversible") setReversible(true);
      })
      .catch(() => setErr("โหลดดีไซน์ไม่สำเร็จ"));
  }, [designId, token]);

  // addresses
  const loadAddresses = useCallback(() => {
    if (!token) return;
    apiFetch<Address[]>("/auth/addresses", { token }).then(a => {
      setAddresses(a);
      setAddrId(prev => prev || a.find(x => x.isDefault)?.id || a[0]?.id || "");
    }).catch(() => {});
  }, [token]);
  useEffect(loadAddresses, [loadAddresses]);

  // live price preview (debounced)
  useEffect(() => {
    if (totalQty === 0) { setBd(null); return; }
    const t = setTimeout(() => {
      apiFetch<Breakdown>(`/orders/quote?totalQty=${totalQty}&fabric=${fabric}&trim=${trim}&reversible=${reversible}`)
        .then(setBd).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [totalQty, fabric, trim, reversible]);

  function setSize(z: string, v: string) {
    const n = Math.max(0, Math.min(5000, Math.trunc(Number(v) || 0)));
    setQty(q => ({ ...q, [z]: n }));
  }

  // roster rows must not exceed the qty booked for that size
  const rosterBySize = useMemo(() => {
    const m: Record<string, number> = {};
    roster.forEach(r => { m[r.size] = (m[r.size] || 0) + 1; });
    return m;
  }, [roster]);
  const rosterOver = SIZES.some(z => (rosterBySize[z] || 0) > (qty[z] || 0));

  async function submit() {
    setErr("");
    if (totalQty === 0) { setErr("กรุณาระบุจำนวนอย่างน้อย 1 ไซส์"); return; }
    if (!addrId) { setErr("กรุณาเลือกที่อยู่จัดส่ง"); return; }
    if (rosterOver) { setErr("จำนวนรายชื่อนักกีฬาเกินจำนวนเสื้อของไซส์นั้น"); return; }
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string; orderNo: string }>("/orders", {
        method: "POST", token,
        body: JSON.stringify({
          designId,
          designSnapshot: design?.stateJson,
          previewUrl: design?.previewUrl,
          fabric, trim, reversible,
          lines: linesFromQty(qty as any),
          roster: roster.filter(r => r.playerName || r.number).map(r => ({ ...r, qty: 1 })),
          shippingAddressId: addrId,
          note,
        }),
      });
      router.push(`/orders/${res.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  if (loading) return <AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>;
  if (!user)
    return (
      <AppShell narrow>
        <div className="acard">
          <h1 className="atitle">ต้องเข้าสู่ระบบก่อนสั่งผลิต</h1>
          <p className="asub">เพื่อบันทึกออเดอร์และที่อยู่จัดส่งของคุณ</p>
          <Link className="abtn solid" href="/login">เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );

  return (
    <AppShell wide>
      <Link href="/account" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>← กลับไปบัญชีของฉัน</Link>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <div>
          {/* design */}
          <div className="acard">
            <div className="eyebrow">สั่งผลิต</div>
            <h1 className="atitle" style={{ marginBottom: 4 }}>{design?.name || "ออเดอร์ใหม่"}</h1>
            {!designId && <p className="asub">ยังไม่ได้เลือกดีไซน์ — สั่งผลิตแบบเปล่าได้ แต่แนะนำให้ <Link className="dlink" href="/design">ออกแบบก่อน</Link> · มีไฟล์งานจาก Illustrator แล้ว? <Link className="dlink" href="/order/upload">ส่งไฟล์ .zip</Link></p>}
            {prefilled > 0 && (
              <div className="note-ok" style={{ marginTop: 10 }}>
                ✓ ดึงรายชื่อ {prefilled} คน และสเปกจากดีไซเนอร์มาให้แล้ว — ตรวจจำนวนแต่ละไซส์ด้านล่างแล้วกดยืนยันได้เลย
              </div>
            )}
            {design?.previewUrl && (
              <img src={design.previewUrl} alt="" style={{ maxWidth: 260, marginTop: 10, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }} />
            )}
          </div>

          {/* spec */}
          <div className="acard">
            <h2 className="ah2">สเปกเสื้อ</h2>
            <label className="flabel">ชนิดผ้า</label>
            <select className="ainput" value={fabric} onChange={e => setFabric(e.target.value)}>
              {FABRICS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <label className="flabel">ขลิบ</label>
            <select className="ainput" value={trim} onChange={e => setTrim(e.target.value)}>
              {TRIMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 14, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={reversible} onChange={e => setReversible(e.target.checked)} />
              เสื้อ 2 ด้าน (reversible / แบบ 2 ชิ้น)
            </label>
          </div>

          {/* sizes */}
          <div className="acard">
            <h2 className="ah2">จำนวนแต่ละไซส์</h2>
            <p className="asub">รวม {totalQty} ตัว {table && totalQty > 0 && <>· ราคาขั้น {baht(bd?.tierPrice ?? 0)}/ตัว</>}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 12 }}>
              {SIZES.map(z => (
                <div key={z}>
                  <label className="flabel" style={{ margin: "0 0 6px" }}>ไซส์ {z}</label>
                  <input className="ainput" type="number" min={0} value={qty[z]} onChange={e => setSize(z, e.target.value)} />
                </div>
              ))}
            </div>
            {table && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
                {table.tiers.map(t => (
                  <span key={t.minQty} className={`chip${bd && bd.tierPrice === t.price ? " on" : ""}`} style={{ pointerEvents: "none" }}>
                    {t.minQty}+ ตัว · {baht(t.price)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* roster */}
          <div className="acard">
            <h2 className="ah2">รายชื่อ-เบอร์นักกีฬา (ไม่บังคับ)</h2>
            <p className="asub">ใส่ไว้เพื่อให้โรงงานสกรีนชื่อ-เบอร์ตรงตัว · ตอนนี้ {roster.length} รายชื่อ</p>
            {roster.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr .8fr auto", gap: 8, marginTop: 8 }}>
                <input className="ainput" placeholder="ชื่อหลังเสื้อ" value={r.playerName}
                  onChange={e => setRoster(rs => rs.map((x, j) => j === i ? { ...x, playerName: e.target.value } : x))} />
                <input className="ainput" placeholder="เบอร์" value={r.number}
                  onChange={e => setRoster(rs => rs.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} />
                <select className="ainput" value={r.size}
                  onChange={e => setRoster(rs => rs.map((x, j) => j === i ? { ...x, size: e.target.value as RosterRow["size"] } : x))}>
                  {SIZES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <button className="minibtn danger" onClick={() => setRoster(rs => rs.filter((_, j) => j !== i))}>ลบ</button>
              </div>
            ))}
            <div className="rowbtns" style={{ marginTop: 10 }}>
              <button className="minibtn" onClick={() => setRoster(rs => [...rs, { playerName: "", number: "", size: "M" }])}>+ เพิ่มรายชื่อ</button>
              {roster.length > 0 && (
                <button className="minibtn" onClick={() => setQty(qtyFromRoster(roster))}>
                  ↻ ปรับจำนวนไซส์ตามรายชื่อ ({roster.length} ตัว)
                </button>
              )}
            </div>
            {rosterOver && (
              <p style={{ color: "var(--err, #dc2626)", fontSize: 12.5, marginTop: 10 }}>
                ⚠ จำนวนรายชื่อเกินจำนวนเสื้อของบางไซส์ — กด "ปรับจำนวนไซส์ตามรายชื่อ" หรือแก้จำนวนด้านบน
              </p>
            )}
          </div>

          {/* address */}
          <div className="acard">
            <h2 className="ah2">ที่อยู่จัดส่ง</h2>
            {addresses.length === 0 ? (
              <p className="asub">ยังไม่มีที่อยู่ — <Link className="dlink" href="/account">เพิ่มที่อยู่ในบัญชีของฉัน</Link> แล้วกลับมาหน้านี้</p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {addresses.map(a => (
                  <label key={a.id} className="addr" style={{ display: "flex", gap: 10, cursor: "pointer", borderColor: addrId === a.id ? "var(--brand)" : undefined }}>
                    <input type="radio" name="addr" checked={addrId === a.id} onChange={() => setAddrId(a.id)} style={{ marginTop: 3 }} />
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                      <b>{a.recipient}</b> · {a.phone}{a.isDefault && <span className="tag blue"> ค่าเริ่มต้น</span>}
                      <div className="dim">{a.line1} {a.line2} {a.district} {a.province} {a.postalCode}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <label className="flabel">หมายเหตุถึงโรงงาน</label>
            <textarea className="ainput" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ต้องการรับก่อนวันที่ 20" />
          </div>
        </div>

        {/* summary */}
        <div className="acard" style={{ position: "sticky", top: 88 }}>
          <h2 className="ah2">สรุปคำสั่งซื้อ</h2>
          {!bd ? (
            <p className="asub" style={{ marginTop: 10 }}>ใส่จำนวนเสื้อเพื่อดูราคา</p>
          ) : (
            <>
              <Row k={`ราคาขั้น (${bd.totalQty} ตัว)`} v={baht(bd.tierPrice)} />
              {bd.fabricSurcharge > 0 && <Row k={`ผ้า ${fabric}`} v={"+" + baht(bd.fabricSurcharge)} />}
              {bd.trimSurcharge > 0 && <Row k="ขลิบ" v={"+" + baht(bd.trimSurcharge)} />}
              {bd.reversibleSurcharge > 0 && <Row k="เสื้อ 2 ด้าน" v={"+" + baht(bd.reversibleSurcharge)} />}
              <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "10px 0" }} />
              <Row k="ราคาต่อตัว" v={<b>{baht(bd.unitPrice)}</b>} />
              <Row k={`× ${bd.totalQty} ตัว`} v={baht(bd.subtotal)} />
              <Row k="ค่าจัดส่ง" v={bd.shippingFee === 0 ? <span style={{ color: "var(--okc, #16a34a)" }}>ฟรี</span> : baht(bd.shippingFee)} />
              {bd.shippingFee > 0 && <p className="dim">สั่งครบ {baht(bd.freeShippingOver)} ส่งฟรี</p>}
              <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "10px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b>ยอดรวม</b>
                <b style={{ fontSize: 24, color: "var(--brand)" }}>{baht(bd.total)}</b>
              </div>
              <p className="dim" style={{ marginTop: 8 }}>
                {bd.depositPct >= 100 ? "ชำระเต็มจำนวนก่อนเริ่มผลิต" : `มัดจำ ${bd.depositPct}% = ${baht(bd.depositAmount)}`}
              </p>
            </>
          )}
          {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
          <button className="abtn solid block" style={{ marginTop: 16 }} disabled={busy || !bd || !addrId || rosterOver} onClick={submit}>
            {busy ? "กำลังสร้างออเดอร์…" : "ยืนยันสั่งผลิต"}
          </button>
          <p className="dim" style={{ marginTop: 10 }}>กดยืนยันแล้วออเดอร์จะถูกสร้างในสถานะ "รอชำระเงิน" ยังยกเลิกได้ก่อนชำระ</p>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0", color: "var(--ink)" }}>
      <span className="dim" style={{ fontSize: 13 }}>{k}</span><span>{v}</span>
    </div>
  );
}

export default function OrderNewPage() {
  return (
    <Suspense fallback={<AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>}>
      <Checkout />
    </Suspense>
  );
}
