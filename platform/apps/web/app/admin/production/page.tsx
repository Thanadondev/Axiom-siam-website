"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import JerseyStage from "../../../components/JerseyStage";
import KitThumb from "../../../components/KitThumb";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { kitById, restoreConfig, KITS, type Kit } from "../../../lib/kits";
import { useKitAssets } from "../../../lib/use-kit-assets";
import { assetHref } from "../../../lib/kit-assets";
import { STEPS, SHIP_STEP } from "../../../lib/production-steps";
import "../../app.css";
import "../../home.css";

/**
 * Production board: every paid order on its way through the factory, one
 * column per stage. Cards move forward with a button (or by dragging to the
 * next column); opening a card shows the shirt in 3D, the size split, the
 * roster and a printable job sheet. Status changes go through the same
 * admin endpoint as the order table in /admin, so the API's transition
 * rules still apply. Inside "กำลังผลิต" a job moves through the line's steps
 * (ทำไฟล์ → รีดและแพ็ค); the customer sees the step on their order.
 */

type Status = "pending" | "paid" | "approved" | "in_production" | "shipped" | "delivered" | "completed" | "cancelled" | "refunded";
interface Look { kit: string; colors: Record<string, string>; pattern?: string; number?: string; name?: string; font?: string; fabric?: string; trim?: string; logo?: string; logoTint?: boolean; fontAsset?: string }
interface Card {
  id: string; orderNo: string; status: Status; total: number; fabricSummary?: string | null; note?: string | null;
  createdAt: string; updatedAt: string;
  user: { id: string; email: string; fullName?: string | null };
  items: { size: string; qty: number }[];
  look: Look | null;
  /** where it is on the line: 0 not started, 1–9 the factory steps, 10 shipped */
  productionStep?: number;
  /** money still owed (the balance after a deposit): it can't ship until this is 0 */
  balance?: { outstanding: number };
  /** the same job in the factory ERP — when set, the step follows the ERP */
  erpOrderNo?: string | null;
  erpSyncedAt?: string | null;
}

const COLUMNS: { id: Status; label: string; hint: string }[] = [
  { id: "paid", label: "ชำระแล้ว", hint: "รอตรวจแบบกับลูกค้า" },
  { id: "approved", label: "อนุมัติแบบ", hint: "พร้อมเข้าไลน์ผลิต" },
  { id: "in_production", label: "กำลังผลิต", hint: "ขั้น 1–9 · ทำไฟล์ → รีดและแพ็ค" },
  { id: "shipped", label: "จัดส่งแล้ว", hint: "รอลูกค้ารับ" },
];
const STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน", paid: "ชำระแล้ว", approved: "อนุมัติแบบแล้ว", in_production: "กำลังผลิต",
  shipped: "จัดส่งแล้ว", delivered: "ได้รับแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", refunded: "คืนเงินแล้ว",
};
/** the forward step each column offers (mirrors the API's transition table) */
const FORWARD: Partial<Record<Status, Status>> = { paid: "approved", approved: "in_production", in_production: "shipped", shipped: "delivered" };
const FORWARD_TH: Partial<Record<Status, string>> = { paid: "อนุมัติแบบ", approved: "เริ่มผลิต", in_production: "จัดส่ง", shipped: "ลูกค้าได้รับแล้ว" };
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const COURIERS = ["Flash", "Kerry", "J&T", "ไปรษณีย์ไทย", "รับเองที่โรงงาน"];

const baht = (n: number) => "฿" + Math.round(n ?? 0).toLocaleString("th-TH");
const qtyOf = (c: { items: { qty: number }[] }) => c.items.reduce((n, i) => n + i.qty, 0);
const daysSince = (s: string) => Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000));
const sizeSplit = (items: { size: string; qty: number }[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.size, (m.get(i.size) ?? 0) + i.qty);
  return [...m.entries()].sort((a, b) => SIZE_ORDER.indexOf(a[0]) - SIZE_ORDER.indexOf(b[0]));
};

function kitOf(look: Look | null): Kit | null {
  return look ? kitById(look.kit) ?? null : null;
}
function jerseyLook(kit: Kit, look: Look | null) {
  const c = restoreConfig(kit, look ? { ...look } : null);
  return { colors: c.colors, pattern: c.pattern, trim: c.trim, fabric: c.fabric, name: c.name.trim(), number: c.number, font: c.font };
}

export default function ProductionBoard() {
  const { user, token, loading } = useAuth();
  const [cards, setCards] = useState<Record<string, Card[]>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [ship, setShip] = useState<Card | null>(null);
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    setErr("");
    try {
      const res = await Promise.all(COLUMNS.map(c => apiFetch<{ items: Card[] }>(`/admin/orders?take=200&status=${c.id}`, { token })));
      setCards(Object.fromEntries(COLUMNS.map((c, i) => [c.id, res[i].items])));
    } catch (e: any) { setErr(e.message || "โหลดออเดอร์ไม่สำเร็จ"); }
  }, [token, isAdmin]);
  useEffect(() => { if (!loading) load(); }, [loading, load]);

  async function move(card: Card, to: Status, extra: { courier?: string; trackingNo?: string; note?: string } = {}) {
    if (to === "shipped" && !extra.trackingNo) { setShip(card); return; }
    setBusy(card.id); setErr("");
    try {
      await apiFetch(`/admin/orders/${card.id}/status`, { method: "PATCH", token, body: JSON.stringify({ status: to, ...extra }) });
      await load();
    } catch (e: any) { setErr(`${card.orderNo}: ${e.message}`); }
    finally { setBusy(""); }
  }

  /** move a job along the line (steps 1–9; shipping is the "จัดส่ง" button) */
  async function step(card: { id: string; orderNo: string }, to: number) {
    setBusy(card.id); setErr("");
    try {
      await apiFetch(`/admin/orders/${card.id}/step`, { method: "PATCH", token, body: JSON.stringify({ step: to }) });
      await load();
    } catch (e: any) { setErr(`${card.orderNo}: ${e.message}`); throw e; }
    finally { setBusy(""); }
  }

  /** pull every linked job's step from the ERP now (it also runs by itself every few minutes) */
  async function syncErp() {
    setBusy("erp"); setErr(""); setNote("");
    try {
      const r = await apiFetch<{ message: string; failed: string[] }>(`/admin/orders/erp/sync`, { method: "POST", token });
      setNote(r.message);
      if (r.failed?.length) setErr(r.failed.join(" · "));
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cards;
    return Object.fromEntries(Object.entries(cards).map(([k, v]) => [k, v.filter(c =>
      c.orderNo.toLowerCase().includes(s) || (c.erpOrderNo ?? "").toLowerCase().includes(s) || c.user.email.toLowerCase().includes(s) || (c.user.fullName ?? "").toLowerCase().includes(s))]));
  }, [cards, q]);

  const inLine = (cards.in_production ?? []).reduce((n, c) => n + qtyOf(c), 0);
  const waiting = (cards.paid ?? []).length + (cards.approved ?? []).length;
  const late = [...(cards.paid ?? []), ...(cards.approved ?? []), ...(cards.in_production ?? [])].filter(c => daysSince(c.updatedAt) >= 7).length;

  if (loading) return <Frame><p className="ax-psub" style={{ padding: 40 }}>กำลังโหลด…</p></Frame>;
  if (!user || !isAdmin) {
    return (
      <Frame>
        <div className="ax-ck-empty">
          <h1 className="ax-display">{user ? "ไม่มีสิทธิ์เข้าถึง" : "ต้องเข้าสู่ระบบ"}</h1>
          <p className="ax-psub">บอร์ดผลิตสำหรับผู้ดูแลระบบเท่านั้น</p>
          <Link className="ax-btn solid sq" href={user ? "/account" : "/login?next=/admin/production"}>{user ? "กลับไปบัญชีของฉัน" : "เข้าสู่ระบบ"}</Link>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="ax-pb-top">
        <div>
          <h1 className="ax-pb-title">บอร์ดผลิต</h1>
          <p className="ax-psub" style={{ marginTop: 4 }}>ออเดอร์ที่ชำระแล้วจนถึงส่งของ · ลากการ์ดไปคอลัมน์ถัดไป หรือกดปุ่มบนการ์ด</p>
        </div>
        <div className="ax-pb-kpis">
          <div><b>{waiting}</b><span>รอเข้าไลน์</span></div>
          <div><b>{inLine.toLocaleString()}</b><span>ตัวในไลน์ผลิต</span></div>
          <div data-warn={late > 0 || undefined}><b>{late}</b><span>ค้างเกิน 7 วัน</span></div>
        </div>
        <div className="ax-pb-tools">
          <input className="ax-field" style={{ minHeight: 44, fontSize: 14 }} placeholder="ค้นหาเลขออเดอร์ / เลข ERP / ลูกค้า" value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาออเดอร์" />
          <button type="button" className="ax-sq" onClick={load} disabled={!!busy}>รีเฟรช</button>
          <button type="button" className="ax-sq" style={{ whiteSpace: "nowrap" }} onClick={syncErp} disabled={!!busy} title="อัปเดตขั้นตอนผลิตของออเดอร์ที่ผูกกับ ERP">
            {busy === "erp" ? "กำลังดึง…" : "ดึงจาก ERP"}
          </button>
        </div>
      </div>
      {note && <p className="ax-psub" role="status" style={{ padding: "0 24px 8px", margin: 0 }}>{note}</p>}
      {err && <p className="ax-err" role="alert" style={{ padding: "0 24px 12px" }}>{err}</p>}

      <div className="ax-pb-board">
        {COLUMNS.map(col => {
          const list = filtered[col.id] ?? [];
          const canDrop = !!dragging && FORWARD[dragging.status] === col.id;
          return (
            <section key={col.id} className="ax-pb-col" data-drop={canDrop || undefined} aria-label={col.label}
              onDragOver={e => { if (canDrop) e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); if (dragging && canDrop) move(dragging, col.id); setDragging(null); }}>
              <header>
                <div><b>{col.label}</b><span>{col.hint}</span></div>
                <span className="n">{list.length}</span>
              </header>
              <div className="ax-pb-cards">
                {list.length === 0 && <p className="ax-pb-none">ว่าง</p>}
                {list.map(c => {
                  const kit = kitOf(c.look);
                  const age = daysSince(c.updatedAt);
                  const fwd = FORWARD[c.status];
                  const at = c.productionStep ?? 0;
                  // on the line, the button walks the steps; after the last floor step it ships
                  // a job linked to the ERP moves with the ERP, so it has no step button
                  const nextStep = c.status === "in_production" && at < SHIP_STEP - 1 && !c.erpOrderNo ? at + 1 : 0;
                  return (
                    <article key={c.id} className="ax-pb-card" draggable={!!fwd} data-busy={busy === c.id || undefined}
                      onDragStart={() => setDragging(c)} onDragEnd={() => setDragging(null)}>
                      <button type="button" className="ax-pb-open" onClick={() => setOpen(c.id)} aria-label={`เปิด ${c.orderNo}`}>
                        <div className="pic">
                          {kit ? <KitThumb kit={kit} colors={jerseyLook(kit, c.look).colors} pattern={jerseyLook(kit, c.look).pattern} number={c.look?.number} />
                            : <span className="ax-mono" style={{ fontSize: 10 }}>DESIGN</span>}
                        </div>
                        <div className="meta">
                          <b className="ax-mono">{c.orderNo}</b>
                          <span>{c.user.fullName || c.user.email}</span>
                          <span className="sizes">{qtyOf(c)} ตัว · {sizeSplit(c.items).map(([s, n]) => `${s}${n}`).join(" ")}</span>
                          {c.status === "in_production" && at > 0 && (
                            <span className="step"><i style={{ width: `${(at / SHIP_STEP) * 100}%` }} />ขั้น {at}/{SHIP_STEP} · {STEPS[at - 1]?.th}</span>
                          )}
                          {c.erpOrderNo && <span className="erp" title={c.erpSyncedAt ? `ดึงล่าสุด ${new Date(c.erpSyncedAt).toLocaleString("th-TH")}` : undefined}>ERP {c.erpOrderNo}</span>}
                          {!!c.balance?.outstanding && <span className="owes">ค้างชำระ ฿{c.balance.outstanding.toLocaleString("th-TH")} · ส่งไม่ได้จนกว่าจะครบ</span>}
                        </div>
                      </button>
                      <footer>
                        <span className="age" data-late={age >= 7 || undefined}>{age === 0 ? "วันนี้" : `${age} วัน`}</span>
                        {nextStep > 0 ? (
                          <button type="button" className="ax-pb-next" disabled={!!busy} onClick={() => step(c, nextStep).catch(() => {})}>
                            {busy === c.id ? "…" : `${STEPS[nextStep - 1].th} →`}
                          </button>
                        ) : c.erpOrderNo && c.status === "in_production" && at < SHIP_STEP - 1 ? (
                          <span className="age">ตาม ERP</span>
                        ) : fwd && (
                          <button type="button" className="ax-pb-next" disabled={!!busy} onClick={() => move(c, fwd)}>
                            {busy === c.id ? "…" : `${FORWARD_TH[c.status]} →`}
                          </button>
                        )}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {open && token && <Drawer id={open} token={token} onClose={() => setOpen(null)} onMove={(c, to) => move(c, to)} onStep={step} onChanged={load} busy={busy} />}
      {ship && <ShipDialog card={ship} busy={busy === ship.id} onCancel={() => setShip(null)} onShip={(courier, trackingNo, note) => { const c = ship; setShip(null); move(c, "shipped", { courier, trackingNo, note }); }} />}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="ax ax-studio ax-pb">
      <header className="ax-sbar">
        <Link href="/admin" className="ax-sbrand" aria-label="กลับไปหน้าผู้ดูแลระบบ">
          <span>A</span><span>AXIOM / PRODUCTION</span>
        </Link>
        <div className="ax-sbar-right">
          <Link href="/admin">หน้าผู้ดูแลระบบ</Link>
          <span className="sep" aria-hidden="true" />
          <Link href="/shop">หน้าร้าน</Link>
        </div>
      </header>
      {children}
    </div>
  );
}

/** order detail: the shirt in 3D, sizes, roster, shipping, and the job sheet */
function Drawer({ id, token, onClose, onMove, onStep, onChanged, busy }: {
  id: string; token: string; onClose: () => void; onMove: (c: Card, to: Status) => void;
  onStep: (c: { id: string; orderNo: string }, to: number) => Promise<void>; onChanged: () => void; busy: string;
}) {
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState("");
  const fetchOne = useCallback(() => apiFetch<any>(`/admin/orders/${id}`, { token }).then(setO).catch(e => setErr(e.message)), [id, token]);
  useEffect(() => { setO(null); fetchOne(); }, [fetchOne]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const snap = o?.items?.[0]?.designSnapshot;
  const look: Look | null = snap && snap.kind === "kit-studio" ? snap : null;
  const kit = kitOf(look) ?? (look ? KITS[0] : null);
  const cfg = kit ? restoreConfig(kit, look ? { ...look } : null) : null;
  // the customer's own logo and font travel inside the order's design snapshot
  const assets = useKitAssets({ ...(cfg ?? {}), assets: snap?.assets });
  const base = kit ? jerseyLook(kit, look) : null;
  const jl = base ? { ...base, logo: assets.logo, logoTint: assets.logoTint, fontFamily: assets.fontFamily } : null;
  const files: { label: string; name: string; href: string; image: boolean }[] = [];
  const lf = snap?.assets?.logo, ff = snap?.assets?.font;
  if (lf?.url || lf?.data) files.push({ label: "โลโก้ของลูกค้า", name: lf.name || "logo.png", href: assetHref(lf.url || lf.data), image: true });
  if (ff?.url || ff?.data) files.push({ label: "ฟอนต์ชื่อ-เบอร์", name: ff.name || "font", href: assetHref(ff.url || ff.data), image: false });
  const roster: any[] = o ? o.items.flatMap((i: any) => i.roster ?? []) : [];
  const split = o ? sizeSplit(o.items) : [];
  const fwd: Status | undefined = o ? FORWARD[o.status as Status] : undefined;
  const a = o?.shippingAddress;

  return (
    <div className="ax-pb-shade" onClick={onClose}>
      <aside className="ax-pb-drawer" role="dialog" aria-modal="true" aria-label={o ? `ออเดอร์ ${o.orderNo}` : "ออเดอร์"} onClick={e => e.stopPropagation()}>
        <div className="ax-pb-dhead">
          <div>
            <span className="ax-label" style={{ margin: 0 }}>{o ? STATUS_TH[o.status] : "กำลังโหลด"}</span>
            <h2 className="ax-mono">{o?.orderNo ?? "…"}</h2>
          </div>
          <button type="button" className="ax-icon" onClick={onClose} aria-label="ปิด">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {err && <p className="ax-err">{err}</p>}
        {o && (
          <>
            <div className="ax-pb-3d">
              {kit && jl ? <JerseyStage kit={kit} look={jl} /> : (
                o.items[0]?.designId
                  ? <p className="ax-psub" style={{ margin: "auto" }}>แบบจากโปรแกรมออกแบบขั้นสูง · <Link className="dlink" href={`/orders/${o.id}`} target="_blank">ดูภาพตัวอย่าง</Link></p>
                  : <p className="ax-psub" style={{ margin: "auto" }}>ออเดอร์นี้ไม่มีแบบเสื้อแนบมา</p>
              )}
            </div>
            <div className="ax-pb-facts">
              <div><span>เสื้อ</span><b>{kit ? `${kit.name} · ${kit.code}` : "-"}</b></div>
              <div><span>สเปก</span><b>{o.fabricSummary ?? "-"}</b></div>
              <div><span>ลูกค้า</span><b>{o.user?.fullName || o.user?.email}</b></div>
              <div><span>ยอดรวม</span><b>{baht(o.total)}</b></div>
            </div>
            <div>
              <span className="ax-label">ไซซ์ · รวม {qtyOf(o)} ตัว</span>
              <div className="ax-pb-sizes">
                {split.map(([s, n]) => <div key={s}><b>{n}</b><span>{s}</span></div>)}
              </div>
            </div>
            {roster.length > 0 && (
              <div>
                <span className="ax-label">รายชื่อ-เบอร์ ({roster.length})</span>
                <table className="ax-pb-table">
                  <thead><tr><th>#</th><th>ชื่อหลังเสื้อ</th><th>เบอร์</th><th>ไซซ์</th></tr></thead>
                  <tbody>
                    {roster.map((r, i) => <tr key={r.id ?? i}><td>{i + 1}</td><td>{r.playerName || "-"}</td><td>{r.number || "-"}</td><td>{r.size || "-"}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
            {files.length > 0 && (
              <div>
                <span className="ax-label">ไฟล์งานของลูกค้า</span>
                <div className="ax-pb-files">
                  {files.map(f => (
                    <a key={f.label} className="ax-sq" href={f.href} download={f.name} target="_blank" rel="noreferrer">
                      {f.image && <img src={f.href} alt="" />}
                      <span><b>{f.label}</b><small>{f.name}</small></span>
                    </a>
                  ))}
                </div>
                {look?.logoTint && <p className="ax-psub" style={{ margin: "6px 0 0", fontSize: 13 }}>พิมพ์โลโก้สีเดียว (สีเดียวกับเบอร์)</p>}
              </div>
            )}
            {!["cancelled", "refunded"].includes(o.status) && (
              <ErpPanel o={o} token={token} onChanged={() => { fetchOne(); onChanged(); }} />
            )}
            {["paid", "approved", "in_production"].includes(o.status) && (
              <div>
                <span className="ax-label">ขั้นตอนผลิต · ลูกค้าเห็นในหน้าออเดอร์{o.erp?.orderNo ? " · ตั้งเองได้ แต่รอบถัดไปจะกลับไปตาม ERP" : ""}</span>
                <div className="ax-pb-steps" role="group" aria-label="ตั้งขั้นตอนผลิต">
                  {STEPS.map((s, i) => {
                    const n = i + 1, at = o.productionStep ?? 0;
                    const ship = n === SHIP_STEP;
                    return (
                      <button key={s.en} type="button" disabled={!!busy || ship || n === at}
                        data-state={n < at ? "done" : n === at ? "now" : undefined} aria-pressed={n === at}
                        title={ship ? "ตั้งอัตโนมัติเมื่อบันทึกการจัดส่ง" : `ตั้งเป็นขั้น ${n}`}
                        onClick={() => onStep(o, n).then(fetchOne).catch(() => {})}>
                        <b>{n}</b><span>{s.th}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {o.note && <div><span className="ax-label">หมายเหตุจากลูกค้า</span><p style={{ margin: 0, fontSize: 14 }}>{o.note}</p></div>}
            {a && (
              <div>
                <span className="ax-label">ส่งถึง</span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>{a.recipient} · {a.phone}<br />{[a.line1, a.line2, a.district, a.province, a.postalCode].filter(Boolean).join(" ")}</p>
              </div>
            )}
            {o.shipments?.length > 0 && (
              <div><span className="ax-label">พัสดุ</span><p style={{ margin: 0, fontSize: 14 }}>{o.shipments.map((s: any) => `${s.courier ?? "-"} · ${s.trackingNo ?? "-"}`).join(" / ")}</p></div>
            )}
            <div className="ax-pb-dactions">
              {fwd && <button type="button" className="ax-btn solid sq" disabled={!!busy} onClick={() => { onMove(o, fwd); onClose(); }}>{FORWARD_TH[o.status as Status]} →</button>}
              <button type="button" className="ax-sq" onClick={() => window.print()}>พิมพ์ใบสั่งผลิต</button>
              <Link className="ax-sq" href={`/orders/${o.id}`} target="_blank">หน้าออเดอร์</Link>
            </div>
            <JobSheet o={o} kit={kit} look={jl} split={split} roster={roster} />
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * The same job in the factory ERP: link it by the ERP's order number once, and
 * the step (and the dates the customer sees) follow the ERP from then on.
 */
function ErpPanel({ o, token, onChanged }: { o: any; token: string; onChanged: () => void }) {
  const linked: string | null = o.erp?.orderNo ?? null;
  const [no, setNo] = useState(linked ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setNo(linked ?? ""); }, [linked]);

  async function call(path: string, init: RequestInit) {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch<{ ok?: boolean; message: string }>(path, { ...init, token });
      setMsg({ ok: r.ok !== false, text: r.message });
      onChanged();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }
  const link = (v: string) => call(`/admin/orders/${o.id}/erp`, { method: "PUT", body: JSON.stringify({ erpOrderNo: v }) });
  const steps: any[] = o.erp?.steps ?? [];
  const day = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "–");

  return (
    <div className="ax-pb-erp">
      <span className="ax-label">ERP · เลขออเดอร์ในระบบโรงงาน</span>
      <form className="row" onSubmit={e => { e.preventDefault(); if (no.trim() && no.trim() !== linked) link(no); }}>
        <input className="ax-field" value={no} onChange={e => setNo(e.target.value)} placeholder="เช่น HJ-447" aria-label="เลขออเดอร์ ERP" maxLength={60} />
        {no.trim() && no.trim() !== linked ? (
          <button type="submit" className="ax-btn solid sq" disabled={busy}>{busy ? "…" : linked ? "เปลี่ยน" : "ผูก"}</button>
        ) : linked ? (
          <>
            <button type="button" className="ax-sq" disabled={busy} onClick={() => call(`/admin/orders/${o.id}/erp/sync`, { method: "POST" })}>{busy ? "…" : "ดึงตอนนี้"}</button>
            <button type="button" className="ax-sq" disabled={busy} onClick={() => { setNo(""); link(""); }}>เลิกผูก</button>
          </>
        ) : null}
      </form>
      {msg && <p className={msg.ok ? "ax-psub" : "ax-err"} style={{ margin: "6px 0 0", fontSize: 13 }}>{msg.text}</p>}
      {linked && o.erp?.syncedAt && (
        <p className="ax-psub" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          ดึงล่าสุด {new Date(o.erp.syncedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
          {o.erp.statusLabel ? ` · ERP: ${o.erp.statusLabel}` : ""}
          {o.erp.dueDate ? ` · กำหนดเสร็จ ${day(o.erp.dueDate)}` : ""}
        </p>
      )}
      {linked && steps.length > 0 && (
        <table className="ax-pb-table" style={{ marginTop: 8 }}>
          <thead><tr><th>#</th><th>ขั้นใน ERP</th><th>สถานะ</th><th>เริ่ม</th><th>เสร็จ</th></tr></thead>
          <tbody>
            {steps.map(s => (
              <tr key={s.no} data-state={s.finishedOn ? "done" : s.startedOn ? "now" : undefined}>
                <td>{s.no}</td><td>{s.name}</td><td>{s.label || s.status}</td><td>{day(s.startedOn)}</td><td>{day(s.finishedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!linked && <p className="ax-psub" style={{ margin: "6px 0 0", fontSize: 12.5 }}>ผูกแล้วขั้นตอนผลิตที่ลูกค้าเห็นจะอัปเดตตาม ERP อัตโนมัติ</p>}
    </div>
  );
}

/** the paper the factory floor gets — only visible when printing */
function JobSheet({ o, kit, look, split, roster }: { o: any; kit: Kit | null; look: ReturnType<typeof jerseyLook> | null; split: [string, number][]; roster: any[] }) {
  return (
    <div className="ax-pb-print" aria-hidden="true">
      <div className="h">
        <div><b>AXIOM SIAM · ใบสั่งผลิต</b><span>{o.orderNo}</span></div>
        <div style={{ textAlign: "right" }}><span>สั่งเมื่อ {new Date(o.createdAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}</span><span>{STATUS_TH[o.status]}</span></div>
      </div>
      <div className="g">
        <div className="pic">{kit && look ? <KitThumb kit={kit} colors={look.colors} pattern={look.pattern} number={look.number} /> : null}</div>
        <div>
          <p><b>เสื้อ</b> {kit ? `${kit.name} (${kit.code})` : "แบบอัปโหลด / ดีไซเนอร์"}</p>
          <p><b>สเปก</b> {o.fabricSummary}</p>
          {look && <p><b>สี</b> {Object.entries(look.colors).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          {look && <p><b>ลาย</b> {look.pattern} · <b>ฟอนต์</b> {o.items?.[0]?.designSnapshot?.assets?.font?.name ?? look.font} · <b>โลโก้</b> {o.items?.[0]?.designSnapshot?.assets?.logo?.name ?? (o.items?.[0]?.designSnapshot?.logo === "none" ? "ไม่มี" : "AXIOM")}</p>}
          <table><tbody><tr>{split.map(([s]) => <th key={s}>{s}</th>)}<th>รวม</th></tr><tr>{split.map(([s, n]) => <td key={s}>{n}</td>)}<td>{split.reduce((t, [, n]) => t + n, 0)}</td></tr></tbody></table>
        </div>
      </div>
      {roster.length > 0 && (
        <table className="r">
          <thead><tr><th>#</th><th>ชื่อหลังเสื้อ</th><th>เบอร์</th><th>ไซซ์</th><th>✓</th></tr></thead>
          <tbody>{roster.map((r, i) => <tr key={i}><td>{i + 1}</td><td>{r.playerName}</td><td>{r.number}</td><td>{r.size}</td><td /></tr>)}</tbody>
        </table>
      )}
      {o.note && <p><b>หมายเหตุ</b> {o.note}</p>}
    </div>
  );
}

function ShipDialog({ card, busy, onCancel, onShip }: { card: Card; busy: boolean; onCancel: () => void; onShip: (courier: string, trackingNo: string, note?: string) => void }) {
  const [courier, setCourier] = useState(COURIERS[0]);
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="ax-pb-shade" onClick={onCancel}>
      <form className="ax-pb-dialog" role="dialog" aria-modal="true" aria-label={`จัดส่ง ${card.orderNo}`} onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (tracking.trim()) onShip(courier, tracking.trim(), note.trim() || undefined); }}>
        <h2>จัดส่ง {card.orderNo}</h2>
        <label><span className="ax-label">ขนส่ง</span>
          <select className="ax-field" value={courier} onChange={e => setCourier(e.target.value)}>{COURIERS.map(c => <option key={c}>{c}</option>)}</select>
        </label>
        <label><span className="ax-label">เลขพัสดุ</span>
          <input className="ax-field" autoFocus required value={tracking} onChange={e => setTracking(e.target.value)} placeholder="เช่น TH0123456789" />
        </label>
        <label><span className="ax-label">หมายเหตุ (ถ้ามี)</span>
          <input className="ax-field" value={note} onChange={e => setNote(e.target.value)} />
        </label>
        <div className="ax-ck-nav">
          <button type="button" className="ax-sq" onClick={onCancel}>ยกเลิก</button>
          <button type="submit" className="ax-btn solid sq" disabled={busy || !tracking.trim()}>บันทึกการจัดส่ง</button>
        </div>
      </form>
    </div>
  );
}
