"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../../../../lib/auth-context";
import { apiFetch } from "../../../../../lib/api";

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (s: string) => new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
const branchText = (b?: string | null) => (!b || b === "00000" ? "สำนักงานใหญ่" : `สาขาที่ ${b}`);
/** VAT-inclusive amount → [before VAT, VAT 7%] */
const split = (n: number) => { const before = Math.round((n / 1.07) * 100) / 100; return [before, Math.round((n - before) * 100) / 100] as const; };

/**
 * Printable credit note / ใบลดหนี้ — what an issued invoice was worth, what it
 * is worth now, the difference and its VAT, and why. Ctrl+P gives an A4 page.
 */
export default function CreditNotePage() {
  const p = useParams();
  const id = String(p.id), cnId = String(p.cn);
  const { token, loading } = useAuth();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<any>(`/orders/${id}`, { token }).then(setO).catch(e => setErr(e.message));
  }, [id, token]);

  if (loading || (!o && !err)) return <p style={{ padding: 40, fontFamily: "sans-serif" }}>กำลังโหลด…</p>;
  const cn = o?.creditNotes?.find((c: any) => c.id === cnId);
  if (err || !cn) return <p style={{ padding: 40, fontFamily: "sans-serif", color: "#c2410c" }}>{err || "ไม่พบใบลดหนี้"}</p>;

  const inv = o.invoices?.find((i: any) => i.id === cn.invoiceId) ?? o.invoices?.[0];
  const seller = o.seller;
  const isTax = Boolean(seller && cn.buyerTaxId);
  // earlier credit notes on the same invoice already lowered its value
  const before = (o.creditNotes as any[]).filter(c => c.invoiceId === cn.invoiceId && c.creditNo < cn.creditNo).reduce((n, c) => n + c.amount, 0);
  const original = (inv?.amount ?? 0) - before;
  const correct = original - cn.amount;
  const [diffBefore, diffVat] = split(cn.amount);

  return (
    <div className="inv">
      <style>{`
        .inv{max-width:800px;margin:0 auto;padding:44px 40px;background:#fff;color:#111;font-family:"Noto Sans Thai",sans-serif;font-size:13.5px;line-height:1.65}
        .inv h1{font-family:Anton,"Noto Sans Thai",sans-serif;font-weight:400;font-size:32px;margin:0 0 2px;letter-spacing:2px}
        .inv table{width:100%;border-collapse:collapse;margin-top:20px}
        .inv th{text-align:left;background:#f2f0eb;padding:9px 11px;font-size:12px;border-bottom:2px solid #cbd5e1}
        .inv td{padding:9px 11px;border-bottom:1px solid #e2e8f0}
        .inv .r{text-align:right}
        .inv .muted{color:#64748b;font-size:12px}
        .inv .tot{display:flex;justify-content:space-between;padding:4px 0}
        .inv .sign{display:flex;gap:40px;margin-top:56px}
        .inv .sign div{flex:1;text-align:center;border-top:1px solid #94a3b8;padding-top:6px;font-size:12px;color:#64748b}
        .noprint{margin:22px auto;max-width:800px;text-align:right}
        @media print{.noprint{display:none}.inv{padding:0}@page{margin:16mm}}
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #f26522", paddingBottom: 16 }}>
        <div>
          <h1>AXIOM SIAM</h1>
          {seller ? (
            <div className="muted" style={{ maxWidth: 360 }}>
              <b style={{ color: "#111" }}>{seller.name}</b><br />{seller.address}<br />
              เลขประจำตัวผู้เสียภาษี {seller.taxId} · {branchText(seller.branch)}
            </div>
          ) : (
            <div className="muted">Axiom Siam Co.,Ltd.<br />ผู้ผลิตชุดกีฬา OEM/ODM</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#f26522" }}>ใบลดหนี้ / CREDIT NOTE</div>
          {isTax && <div className="muted" style={{ fontWeight: 700 }}>ต้นฉบับ</div>}
          <div className="muted">
            เลขที่: <b>{cn.creditNo}</b><br />
            วันที่: {d(cn.issuedAt)}<br />
            อ้างอิงออเดอร์: {o.orderNo}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 22 }}>
        <div style={{ flex: 1 }}>
          <div className="muted">{isTax ? "ผู้ซื้อ" : "ลูกค้า"}</div>
          {isTax ? (
            <>
              <b>{cn.buyerName}</b>
              <div className="muted">{cn.buyerAddress}<br />เลขประจำตัวผู้เสียภาษี {cn.buyerTaxId} · {branchText(cn.buyerBranch)}</div>
            </>
          ) : (
            <b>{o.user?.fullName || o.user?.email}</b>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div className="muted">อ้างอิง{isTax ? "ใบกำกับภาษี" : "ใบแจ้งหนี้"}</div>
          <b>{inv?.invoiceNo ?? "-"}</b>
          {inv && <div className="muted">ลงวันที่ {d(inv.issuedAt)} · มูลค่า {baht(inv.amount)}</div>}
        </div>
      </div>

      <table>
        <thead><tr><th>รายการ</th><th className="r">จำนวนเงิน</th></tr></thead>
        <tbody>
          <tr><td>มูลค่าสินค้าตาม{isTax ? "ใบกำกับภาษี" : "ใบแจ้งหนี้"}เดิม{before > 0 ? " (หลังลดหนี้ครั้งก่อน)" : ""}</td><td className="r">{baht(original)}</td></tr>
          <tr><td>มูลค่าที่ถูกต้อง</td><td className="r">{baht(correct)}</td></tr>
          <tr><td><b>ผลต่าง (ลดหนี้)</b></td><td className="r"><b>{baht(cn.amount)}</b></td></tr>
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: 300, marginTop: 18 }}>
        <div className="tot muted"><span>ผลต่างก่อน VAT</span><span>{baht(diffBefore)}</span></div>
        <div className="tot muted"><span>VAT 7% ของผลต่าง</span><span>{baht(diffVat)}</span></div>
        <div className="tot" style={{ borderTop: "2px solid #f26522", marginTop: 6, paddingTop: 8, fontSize: 17, fontWeight: 800 }}>
          <span>รวมลดหนี้</span><span style={{ color: "#f26522" }}>{baht(cn.amount)}</span>
        </div>
      </div>

      <p style={{ marginTop: 26 }}><span className="muted">เหตุผลที่ลดหนี้:</span> {cn.reason}</p>
      <p className="muted" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>ราคารวมภาษีมูลค่าเพิ่มแล้ว · เอกสารนี้ออกโดยระบบอัตโนมัติ</p>

      <div className="sign"><div>ผู้รับเอกสาร</div><div>ผู้มีอำนาจลงนาม</div></div>

      {!seller && (
        <p className="noprint" style={{ color: "#b45309", fontSize: 12.5, textAlign: "left" }}>
          ยังเป็นใบลดหนี้ทางภาษีไม่ได้: ผู้ดูแลระบบต้องตั้ง COMPANY_NAME, COMPANY_ADDRESS, COMPANY_TAX_ID (และ COMPANY_BRANCH) ใน .env ของ API
        </p>
      )}
      <div className="noprint">
        <button onClick={() => window.print()} style={{ padding: "10px 22px", borderRadius: 30, border: "1.5px solid #f26522", background: "#f26522", color: "#0d0e10", fontWeight: 700, cursor: "pointer" }}>
          🖨 พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>
    </div>
  );
}
