"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";

/**
 * Admin slip review queue.
 *
 * This is where money becomes real: approving here marks the order paid and
 * kicks off production. So the UI makes the admin *look* — the slip image is
 * shown large, the expected amount sits next to the field they type into, and
 * approving requires entering what the slip actually says.
 */

type Slip = {
  id: string;
  /** what this slip should pay: the deposit, the balance or the whole order */
  amount: number;
  type?: "deposit" | "full" | "balance";
  slipUrl: string | null;
  slipAmount: number | null;
  slipRef: string | null;
  slipUploadedAt: string | null;
  slipTransferredAt: string | null;
  order: { id: string; orderNo: string; total: number; user: { email: string; fullName: string | null } };
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const FILES = API.replace(/\/api\/v1\/?$/, "");
const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function SlipReview({ token, onChange }: { token: string; onChange?: () => void }) {
  const [rows, setRows] = useState<Slip[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Record<string, { amount: string; ref: string }>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await apiFetch<Slip[]>("/admin/payments", { token })); }
    catch (e: any) { setErr(e.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const f = (id: string) => form[id] ?? { amount: "", ref: "" };
  const set = (id: string, patch: Partial<{ amount: string; ref: string }>) =>
    setForm(s => ({ ...s, [id]: { ...f(id), ...patch } }));

  async function approve(s: Slip) {
    const v = f(s.id);
    if (!v.amount) { setErr("กรุณากรอกยอดที่อ่านได้จากสลิปก่อนอนุมัติ"); return; }
    setBusy(s.id); setErr("");
    try {
      await apiFetch(`/admin/payments/${s.id}/approve`, {
        method: "POST", token,
        body: JSON.stringify({ amount: Number(v.amount), ref: v.ref || undefined }),
      });
      await load(); onChange?.();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  }

  async function reject(s: Slip) {
    const reason = prompt(`ปฏิเสธสลิปของ ${s.order.orderNo}\nเหตุผล (ลูกค้าจะเห็นข้อความนี้):`, "ยอดโอนไม่ตรงกับยอดที่ต้องชำระ");
    if (!reason) return;
    setBusy(s.id); setErr("");
    try {
      await apiFetch(`/admin/payments/${s.id}/reject`, { method: "POST", token, body: JSON.stringify({ reason }) });
      await load(); onChange?.();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  }

  return (
    <div className="acard">
      <h2 className="ah2">สลิปรอตรวจสอบ ({rows.length})</h2>
      <p className="asub">อนุมัติแล้วออเดอร์จะเปลี่ยนเป็น “ชำระแล้ว” และเข้าคิวผลิตทันที — ตรวจยอดให้ตรงก่อนกด</p>
      {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 10 }}>⚠ {err}</p>}

      {rows.length === 0 ? (
        <p className="asub" style={{ marginTop: 14 }}>ไม่มีสลิปรอตรวจ 🎉</p>
      ) : (
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          {rows.map(s => {
            const v = f(s.id);
            const typed = Number(v.amount);
            const mismatch = v.amount !== "" && Math.abs(typed - s.amount) > 1;
            return (
              <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 16 }}>
                {/* the slip itself — click to enlarge */}
                {s.slipUrl ? (
                  <img
                    src={FILES + s.slipUrl}
                    alt={`สลิป ${s.order.orderNo}`}
                    onClick={() => setZoom(FILES + s.slipUrl)}
                    style={{ width: 150, borderRadius: 8, border: "1px solid var(--border)", cursor: "zoom-in", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: 150, height: 150, display: "grid", placeItems: "center", background: "var(--surface)", borderRadius: 8 }} className="dim">ไม่มีรูป</div>
                )}

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <Link href={`/orders/${s.order.id}`} target="_blank"><b>{s.order.orderNo}</b></Link>
                      <div className="dim">{s.order.user.fullName || s.order.user.email}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="dim">ต้องชำระ{s.type === "deposit" ? " (มัดจำ)" : s.type === "balance" ? " (ส่วนที่เหลือ)" : ""}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand)" }}>{baht(s.amount)}</div>
                      {s.amount !== s.order.total && <div className="dim">ยอดออเดอร์ {baht(s.order.total)}</div>}
                    </div>
                  </div>

                  <div className="dim" style={{ marginTop: 6 }}>
                    แนบเมื่อ {dt(s.slipUploadedAt)}
                    {s.slipTransferredAt && ` · โอนเมื่อ ${dt(s.slipTransferredAt)}`}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="ainput" style={{ width: 130 }} inputMode="decimal"
                      placeholder="ยอดบนสลิป *"
                      value={v.amount}
                      onChange={e => set(s.id, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                    />
                    <input
                      className="ainput" style={{ width: 190 }}
                      placeholder="เลขอ้างอิง (ถ้ามี)"
                      value={v.ref}
                      onChange={e => set(s.id, { ref: e.target.value })}
                    />
                    <button className="abtn solid" disabled={busy === s.id || !v.amount} onClick={() => approve(s)}>
                      {busy === s.id ? "…" : "✓ อนุมัติ"}
                    </button>
                    <button className="minibtn danger" disabled={busy === s.id} onClick={() => reject(s)}>ปฏิเสธ</button>
                  </div>

                  {mismatch && (
                    <p style={{ color: "#b45309", fontSize: 12.5, marginTop: 8 }}>
                      ⚠ ยอดที่กรอก ({baht(typed)}) ไม่ตรงกับยอดที่ต้องชำระ ({baht(s.amount)}) — ระบบจะปฏิเสธถ้าโอนขาด
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "grid", placeItems: "center", zIndex: 100, cursor: "zoom-out", padding: 24 }}
        >
          <img src={zoom} alt="สลิป" style={{ maxWidth: "min(92vw, 900px)", maxHeight: "92vh", borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}
