"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch } from "../../../../lib/api";

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const d = (s: string) => new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

/** Printable invoice / ใบแจ้งหนี้ — Ctrl+P gives a clean A4 page. */
export default function InvoicePage() {
  const id = String(useParams().id);
  const { token, loading } = useAuth();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<any>(`/orders/${id}`, { token }).then(setO).catch(e => setErr(e.message));
  }, [id, token]);

  if (loading || (!o && !err)) return <p style={{ padding: 40, fontFamily: "sans-serif" }}>กำลังโหลด…</p>;
  if (err) return <p style={{ padding: 40, fontFamily: "sans-serif", color: "#c2410c" }}>{err}</p>;

  const inv = o.invoices?.[0];
  const a = o.shippingAddress;
  const vatRate = 0.07;
  const beforeVat = Math.round((o.total / (1 + vatRate)) * 100) / 100;
  const vat = Math.round((o.total - beforeVat) * 100) / 100;

  return (
    <div className="inv">
      <style>{`
        .inv{max-width:800px;margin:0 auto;padding:44px 40px;background:#fff;color:#111;font-family:"Noto Sans Thai",sans-serif;font-size:13.5px;line-height:1.65}
        .inv h1{font-family:Anton,"Noto Sans Thai",sans-serif;font-weight:400;font-size:32px;margin:0 0 2px;letter-spacing:2px}
        .inv table{width:100%;border-collapse:collapse;margin-top:18px}
        .inv th{text-align:left;background:#f2f0eb;padding:9px 11px;font-size:12px;border-bottom:2px solid #cbd5e1}
        .inv td{padding:9px 11px;border-bottom:1px solid #e2e8f0}
        .inv .r{text-align:right}
        .inv .muted{color:#64748b;font-size:12px}
        .inv .tot{display:flex;justify-content:space-between;padding:4px 0}
        .noprint{margin:22px auto;max-width:800px;text-align:right}
        @media print{.noprint{display:none}.inv{padding:0}@page{margin:16mm}}
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #f26522", paddingBottom: 16 }}>
        <div>
          <h1>AXIOM SIAM</h1>
          <div className="muted">Axiom Siam Co.,Ltd.<br />ผู้ผลิตชุดกีฬา OEM/ODM</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#f26522" }}>ใบแจ้งหนี้ / INVOICE</div>
          <div className="muted">
            เลขที่: <b>{inv?.invoiceNo ?? "(ยังไม่ออกใบแจ้งหนี้)"}</b><br />
            วันที่: {d(inv?.issuedAt ?? o.createdAt)}<br />
            อ้างอิงออเดอร์: {o.orderNo}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 22 }}>
        <div style={{ flex: 1 }}>
          <div className="muted">ลูกค้า</div>
          <b>{o.user?.fullName || o.user?.email}</b>
          {a && <div className="muted">{a.recipient} · {a.phone}<br />{a.line1} {a.line2}<br />{a.district} {a.province} {a.postalCode}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <div className="muted">สเปกงาน</div>
          {o.fabricSummary}
        </div>
      </div>

      <table>
        <thead><tr><th>รายการ</th><th>ไซส์</th><th className="r">จำนวน</th><th className="r">ราคา/ตัว</th><th className="r">รวม</th></tr></thead>
        <tbody>
          {o.items.map((it: any) => (
            <tr key={it.id}>
              <td>เสื้อกีฬาสั่งผลิต</td><td>{it.size}</td>
              <td className="r">{it.qty}</td><td className="r">{baht(it.unitPrice)}</td>
              <td className="r">{baht(it.unitPrice * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: 300, marginTop: 18 }}>
        <div className="tot"><span className="muted">ราคาสินค้า</span><span>{baht(o.subtotal)}</span></div>
        {o.discount > 0 && <div className="tot"><span className="muted">ส่วนลด</span><span>-{baht(o.discount)}</span></div>}
        <div className="tot"><span className="muted">ค่าจัดส่ง</span><span>{o.shippingFee === 0 ? "ฟรี" : baht(o.shippingFee)}</span></div>
        <div className="tot muted" style={{ borderTop: "1px solid #e2e8f0", marginTop: 6, paddingTop: 6 }}>
          <span>มูลค่าก่อน VAT</span><span>{baht(beforeVat)}</span>
        </div>
        <div className="tot muted"><span>VAT 7%</span><span>{baht(vat)}</span></div>
        <div className="tot" style={{ borderTop: "2px solid #f26522", marginTop: 6, paddingTop: 8, fontSize: 17, fontWeight: 800 }}>
          <span>ยอดชำระ</span><span style={{ color: "#f26522" }}>{baht(o.total)}</span>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 34, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
        ราคารวมภาษีมูลค่าเพิ่มแล้ว · ชำระเต็มจำนวนก่อนเริ่มผลิต · เอกสารนี้ออกโดยระบบอัตโนมัติ
        {o.note && <><br />หมายเหตุ: {o.note}</>}
      </p>

      <div className="noprint">
        <button onClick={() => window.print()} style={{ padding: "10px 22px", borderRadius: 30, border: "1.5px solid #f26522", background: "#f26522", color: "#0d0e10", fontWeight: 700, cursor: "pointer" }}>
          🖨 พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>
    </div>
  );
}
