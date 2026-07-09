"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");
const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน", paid: "ชำระแล้ว", approved: "อนุมัติแบบแล้ว", in_production: "กำลังผลิต",
  shipped: "จัดส่งแล้ว", delivered: "ได้รับแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", refunded: "คืนเงินแล้ว",
};
const FLOW = ["pending", "paid", "approved", "in_production", "shipped", "delivered", "completed"];

function OrderDetailInner() {
  const id = String(useParams().id);
  const { token, loading } = useAuth();
  const sp = useSearchParams();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [payEnabled, setPayEnabled] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(sp.get("paid") === "1");

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<any>(`/orders/${id}`, { token }).then(setO).catch(e => setErr(e.message));
  }, [id, token]);
  useEffect(load, [load]);

  // hide the pay button entirely when Stripe isn't configured
  useEffect(() => {
    apiFetch<{ enabled: boolean }>("/payments/status").then(s => setPayEnabled(s.enabled)).catch(() => {});
  }, []);

  // Back from Stripe. The webhook fulfils the order, and it may land a moment
  // after the browser returns — so poll briefly rather than lie to the user.
  useEffect(() => {
    if (!awaitingPayment || !token) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        const s = await apiFetch<{ orderStatus: string }>(`/payments/orders/${id}/state`, { token });
        if (s.orderStatus !== "pending") { setAwaitingPayment(false); load(); clearInterval(t); return; }
      } catch { /* keep polling */ }
      if (tries >= 15) { setAwaitingPayment(false); clearInterval(t); } // ~30s
    }, 2000);
    return () => clearInterval(t);
  }, [awaitingPayment, token, id, load]);

  async function pay() {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch<{ url: string }>(`/payments/orders/${id}/checkout`, { method: "POST", token });
      window.location.href = r.url; // Stripe-hosted page
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

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

        {awaitingPayment && (
          <div style={{ background: "#dbeafe", border: "1px solid #93c5fd", color: "#1e40af", borderRadius: 10, padding: "10px 13px", marginTop: 16, fontSize: 13.5 }}>
            ⏳ กำลังยืนยันการชำระเงินกับธนาคาร… หน้านี้จะอัปเดตเองภายในไม่กี่วินาที
          </div>
        )}
        {sp.get("canceled") === "1" && o.status === "pending" && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", borderRadius: 10, padding: "10px 13px", marginTop: 16, fontSize: 13.5 }}>
            ยกเลิกการชำระเงิน — ออเดอร์ยังอยู่ กดชำระใหม่ได้ทุกเมื่อ
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          {o.status === "pending" && (
            <>
              {payEnabled ? (
                <button className="abtn solid" onClick={pay} disabled={busy || awaitingPayment}>
                  {busy ? "กำลังเปิดหน้าชำระเงิน…" : `💳 ชำระเงิน ${baht(o.total)}`}
                </button>
              ) : (
                <button className="abtn solid" disabled title="ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY">💳 ชำระเงิน (ยังไม่เปิดใช้)</button>
              )}
              <button className="minibtn danger" onClick={cancel} disabled={busy || awaitingPayment}>ยกเลิกออเดอร์</button>
            </>
          )}
          {o.invoices?.length > 0 && (
            <Link className="minibtn" href={`/orders/${o.id}/invoice`} target="_blank">🧾 ใบแจ้งหนี้ {o.invoices[0].invoiceNo}</Link>
          )}
        </div>
        {err && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
      </div>

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
                  <span className="tag">{STATUS_TH[h.status]}</span>
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

/** useSearchParams (?paid=1 / ?canceled=1) needs a Suspense boundary */
export default function OrderDetail() {
  return (
    <Suspense fallback={<AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>}>
      <OrderDetailInner />
    </Suspense>
  );
}
