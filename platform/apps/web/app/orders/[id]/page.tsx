"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import PayPanel from "../../../components/PayPanel";
import ProductionTracker from "../../../components/ProductionTracker";
import OrderFiles from "../../../components/OrderFiles";
import { STEPS } from "../../../lib/production-steps";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { tri, locale, useLang } from "../../../lib/i18n";
import { orderStatus, summaryIn } from "../../../lib/order-text";

/**
 * One order, for its customer: in Thai, English or Japanese (teams in Japan
 * order bibs by zip and pay by transfer). The full tax invoice is a Thai
 * document, so its card shows in Thai only; the staff's notes in the history
 * are written in Thai, so they show in Thai only too.
 */

const FLOW = ["pending", "paid", "approved", "in_production", "shipped", "delivered", "completed"];

export default function OrderDetail() {
  const id = String(useParams().id);
  const { token, loading } = useAuth();
  const [lang, setLang] = useLang();
  const L = tri(lang);
  const th = lang === "th";
  const baht = (n: number) => "฿" + (n ?? 0).toLocaleString(locale(lang));
  const dt = (s: string) => new Date(s).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" });
  const status = (s: string) => orderStatus(lang, s);
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
    if (!confirm(L("ยกเลิกออเดอร์นี้?", "Cancel this order?", "この注文をキャンセルしますか？"))) return;
    setBusy(true);
    try { await apiFetch(`/orders/${id}/cancel`, { method: "POST", token }); load(); }
    catch (e: any) { setErr(th ? e.message : L("", "The order couldn't be cancelled — please contact us", "キャンセルできませんでした。お問い合わせください")); }
    finally { setBusy(false); }
  }

  const shell = (children: React.ReactNode, wide = false) => (
    <AppShell narrow={!wide} wide={wide} lang={lang} onLang={setLang}>{children}</AppShell>
  );
  if (loading || (!o && !err)) return shell(<div className="acard"><p className="asub">{L("กำลังโหลด…", "Loading…", "読み込み中…")}</p></div>);
  if (err && !o) return shell(
    <div className="acard">
      <h1 className="atitle">{L("ไม่พบออเดอร์", "Order not found", "注文が見つかりません")}</h1>
      <p className="asub">{th ? err : L("", "It may not be yours, or the link is wrong.", "ご本人の注文でないか、リンクが正しくない可能性があります。")}</p>
      <Link className="abtn ghost" href="/account">{L("กลับไปบัญชี", "Back to my account", "マイアカウントへ戻る")}</Link>
    </div>,
  );

  const cancelled = o.status === "cancelled" || o.status === "refunded";
  const stepIdx = FLOW.indexOf(o.status);
  const a = o.shippingAddress;
  const agent = o.delivery?.mode === "agent" ? o.delivery : null;

  return shell(
    <>
      <Link href="/account" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>{L("← กลับไปบัญชีของฉัน", "← Back to my account", "← マイアカウントへ戻る")}</Link>

      <div className="acard">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow">{L("ออเดอร์", "Order", "ご注文")}</div>
            <h1 className="atitle" style={{ marginBottom: 2 }}>{o.orderNo}</h1>
            <p className="asub">{L("สั่งเมื่อ", "Ordered", "ご注文日")} {dt(o.createdAt)} · {summaryIn(lang, o.fabricSummary)}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="kpivalue" style={{ color: "var(--brand)" }}>{baht(o.total)}</div>
            {o.balance && o.balance.paid > 0 && (
              <div className="dim" style={{ margin: "2px 0 6px" }}>
                {L("ชำระแล้ว", "Paid", "お支払い済み")} {baht(o.balance.paid)}
                {o.balance.outstanding > 0 ? ` · ${L("ค้าง", "due", "残額")} ${baht(o.balance.outstanding)}` : ` · ${L("ครบแล้ว", "in full", "全額")}`}
                {o.balance.refunded > 0 && ` · ${L("คืนเงินแล้ว", "refunded", "返金済み")} ${baht(o.balance.refunded)}`}
              </div>
            )}
            <span className={`tag ${cancelled ? "red" : o.status === "completed" ? "green" : "blue"}`}>{status(o.status)}</span>
          </div>
        </div>

        {/* progress */}
        {!cancelled && (
          <div style={{ display: "flex", gap: 4, marginTop: 20, flexWrap: "wrap" }}>
            {FLOW.map((s, i) => (
              <div key={s} style={{ flex: "1 1 90px", minWidth: 90 }}>
                <div style={{ height: 5, borderRadius: 4, background: i <= stepIdx ? "var(--brand)" : "var(--border)" }} />
                <div className="dim" style={{ marginTop: 6, fontWeight: i === stepIdx ? 700 : 400, color: i === stepIdx ? "var(--brand)" : undefined }}>
                  {status(s)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          {o.status === "pending" && (
            <button className="minibtn danger" onClick={cancel} disabled={busy}>{L("ยกเลิกออเดอร์", "Cancel order", "注文をキャンセル")}</button>
          )}
          {o.invoices?.length > 0 && (
            <Link className="minibtn" href={`/orders/${o.id}/invoice`} target="_blank">🧾 {L("ใบแจ้งหนี้", "Invoice", "請求書")} {o.invoices[0].invoiceNo}</Link>
          )}
          {o.creditNotes?.map((c: any) => (
            <Link key={c.id} className="minibtn" href={`/orders/${o.id}/credit-note/${c.id}`} target="_blank">↩ {L("ใบลดหนี้", "Credit note", "クレジットノート")} {c.creditNo} · {baht(c.amount)}</Link>
          ))}
        </div>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
      </div>

      <OrderFiles
        files={o.files}
        lang={lang}
        title={L("ไฟล์งานที่ส่งมา", "The files you sent", "入稿データ")}
        note={["pending", "paid"].includes(o.status)
          ? L("ทีมงานจะเปิดตรวจไฟล์ก่อนเข้าผลิต ถ้ามีปัญหาจะติดต่อกลับ", "Our team checks your files before production and gets in touch if anything needs fixing.", "制作前にスタッフがデータを確認し、修正が必要な場合はご連絡します。")
          : undefined}
      />

      <ProductionTracker orderNo={o.orderNo} status={o.status} productionStep={o.productionStep} history={o.statusHistory} erp={o.erp} lang={lang} />

      {/* pay by transfer — the panel owns the QR, the account and the slip upload */}
      {(o.balance ? o.balance.due > 0 : o.status === "pending") && token && (
        payEnabled
          ? <PayPanel orderId={id} token={token} onPaid={load} lang={lang} />
          : (
            <div className="acard">
              <div className="eyebrow">{L("ชำระเงิน", "Payment", "お支払い")}</div>
              <h2 className="ah2" style={{ marginTop: 4 }}>{L("ยังไม่เปิดรับชำระเงิน", "Payment isn't open yet", "現在お支払いを受け付けていません")}</h2>
              <p className="asub">{L("ผู้ดูแลระบบยังไม่ได้ตั้งค่าบัญชีรับเงิน — กรุณาติดต่อทีมงานเพื่อชำระเงิน", "Please contact us to pay for this order.", "お支払い方法については、お問い合わせください。")}</p>
            </div>
          )
      )}

      {th && o.status !== "cancelled" && token && <TaxInvoiceCard o={o} token={token} onSaved={load} />}

      <div className="od-grid">
        <div>
          <div className="acard">
            <h2 className="ah2">{L("รายการ", "Items", "ご注文明細")}</h2>
            <div className="tablewrap">
              <table className="atable" style={{ minWidth: 380 }}>
                <thead><tr><th>{L("ไซส์", "Size", "サイズ")}</th><th>{L("จำนวน", "Qty", "枚数")}</th><th>{L("ราคา/ตัว", "Each", "単価")}</th><th>{L("รวม", "Total", "小計")}</th></tr></thead>
                <tbody>
                  {o.items.map((it: any) => (
                    <tr key={it.id}><td><b>{it.size}</b></td><td>{it.qty}</td><td>{baht(it.unitPrice)}</td><td>{baht(it.unitPrice * it.qty)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {o.items.some((i: any) => i.roster?.length) && (
              <>
                <h2 className="ah2" style={{ marginTop: 20 }}>{L("รายชื่อนักกีฬา", "Players", "選手名簿")}</h2>
                <div className="tablewrap">
                  <table className="atable" style={{ minWidth: 380 }}>
                    <thead><tr><th>{L("ชื่อ", "Name", "名前")}</th><th>{L("เบอร์", "No.", "番号")}</th><th>{L("ไซส์", "Size", "サイズ")}</th></tr></thead>
                    <tbody>
                      {o.items.flatMap((it: any) => it.roster.map((r: any) => (
                        <tr key={r.id}><td>{r.playerName || "-"}</td><td>{r.number || "-"}</td><td>{r.size}</td></tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {o.note && <><h2 className="ah2" style={{ marginTop: 20 }}>{L("หมายเหตุ", "Your note", "備考")}</h2><p className="asub">{o.note}</p></>}
          </div>

          <div className="acard">
            <h2 className="ah2">{L("ประวัติสถานะ", "History", "履歴")}</h2>
            <div style={{ marginTop: 10 }}>
              {o.statusHistory.map((h: any) => (
                <div key={h.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="tag">{h.step ? L(`ขั้น ${h.step} · ${STEPS[h.step - 1]?.th ?? ""}`, `Step ${h.step} · ${STEPS[h.step - 1]?.en ?? ""}`, `工程${h.step} · ${STEPS[h.step - 1]?.ja ?? ""}`) : status(h.status)}</span>
                  <div style={{ flex: 1 }}>
                    <div className="dim">{dt(h.createdAt)}</div>
                    {th && h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="acard">
            <h2 className="ah2">{L("สรุปยอด", "Summary", "お支払い金額")}</h2>
            <Row k={L("ราคาสินค้า", "Items", "商品代金")} v={baht(o.subtotal)} />
            {o.discount > 0 && <Row k={L("ส่วนลด", "Discount", "割引")} v={"-" + baht(o.discount)} />}
            <Row k={agent ? L("ค่าส่ง (ตัวแทนญี่ปุ่น)", "Shipping (agent in Japan)", "送料（日本の代理店）") : L("ค่าจัดส่ง", "Shipping", "送料")} v={o.shippingFee === 0 ? L("ฟรี", "Free", "無料") : baht(o.shippingFee)} />
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b>{L("ยอดรวม", "Total", "合計")}</b><b style={{ fontSize: 22, color: "var(--brand)" }}>{baht(o.total)}</b>
            </div>
            {!th && <p className="dim" style={{ marginTop: 6 }}>{L("", "Prices in Thai baht (THB)", "価格はタイバーツ（THB）表示です")}</p>}
          </div>

          {o.shipments?.length > 0 && (
            <div className="acard">
              <h2 className="ah2">{L("การจัดส่ง", "Shipping", "発送")}</h2>
              {o.shipments.map((s: any) => (
                <div key={s.id} style={{ fontSize: 13.5, lineHeight: 1.8, marginTop: 8 }}>
                  <div>{L("ขนส่ง", "Courier", "配送業者")}: <b>{s.courier || "-"}</b></div>
                  <div>{L("เลขพัสดุ", "Tracking no.", "追跡番号")}: <b style={{ color: "var(--brand)", userSelect: "all" }}>{s.trackingNo || "-"}</b></div>
                  {s.shippedAt && <div className="dim">{L("ส่งเมื่อ", "Sent", "発送日")} {dt(s.shippedAt)}</div>}
                  {s.deliveredAt && <div className="dim">{L("ถึงมือผู้รับ", "Delivered", "お届け日")} {dt(s.deliveredAt)}</div>}
                </div>
              ))}
            </div>
          )}

          {agent ? (
            <div className="acard">
              <h2 className="ah2">{L("จัดส่งถึง", "Delivery", "お届け先")}</h2>
              <p className="dim" style={{ marginTop: 6 }}>{L("ส่งรวมให้ตัวแทนในญี่ปุ่น", "Consolidated to our agent in Japan", "日本の代理店へまとめて発送")}</p>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, marginTop: 6, whiteSpace: "pre-line" }}>
                <b>{agent.name}</b>{agent.phone ? ` · ${agent.phone}` : ""}{"\n"}{agent.address}
              </p>
            </div>
          ) : a && (
            <div className="acard">
              <h2 className="ah2">{L("จัดส่งถึง", "Ship to", "お届け先")}</h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, marginTop: 8 }}>
                <b>{a.recipient}</b> · {a.phone}<br />
                {a.line1} {a.line2}<br />{a.district} {a.province} {a.postalCode}
              </p>
            </div>
          )}
        </div>
      </div>
    </>,
    true,
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
