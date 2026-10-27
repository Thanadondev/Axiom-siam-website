"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

/**
 * Pay-by-transfer panel.
 *
 * Shows a PromptPay QR encoding the exact amount, the company account as a
 * fallback, and a slip upload. Uploading is a *claim* — the panel says
 * "under review" until an admin approves, and never implies the order is paid.
 */

type Methods = {
  amount: number;
  orderNo: string;
  qrPayload: string | null;
  bank: { bankName: string; accountNo: string; accountName: string; note: string };
};
type State = {
  orderStatus: string;
  paymentStatus: "none" | "pending" | "submitted" | "paid" | "rejected" | "failed" | "refunded";
  rejectReason: string | null;
  slipUrl: string | null;
  slipUploadedAt: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const FILES = API.replace(/\/api\/v1\/?$/, ""); // slips are served outside the api prefix
const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");
const MAX_MB = 8;

/** cdnjs, same pattern as the three.js loader elsewhere in the app */
function useQrScript() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ((window as any).QRCode) { setReady(true); return; }
    const existing = document.getElementById("qrcode-cdn");
    if (existing) { existing.addEventListener("load", () => setReady(true)); return; }
    const s = document.createElement("script");
    s.id = "qrcode-cdn";
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

export default function PayPanel({ orderId, token, onPaid }: { orderId: string; token: string; onPaid: () => void }) {
  const [m, setM] = useState<Methods | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const qrBox = useRef<HTMLDivElement>(null);
  const qrReady = useQrScript();

  const loadState = useCallback(async () => {
    try { setSt(await apiFetch<State>(`/payments/orders/${orderId}/state`, { token })); } catch { /* keep last */ }
  }, [orderId, token]);

  useEffect(() => {
    apiFetch<Methods>(`/payments/orders/${orderId}/methods`, { token }).then(setM).catch(e => setErr(e.message));
    loadState();
  }, [orderId, token, loadState]);

  // while a slip is in review an admin may approve at any moment
  useEffect(() => {
    if (st?.paymentStatus !== "submitted") return;
    const t = setInterval(async () => {
      const s = await apiFetch<State>(`/payments/orders/${orderId}/state`, { token }).catch(() => null);
      if (s) {
        setSt(s);
        if (s.orderStatus !== "pending") { clearInterval(t); onPaid(); }
      }
    }, 8000);
    return () => clearInterval(t);
  }, [st?.paymentStatus, orderId, token, onPaid]);

  // draw the QR once both the payload and the library are here
  useEffect(() => {
    if (!qrReady || !m?.qrPayload || !qrBox.current) return;
    qrBox.current.innerHTML = "";
    new (window as any).QRCode(qrBox.current, {
      text: m.qrPayload,
      width: 190,
      height: 190,
      correctLevel: (window as any).QRCode.CorrectLevel.M,
    });
  }, [qrReady, m?.qrPayload]);

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    if (file.size > MAX_MB * 1024 * 1024) { setErr(`ไฟล์ใหญ่เกิน ${MAX_MB}MB`); return; }
    if (!/^image\//.test(file.type)) { setErr("กรุณาเลือกไฟล์รูปภาพ"); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!preview) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/payments/orders/${orderId}/slip`, { method: "POST", token, body: JSON.stringify({ image: preview }) });
      setPreview(null);
      await loadState();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (err && !m) return <div className="acard"><p style={{ color: "var(--err, #dc2626)", fontSize: 13 }}>⚠ {err}</p></div>;
  if (!m) return <div className="acard"><p className="asub">กำลังโหลดข้อมูลการชำระเงิน…</p></div>;

  // ---- slip is with the admin ----
  if (st?.paymentStatus === "submitted") {
    return (
      <div className="acard">
        <div className="eyebrow">ชำระเงิน</div>
        <h2 className="ah2" style={{ marginTop: 4 }}>⏳ รอทีมงานตรวจสอบสลิป</h2>
        <p className="asub">
          ได้รับสลิปของคุณแล้วเมื่อ {st.slipUploadedAt ? new Date(st.slipUploadedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "สักครู่ที่ผ่านมา"} ·
          ปกติตรวจสอบไม่เกิน 1 วันทำการ หน้านี้จะอัปเดตเองเมื่อผ่านการตรวจสอบ
        </p>
        {st.slipUrl && (
          <a href={FILES + st.slipUrl} target="_blank" rel="noreferrer">
            <img src={FILES + st.slipUrl} alt="สลิปที่แนบไว้" style={{ maxWidth: 180, borderRadius: 10, border: "1px solid var(--border)", marginTop: 12 }} />
          </a>
        )}
      </div>
    );
  }

  // ---- pay / re-pay ----
  return (
    <div className="acard">
      <div className="eyebrow">ชำระเงิน</div>
      <h2 className="ah2" style={{ marginTop: 4, marginBottom: 4 }}>โอนเงิน {baht(m.amount)}</h2>
      <p className="asub">โอนตามยอดนี้พอดี แล้วแนบสลิปด้านล่าง</p>

      {st?.paymentStatus === "rejected" && st.rejectReason && (
        <div className="note-bad" style={{ margin: "14px 0" }}>
          ⚠ สลิปก่อนหน้าไม่ผ่าน: {st.rejectReason}
          <br />กรุณาตรวจสอบแล้วแนบสลิปใหม่อีกครั้ง
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: m.qrPayload ? "auto minmax(0,1fr)" : "1fr", gap: 20, alignItems: "start", marginTop: 16 }}>
        {m.qrPayload && (
          <div style={{ textAlign: "center" }}>
            <div ref={qrBox} style={{ background: "#fff", padding: 10, borderRadius: 12, border: "1px solid var(--border)", display: "inline-block", minWidth: 210, minHeight: 210 }}>
              {!qrReady && <p className="dim" style={{ paddingTop: 90 }}>กำลังสร้าง QR…</p>}
            </div>
            <div className="dim" style={{ marginTop: 8 }}>สแกนด้วยแอปธนาคาร · ยอดใส่มาให้แล้ว</div>
          </div>
        )}

        <div>
          {m.bank.accountNo && (
            <div style={{ display: "grid", gap: 10 }}>
              <Row label="ธนาคาร" value={m.bank.bankName} />
              <Row label="เลขบัญชี" value={m.bank.accountNo} onCopy={() => copy(m.bank.accountNo, "acc")} copied={copied === "acc"} mono />
              <Row label="ชื่อบัญชี" value={m.bank.accountName} />
              <Row label="ยอดโอน" value={baht(m.amount)} onCopy={() => copy(String(m.amount), "amt")} copied={copied === "amt"} strong />
            </div>
          )}
          {m.bank.note && <p className="dim" style={{ marginTop: 12, lineHeight: 1.6 }}>{m.bank.note}</p>}
        </div>
      </div>

      {/* ---- slip upload ---- */}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 18 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>แนบสลิปการโอน</h3>

        {preview ? (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <img src={preview} alt="ตัวอย่างสลิป" style={{ maxWidth: 160, borderRadius: 10, border: "1px solid var(--border)" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="abtn solid" onClick={submit} disabled={busy}>
                {busy ? "กำลังส่ง…" : "ส่งสลิปให้ตรวจสอบ"}
              </button>
              <button className="minibtn" onClick={() => setPreview(null)} disabled={busy}>เลือกรูปใหม่</button>
            </div>
          </div>
        ) : (
          <label className="minibtn" style={{ display: "inline-block", cursor: "pointer" }}>
            📎 เลือกรูปสลิป
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
        )}

        <p className="dim" style={{ marginTop: 10 }}>รองรับ JPG / PNG / WEBP / HEIC · ไม่เกิน {MAX_MB}MB</p>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 10 }}>⚠ {err}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, onCopy, copied, mono, strong }: {
  label: string; value: string; onCopy?: () => void; copied?: boolean; mono?: boolean; strong?: boolean;
}) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <span className="dim">{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontFamily: mono ? "ui-monospace, monospace" : undefined, fontSize: strong ? 16 : 14, color: strong ? "var(--brand)" : undefined, letterSpacing: mono ? 0.5 : undefined }}>
          {value}
        </b>
        {onCopy && (
          <button className="minibtn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={onCopy}>
            {copied ? "✓ คัดลอกแล้ว" : "คัดลอก"}
          </button>
        )}
      </span>
    </div>
  );
}
