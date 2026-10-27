"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import PayPanel from "../../../components/PayPanel";
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
        </div>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
      </div>

      {/* pay by transfer — the panel owns the QR, the account and the slip upload */}
      {o.status === "pending" && token && (
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

