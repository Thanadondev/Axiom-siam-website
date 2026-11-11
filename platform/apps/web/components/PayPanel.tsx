"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { tri, locale, type Lang } from "../lib/i18n";

/**
 * Pay-by-transfer panel.
 *
 * Shows a PromptPay QR encoding the exact amount, the company account as a
 * fallback, and a slip upload. Uploading is a *claim* — the panel says
 * "under review" until an admin approves, and never implies the order is paid.
 *
 * In Thai, English and Japanese: teams in Japan pay into the same Thai account
 * by international transfer, so in English and Japanese the account is shown
 * with its English names and SWIFT code (when an admin has filled them in),
 * the QR is marked Thai-banking-apps-only, and the admin's Thai note is left out.
 */

type Methods = {
  /** what to transfer now: the deposit, the balance or the whole order */
  amount: number;
  kind?: "deposit" | "full" | "balance" | null;
  total?: number;
  paid?: number;
  orderNo: string;
  qrPayload: string | null;
  bank: { bankName: string; accountNo: string; accountName: string; note: string; bankNameEn?: string; accountNameEn?: string; swift?: string };
};
type State = {
  orderStatus: string;
  paymentStatus: "none" | "pending" | "submitted" | "paid" | "rejected" | "failed" | "refunded";
  rejectReason: string | null;
  /** a short-lived signed link (slips are not public files) */
  slipUrl: string | null;
  slipUploadedAt: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const FILES = API.replace(/\/api\/v1\/?$/, ""); // slip links come back as /api/v1/payments/slip?…
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

export default function PayPanel({ orderId, token, onPaid, lang = "th" }: { orderId: string; token: string; onPaid: () => void; lang?: Lang }) {
  const L = tri(lang);
  const th = lang === "th";
  const baht = (n: number) => "฿" + (n ?? 0).toLocaleString(locale(lang));
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
        // approved: the deposit, the balance or the whole order is in
        if (s.paymentStatus === "paid") { clearInterval(t); onPaid(); }
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
    if (file.size > MAX_MB * 1024 * 1024) { setErr(L(`ไฟล์ใหญ่เกิน ${MAX_MB}MB`, `The file is over ${MAX_MB} MB`, `ファイルが${MAX_MB}MBを超えています`)); return; }
    if (!/^image\//.test(file.type)) { setErr(L("กรุณาเลือกไฟล์รูปภาพ", "Please choose a picture", "画像ファイルを選択してください")); return; }
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
    } catch (e: any) {
      // the API answers in Thai: in other languages say it in the page's words
      setErr(th ? e.message : L("", "The slip couldn't be sent — please check the picture and try again", "振込明細を送信できませんでした。画像をご確認のうえ、もう一度お試しください"));
    }
    finally { setBusy(false); }
  }

  if (err && !m) return <div className="acard"><p style={{ color: "var(--err, #dc2626)", fontSize: 13 }}>⚠ {th ? err : L("", "The payment details couldn't be loaded — please reload the page", "お支払い情報を読み込めませんでした。ページを再読み込みしてください")}</p></div>;
  if (!m) return <div className="acard"><p className="asub">{L("กำลังโหลดข้อมูลการชำระเงิน…", "Loading the payment details…", "お支払い情報を読み込み中…")}</p></div>;

  const pay = L("ชำระเงิน", "Payment", "お支払い");
  // ---- slip is with the admin ----
  if (st?.paymentStatus === "submitted") {
    return (
      <div className="acard">
        <div className="eyebrow">{pay}</div>
        <h2 className="ah2" style={{ marginTop: 4 }}>⏳ {L("รอทีมงานตรวจสอบสลิป", "Your slip is being checked", "振込明細を確認中です")}</h2>
        <p className="asub">
          {L("ได้รับสลิปของคุณแล้วเมื่อ", "We received your slip", "振込明細を受け取りました")}{" "}
          {st.slipUploadedAt ? new Date(st.slipUploadedAt).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" }) : L("สักครู่ที่ผ่านมา", "just now", "たった今")} ·{" "}
          {L("ปกติตรวจสอบไม่เกิน 1 วันทำการ หน้านี้จะอัปเดตเองเมื่อผ่านการตรวจสอบ", "it's usually checked within one working day; this page updates itself once it's approved", "通常1営業日以内に確認します。確認が済むとこのページは自動で更新されます")}
        </p>
        {st.slipUrl && (
          <a href={FILES + st.slipUrl} target="_blank" rel="noreferrer">
            <img src={FILES + st.slipUrl} alt={L("สลิปที่แนบไว้", "The slip you sent", "送信した振込明細")} style={{ maxWidth: 180, borderRadius: 10, border: "1px solid var(--border)", marginTop: 12 }} />
          </a>
        )}
      </div>
    );
  }

  const b = m.bank;
  const abroad = !th;
  // ---- pay / re-pay ----
  return (
    <div className="acard">
      <div className="eyebrow">{pay}</div>
      <h2 className="ah2" style={{ marginTop: 4, marginBottom: 4 }}>
        {m.kind === "deposit" ? L("โอนมัดจำ", "Transfer the deposit", "前金のお振込")
          : m.kind === "balance" ? L("โอนส่วนที่เหลือ", "Transfer the balance", "残額のお振込")
          : L("โอนเงิน", "Transfer", "お振込")} {baht(m.amount)}
      </h2>
      <p className="asub">
        {L("โอนตามยอดนี้พอดี แล้วแนบสลิปด้านล่าง", "Transfer exactly this amount in Thai baht, then attach the slip below", "この金額（タイバーツ）をちょうどお振込みのうえ、下で振込明細を添付してください")}
        {m.kind === "deposit" && m.total ? L(` · ยอดรวม ${baht(m.total)} ส่วนที่เหลือชำระก่อนจัดส่ง`, ` · total ${baht(m.total)}; the rest before shipping`, ` · 合計 ${baht(m.total)}、残額は発送前にお支払い`) : ""}
        {m.kind === "balance" && m.paid ? L(` · ชำระแล้ว ${baht(m.paid)}`, ` · paid so far ${baht(m.paid)}`, ` · お支払い済み ${baht(m.paid)}`) : ""}
      </p>
      {abroad && (
        <p className="dim" style={{ marginTop: 6 }}>
          {L("", "From abroad: an international transfer to our account in Thailand. Please make sure the full amount in THB arrives.", "海外からは、タイの当社口座への海外送金となります。タイバーツで全額が着金するようお手続きください。")}
        </p>
      )}

      {st?.paymentStatus === "rejected" && st.rejectReason && (
        <div className="note-bad" style={{ margin: "14px 0" }}>
          ⚠ {L("สลิปก่อนหน้าไม่ผ่าน", "The last slip wasn't accepted", "前回の振込明細は承認されませんでした")}{th ? `: ${st.rejectReason}` : ""}
          <br />{L("กรุณาตรวจสอบแล้วแนบสลิปใหม่อีกครั้ง", "Please check it and attach a new slip", "ご確認のうえ、新しい振込明細を添付してください")}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: m.qrPayload ? "auto minmax(0,1fr)" : "1fr", gap: 20, alignItems: "start", marginTop: 16 }}>
        {m.qrPayload && (
          <div style={{ textAlign: "center" }}>
            <div ref={qrBox} style={{ background: "#fff", padding: 10, borderRadius: 12, border: "1px solid var(--border)", display: "inline-block", minWidth: 210, minHeight: 210 }}>
              {!qrReady && <p className="dim" style={{ paddingTop: 90 }}>{L("กำลังสร้าง QR…", "Making the QR…", "QRを作成中…")}</p>}
            </div>
            <div className="dim" style={{ marginTop: 8 }}>
              {L("สแกนด้วยแอปธนาคาร · ยอดใส่มาให้แล้ว", "PromptPay QR · Thai banking apps only", "PromptPay QR · タイの銀行アプリ専用")}
            </div>
          </div>
        )}

        <div>
          {b.accountNo && (
            <div style={{ display: "grid", gap: 10 }}>
              <Row label={L("ธนาคาร", "Bank", "銀行")} value={abroad && b.bankNameEn ? b.bankNameEn : b.bankName} />
              {abroad && b.swift && <Row label="SWIFT" value={b.swift} onCopy={() => copy(b.swift!, "swift")} copied={copied === "swift"} mono copyLabel={[L("คัดลอก", "Copy", "コピー"), L("✓ คัดลอกแล้ว", "✓ Copied", "✓ コピーしました")]} />}
              <Row label={L("เลขบัญชี", "Account no.", "口座番号")} value={b.accountNo} onCopy={() => copy(b.accountNo, "acc")} copied={copied === "acc"} mono copyLabel={[L("คัดลอก", "Copy", "コピー"), L("✓ คัดลอกแล้ว", "✓ Copied", "✓ コピーしました")]} />
              <Row label={L("ชื่อบัญชี", "Account name", "口座名義")} value={abroad && b.accountNameEn ? b.accountNameEn : b.accountName} />
              <Row label={L("ยอดโอน", "Amount", "お振込金額")} value={baht(m.amount)} onCopy={() => copy(String(m.amount), "amt")} copied={copied === "amt"} strong copyLabel={[L("คัดลอก", "Copy", "コピー"), L("✓ คัดลอกแล้ว", "✓ Copied", "✓ コピーしました")]} />
            </div>
          )}
          {th && b.note && <p className="dim" style={{ marginTop: 12, lineHeight: 1.6 }}>{b.note}</p>}
          {abroad && !b.swift && (
            <p className="dim" style={{ marginTop: 12, lineHeight: 1.6 }}>
              {L("", "For the SWIFT code and transfer details from abroad, please contact us.", "海外送金に必要なSWIFTコード等は、お問い合わせください。")}
            </p>
          )}
        </div>
      </div>

      {/* ---- slip upload ---- */}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 18 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>{L("แนบสลิปการโอน", "Attach the transfer slip", "振込明細の添付")}</h3>

        {preview ? (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <img src={preview} alt={L("ตัวอย่างสลิป", "Slip preview", "振込明細のプレビュー")} style={{ maxWidth: 160, borderRadius: 10, border: "1px solid var(--border)" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="abtn solid" onClick={submit} disabled={busy}>
                {busy ? L("กำลังส่ง…", "Sending…", "送信中…") : L("ส่งสลิปให้ตรวจสอบ", "Send the slip for checking", "振込明細を送信する")}
              </button>
              <button className="minibtn" onClick={() => setPreview(null)} disabled={busy}>{L("เลือกรูปใหม่", "Choose another", "別の画像を選ぶ")}</button>
            </div>
          </div>
        ) : (
          <label className="minibtn" style={{ display: "inline-block", cursor: "pointer" }}>
            📎 {L("เลือกรูปสลิป", "Choose the slip picture", "振込明細の画像を選択")}
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
        )}

        <p className="dim" style={{ marginTop: 10 }}>{L(`รองรับ JPG / PNG / WEBP / HEIC · ไม่เกิน ${MAX_MB}MB`, `JPG / PNG / WEBP / HEIC · up to ${MAX_MB} MB`, `JPG / PNG / WEBP / HEIC · 最大${MAX_MB}MB`)}</p>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 10 }}>⚠ {err}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, onCopy, copied, mono, strong, copyLabel = ["คัดลอก", "✓ คัดลอกแล้ว"] }: {
  label: string; value: string; onCopy?: () => void; copied?: boolean; mono?: boolean; strong?: boolean; copyLabel?: [string, string];
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
            {copied ? copyLabel[1] : copyLabel[0]}
          </button>
        )}
      </span>
    </div>
  );
}
