"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import PayPanel from "../../../components/PayPanel";
import ProductionTracker from "../../../components/ProductionTracker";
import { STEPS } from "../../../lib/production-steps";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");
const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน", paid: "ชำระแล้ว", approved: "อนุมัติแบบแล้ว", in_production: "กำลังผลิต",
  shipped: "จัดส่งแล้ว", delivered: "ได้รับแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", refunded: "คืนเงินแล้ว",
};
const FLOW = ["pending", "paid", "approved", "in_production", "shipped", "delivered", "completed"];

export default function OrderDetail() {
  const id = String(useParams().id);
  const { token, loading } = useAuth();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [payEnabled, setPayEnabled] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<any>(`/orders/${id}`, { token }).then(setO).catch(e => setErr(e.message));
  }, [id, token]);
  useEffect(load, [load]);

  // hide the pay panel entirely until an admin has configured a bank account
  useEffect(() => {
    apiFetch<{ enabled: boolean }>("/payments/status").then(s => setPayEnabled(s.enabled)).catch(() => {});
  }, []);

  async function cancel() {
    if (!confirm("ยกเลิกออเดอร์นี้?")) return;
    setBusy(true);
    try { await apiFetch(`/orders/${id}/cancel`, { method: "POST", token }); load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (loading || (!o && !err)) return <AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>;
  if (err && !o) return <AppShell narrow><div className="acard"><h1 className="atitle">ไม่พบออเดอร์</h1><p className="asub">{err}</p><Link className="abtn ghost" href="/account">กลับไปบัญชี</Link></div></AppShell>;

  const cancelled = o.status === "cancelled" || o.status === "refunded";
  const stepIdx = FLOW.indexOf(o.status);
  const a = o.shippingAddress;

  return (
    <AppShell wide>
      <Link href="/account" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>← กลับไปบัญชีของฉัน</Link>

      <div className="acard">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow">ออเดอร์</div>
            <h1 className="atitle" style={{ marginBottom: 2 }}>{o.orderNo}</h1>
            <p className="asub">สั่งเมื่อ {dt(o.createdAt)} · {o.fabricSummary}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="kpivalue" style={{ color: "var(--brand)" }}>{baht(o.total)}</div>
            {o.balance && o.balance.paid > 0 && (
              <div className="dim" style={{ margin: "2px 0 6px" }}>
                ชำระแล้ว {baht(o.balance.paid)}{o.balance.outstanding > 0 ? ` · ค้าง ${baht(o.balance.outstanding)}` : " · ครบแล้ว"}
                {o.balance.refunded > 0 && ` · คืนเงินแล้ว ${baht(o.balance.refunded)}`}
              </div>
            )}
            <span className={`tag ${cancelled ? "red" : o.status === "completed" ? "green" : "blue"}`}>{STATUS_TH[o.status]}</span>
          </div>
        </div>

        {/* progress */}
        {!cancelled && (
          <div style={{ display: "flex", gap: 4, marginTop: 20, flexWrap: "wrap" }}>
            {FLOW.map((s, i) => (
              <div key={s} style={{ flex: "1 1 90px", minWidth: 90 }}>
                <div style={{ height: 5, borderRadius: 4, background: i <= stepIdx ? "var(--brand)" : "var(--border)" }} />
                <div className="dim" style={{ marginTop: 6, fontWeight: i === stepIdx ? 700 : 400, color: i === stepIdx ? "var(--brand)" : undefined }}>
                  {STATUS_TH[s]}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          {o.status === "pending" && (
            <button className="minibtn danger" onClick={cancel} disabled={busy}>ยกเลิกออเดอร์</button>
          )}
          {o.invoices?.length > 0 && (
            <Link className="minibtn" href={`/orders/${o.id}/invoice`} target="_blank">🧾 ใบแจ้งหนี้ {o.invoices[0].invoiceNo}</Link>
          )}
          {o.creditNotes?.map((c: any) => (
            <Link key={c.id} className="minibtn" href={`/orders/${o.id}/credit-note/${c.id}`} target="_blank">↩ ใบลดหนี้ {c.creditNo} · {baht(c.amount)}</Link>
          ))}
        </div>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
      </div>

      <ProductionTracker orderNo={o.orderNo} status={o.status} productionStep={o.productionStep} history={o.statusHistory} erp={o.erp} />

      {/* pay by transfer — the panel owns the QR, the account and the slip upload */}
      {(o.balance ? o.balance.due > 0 : o.status === "pending") && token && (
        payEnabled
          ? <PayPanel orderId={id} token={token} onPaid={load} />
          : (
            <div className="acard">
              <div className="eyebrow">ชำระเงิน</div>
              <h2 className="ah2" style={{ marginTop: 4 }}>ยังไม่เปิดรับชำระเงิน</h2>
              <p className="asub">ผู้ดูแลระบบยังไม่ได้ตั้งค่าบัญชีรับเงิน — กรุณาติดต่อทีมงานเพื่อชำระเงิน</p>
            </div>
          )
      )}

      {o.status !== "cancelled" && token && <TaxInvoiceCard o={o} token={token} onSaved={load} />}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <div>
          <div className="acard">
            <h2 className="ah2">รายการ</h2>
            <div className="tablewrap">
              <table className="atable" style={{ minWidth: 380 }}>
                <thead><tr><th>ไซส์</th><th>จำนวน</th><th>ราคา/ตัว</th><th>รวม</th></tr></thead>
                <tbody>
                  {o.items.map((it: any) => (
                    <tr key={it.id}><td><b>{it.size}</b></td><td>{it.qty}</td><td>{baht(it.unitPrice)}</td><td>{baht(it.unitPrice * it.qty)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {o.items.some((i: any) => i.roster?.length) && (
              <>
                <h2 className="ah2" style={{ marginTop: 20 }}>รายชื่อนักกีฬา</h2>
                <div className="tablewrap">
                  <table className="atable" style={{ minWidth: 380 }}>
                    <thead><tr><th>ชื่อ</th><th>เบอร์</th><th>ไซส์</th></tr></thead>
                    <tbody>
                      {o.items.flatMap((it: any) => it.roster.map((r: any) => (
                        <tr key={r.id}><td>{r.playerName || "-"}</td><td>{r.number || "-"}</td><td>{r.size}</td></tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {o.note && <><h2 className="ah2" style={{ marginTop: 20 }}>หมายเหตุ</h2><p className="asub">{o.note}</p></>}
          </div>

          <div className="acard">
            <h2 className="ah2">ประวัติสถานะ</h2>
            <div style={{ marginTop: 10 }}>
              {o.statusHistory.map((h: any) => (
                <div key={h.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="tag">{h.step ? `ขั้น ${h.step} · ${STEPS[h.step - 1]?.th ?? ""}` : STATUS_TH[h.status]}</span>
                  <div style={{ flex: 1 }}>
                    <div className="dim">{dt(h.createdAt)}</div>
                    {h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="acard">
            <h2 className="ah2">สรุปยอด</h2>
            <Row k="ราคาสินค้า" v={baht(o.subtotal)} />
            {o.discount > 0 && <Row k="ส่วนลด" v={"-" + baht(o.discount)} />}
            <Row k="ค่าจัดส่ง" v={o.shippingFee === 0 ? "ฟรี" : baht(o.shippingFee)} />
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b>ยอดรวม</b><b style={{ fontSize: 22, color: "var(--brand)" }}>{baht(o.total)}</b>
            </div>
          </div>

          {o.shipments?.length > 0 && (
            <div className="acard">
              <h2 className="ah2">การจัดส่ง</h2>
              {o.shipments.map((s: any) => (
                <div key={s.id} style={{ fontSize: 13.5, lineHeight: 1.8, marginTop: 8 }}>
                  <div>ขนส่ง: <b>{s.courier || "-"}</b></div>
                  <div>เลขพัสดุ: <b style={{ color: "var(--brand)", userSelect: "all" }}>{s.trackingNo || "-"}</b></div>
                  {s.shippedAt && <div className="dim">ส่งเมื่อ {dt(s.shippedAt)}</div>}
                  {s.deliveredAt && <div className="dim">ถึงมือผู้รับ {dt(s.deliveredAt)}</div>}
                </div>
              ))}
            </div>
          )}

          {a && (
            <div className="acard">
              <h2 className="ah2">จัดส่งถึง</h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, marginTop: 8 }}>
                <b>{a.recipient}</b> · {a.phone}<br />
                {a.line1} {a.line2}<br />{a.district} {a.province} {a.postalCode}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0" }}>
      <span className="dim" style={{ fontSize: 13 }}>{k}</span><span>{v}</span>
    </div>
  );
}


/** a Thai tax id's check digit, so a typo is caught before it reaches the invoice */
function validTaxId(raw: string) {
  const id = raw.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/**
 * The customer's details for a full tax invoice (ใบกำกับภาษีเต็มรูป). Before the
 * invoice is issued they can be changed; once a tax invoice carries them, not.
 */
function TaxInvoiceCard({ o, token, onSaved }: { o: any; token: string; onSaved: () => void }) {
  const issued = o.invoices?.[0];
  const locked = Boolean(issued?.buyerTaxId);
  const t = o.taxInfo;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: t?.name ?? "", taxId: t?.taxId ?? "", hq: (t?.branch ?? "00000") === "00000", branch: t?.branch && t.branch !== "00000" ? t.branch : "", address: t?.address ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const idOk = validTaxId(f.taxId);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch<any>(`/orders/${o.id}/tax-invoice`, {
        method: "PUT", token,
        body: JSON.stringify({ name: f.name, taxId: f.taxId, branch: f.hq ? "00000" : f.branch.padStart(5, "0"), address: f.address }),
      });
      setMsg({ ok: true, text: r.message }); setOpen(false); onSaved();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  const branchText = (b: string) => (!b || b === "00000" ? "สำนักงานใหญ่" : `สาขาที่ ${b}`);
  return (
    <div className="acard">
      <div className="eyebrow">ใบกำกับภาษี</div>
      {t && !open ? (
        <>
          <h2 className="ah2" style={{ marginTop: 4 }}>{locked ? "ออกใบกำกับภาษีแล้ว" : "จะออกใบกำกับภาษีในนามนี้"}</h2>
          <p className="asub" style={{ lineHeight: 1.7 }}>
            <b>{t.name}</b> · เลขประจำตัวผู้เสียภาษี {t.taxId} · {branchText(t.branch)}<br />{t.address}
          </p>
          {locked
            ? <p className="dim">แก้ไขไม่ได้แล้ว หากข้อมูลผิด กรุณาติดต่อทีมงาน</p>
            : <button className="minibtn" onClick={() => setOpen(true)}>แก้ไขข้อมูล</button>}
        </>
      ) : !open ? (
        <>
          <h2 className="ah2" style={{ marginTop: 4 }}>ต้องการใบกำกับภาษีเต็มรูป?</h2>
          <p className="asub">สำหรับบริษัท / ร้านค้า / ผู้ที่ต้องใช้ใบกำกับภาษี กรอกข้อมูลตามทะเบียนก่อนหรือหลังชำระเงินก็ได้</p>
          <button className="minibtn" onClick={() => setOpen(true)}>🧾 ขอใบกำกับภาษี</button>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 8, maxWidth: 560 }}>
          <label><span className="dim">ชื่อบริษัท / ชื่อผู้ซื้อ (ตามทะเบียน)</span>
            <input className="ainput" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label><span className="dim">เลขประจำตัวผู้เสียภาษี 13 หลัก</span>
            <input className="ainput" inputMode="numeric" value={f.taxId} onChange={e => setF({ ...f, taxId: e.target.value.replace(/[^\d-]/g, "") })} />
            {f.taxId && !idOk && <span style={{ color: "var(--err, #dc2626)", fontSize: 12 }}>เลขไม่ถูกต้อง ตรวจสอบอีกครั้ง</span>}</label>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={f.hq} onChange={() => setF({ ...f, hq: true })} /> สำนักงานใหญ่</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={!f.hq} onChange={() => setF({ ...f, hq: false })} /> สาขาที่</label>
            {!f.hq && <input className="ainput" style={{ width: 110 }} inputMode="numeric" placeholder="00001" maxLength={5} value={f.branch} onChange={e => setF({ ...f, branch: e.target.value.replace(/\D/g, "") })} />}
          </div>
          <label><span className="dim">ที่อยู่ตามทะเบียน</span>
            <textarea className="ainput" rows={3} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="abtn solid" disabled={busy || !idOk || f.name.trim().length < 2 || f.address.trim().length < 10 || (!f.hq && !f.branch)} onClick={save}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button className="minibtn" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</button>
          </div>
          <p className="dim">หลังออกใบกำกับภาษีแล้วจะแก้ไขข้อมูลไม่ได้ กรุณาตรวจสอบให้ถูกต้อง</p>
        </div>
      )}
      {msg && <p style={{ marginTop: 10, fontSize: 13, color: msg.ok ? "var(--ok, #16a34a)" : "var(--err, #dc2626)" }}>{msg.ok ? "✓ " : "⚠ "}{msg.text}</p>}
    </div>
  );
}
