"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import StoreHeader from "../../components/StoreHeader";
import SiteFooter from "../../components/SiteFooter";
import FactoryTrack from "../../components/FactoryTrack";
import { STEPS, SHIP_STEP } from "../../lib/production-steps";
import { apiFetch } from "../../lib/api";
import { tri, locale, useLang, type Lang } from "../../lib/i18n";
import "../app.css"; // UserMenu styles
import "../home.css";
import "./track.css";

interface Tracked {
  orderNo: string;
  status: string;
  statusLabel: string;
  /** 0 not started, 1–9 on the floor, 10 shipped */
  step: number;
  stepName: string;
  qty: number;
  product?: string | null;
  dueDate?: string | null;
  steps: { no: number; startedOn: string | null; finishedOn: string | null }[];
  updatedAt: string;
  shipment: { courier: string | null; trackingNo: string | null; shippedAt?: string | null; deliveredAt?: string | null } | null;
}

/** "2026-11-23" or an ISO time → "23 Nov" in the reader's language */
const shortDay = (s: string, lang: Lang) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m && s.length <= 10 ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(locale(lang), { day: "numeric", month: "short" });
};

/**
 * /tracking — the order number shows where the job is on the factory floor: the same factory
 * picture as the home page with the line drawn through its ten stops, a pin on the order's step
 * (FactoryTrack), and next to it every step with the factory's dates and the delivery.
 * /tracking?no=AX-… (the link on each order) looks it up straight away.
 */
export default function TrackingPage() {
  const [lang, setLang] = useLang();
  const L = tri(lang);
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [t, setT] = useState<Tracked | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function copyParcel(p: string) {
    try { await navigator.clipboard.writeText(p); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* the number is on screen to copy by hand */ }
  }

  async function lookup(raw: string) {
    const q = raw.replace(/\s+/g, "").toUpperCase();
    if (!q) { setErr(L("กรอกเลขออเดอร์ก่อน", "Enter your order number", "注文番号を入力してください")); input.current?.focus(); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch<Tracked>(`/orders/track/${encodeURIComponent(q)}`);
      setT(r);
      setNo(r.orderNo);
      const u = new URL(window.location.href);
      u.searchParams.set("no", r.orderNo);
      window.history.replaceState(null, "", u.toString());
    } catch (e: any) {
      setT(null);
      setErr(e.message || L("ค้นหาไม่สำเร็จ", "Couldn't look that up", "検索できませんでした"));
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("no");
    if (q) { setNo(q); lookup(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function another() {
    setT(null); setErr(""); setNo("");
    const u = new URL(window.location.href); u.searchParams.delete("no"); window.history.replaceState(null, "", u.toString());
    window.setTimeout(() => input.current?.focus(), 0);
  }

  const closed = t ? ["cancelled", "refunded"].includes(t.status) : false;
  const shipped = t ? t.step >= SHIP_STEP : false;
  const arrived = t ? ["delivered", "completed"].includes(t.status) || Boolean(t.shipment?.deliveredAt) : false;
  /** delivery: not sent yet → on its way → arrived */
  const ship = !t || closed ? null : arrived ? "arrived" : shipped ? "sent" : "waiting";
  const parcel = t?.shipment?.trackingNo ?? null;
  const stepName = (n: number) => L(STEPS[n - 1].th, STEPS[n - 1].en, STEPS[n - 1].ja);
  const head = !t ? "" : closed ? t.statusLabel
    : t.status === "pending" ? L("รอชำระเงิน · เริ่มผลิตหลังชำระ", "Awaiting payment · production starts once paid", "お支払い待ち · ご入金後に生産開始")
    : t.step === 0 ? L("รอเข้าไลน์ผลิต", "Waiting to start", "生産開始待ち")
    : arrived ? L("ได้รับของแล้ว", "Delivered", "お届け済み")
    : shipped ? L("จัดส่งแล้ว", "Shipped", "発送済み")
    : L(`ขั้นที่ ${t.step} จาก ${SHIP_STEP} · ${stepName(t.step)}`, `Step ${t.step} of ${SHIP_STEP} · ${stepName(t.step)}`, `工程 ${t.step} / ${SHIP_STEP} · ${stepName(t.step)}`);
  const pct = t && !closed ? Math.round((Math.min(t.step, SHIP_STEP) / SHIP_STEP) * 100) : 0;

  return (
    <div className="ax ax-track" lang={lang}>
      <StoreHeader
        lang={lang}
        onLang={setLang}
        nav={[
          { href: "/", label: L("หน้าแรก", "Home", "ホーム") },
          { href: "/shop", label: L("คอลเลกชัน", "Collection", "コレクション") },
          { href: "/tracking", label: L("ติดตามงาน", "Track order", "注文追跡") },
          { href: "#contact", label: L("ติดต่อ", "Contact", "お問い合わせ") },
        ]}
      />
      <main className="tk">
        <div className="tk-top">
          <div>
            <span className="ax-kicker">{L("ติดตามงาน", "Track your order", "注文追跡")}</span>
            <h1 className="tk-title">{L("งานของคุณอยู่ตรงไหนในโรงงาน", "Where is your kit in the factory?", "ご注文は工場のどこ?")}</h1>
          </div>
          <form className="tk-form" onSubmit={e => { e.preventDefault(); lookup(no); }}>
            <input ref={input} className="ax-field" value={no} onChange={e => setNo(e.target.value)} maxLength={40}
              placeholder={L("เลขออเดอร์ เช่น AX-261029-K7QZ หรือ HJ-447", "Order number, e.g. AX-261029-K7QZ or HJ-447", "注文番号 例: AX-261029-K7QZ")}
              aria-label={L("เลขออเดอร์", "Order number", "注文番号")} autoComplete="off" spellCheck={false} />
            <button type="submit" className="ax-btn solid" disabled={busy}>{busy ? "…" : L("ติดตาม", "Track", "追跡")}</button>
          </form>
        </div>
        {err && <p className="ax-err tk-err" role="alert">{err}</p>}

        <div className="tk-body">
          <div className="tk-left">
            <FactoryTrack lang={lang} step={t && !closed ? t.step : null} hot={hot} onHot={setHot} />
            {/* what happens at the step being pointed at, or the order's own step */}
            {(() => {
              const n = hot ?? (t && !closed && t.step >= 1 ? t.step : null);
              if (!n) return (
                <div className="tk-about tk-legend">
                  <span><i data-k="done" />{L("ผ่านแล้ว", "Done", "完了")}</span>
                  <span><i data-k="now" />{L("งานอยู่ตรงนี้", "Your order", "現在地")}</span>
                  <span><i data-k="todo" />{L("ยังไม่ถึง", "Still to come", "これから")}</span>
                  <p>{L("ชี้หรือแตะเลขบนภาพเพื่อดูว่าแต่ละขั้นทำอะไร", "Point at a number to see what happens at each step.", "番号を指すと各工程の内容が表示されます。")}</p>
                </div>
              );
              const s = STEPS[n - 1];
              return (
                <div className="tk-about">
                  <small className="ax-mono">{L(`ขั้นที่ ${n} จาก ${SHIP_STEP}`, `Step ${n} of ${SHIP_STEP}`, `工程 ${n} / ${SHIP_STEP}`)}</small>
                  <b>{L(s.th, s.en, s.ja)}</b>
                  <p>{L(s.p, s.pEn, s.pJa)}</p>
                </div>
              );
            })()}
          </div>

          <aside className="tk-card" aria-live="polite">
            {t ? (
              <>
                <div className="tk-order">
                  <b className="ax-mono">{t.orderNo}</b>
                  <span>{t.qty} {L("ตัว", "pcs", "枚")}{t.product ? ` · ${t.product}` : ""}</span>
                </div>
                <div className="tk-now" data-closed={closed || undefined}>{head}</div>
                {!closed && (
                  <div className="tk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={SHIP_STEP} aria-valuenow={Math.min(t.step, SHIP_STEP)}
                    aria-label={L("ความคืบหน้า", "Progress", "進捗")}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                )}
              </>
            ) : (
              <p className="tk-intro">{L(
                "กรอกเลขออเดอร์ด้านบน แล้วจะเห็นว่างานอยู่จุดไหนในโรงงาน พร้อมวันที่ของทุกขั้น ไลน์ผลิตของเรามี 10 ขั้น ตามเส้นบนภาพ",
                "Enter your order number above to see where it is in the factory, with the date of every step. Our line has ten steps, along the route on the picture.",
                "上に注文番号を入力すると、工場のどこにあるかと各工程の日付が表示されます。生産ラインは図の順路どおり全10工程です。")}</p>
            )}

            {!closed && (
              <ol className="tk-steps" aria-label={L("ขั้นตอนผลิตทั้งหมด", "All production steps", "全製造工程")}>
                {STEPS.map((s, i) => {
                  const n = i + 1;
                  const state = !t ? "line" : n < t.step || shipped ? "done" : n === t.step ? "now" : "todo";
                  const e = t?.steps.find(x => x.no === n);
                  const dates = [
                    e?.startedOn && `${L("เริ่ม", "Start", "開始")} ${shortDay(e.startedOn, lang)}`,
                    e?.finishedOn && `${L("เสร็จ", "Done", "完了")} ${shortDay(e.finishedOn, lang)}`,
                  ].filter(Boolean).join(" · ");
                  const fallback = !t ? "" : state === "done" ? L("ผ่านแล้ว", "Done", "完了") : state === "now" ? L("กำลังทำ", "In progress", "作業中") : "";
                  return (
                    <li key={s.en} data-state={state} className={hot === n ? "hot" : undefined} aria-current={state === "now" ? "step" : undefined}
                      onMouseEnter={() => setHot(n)} onMouseLeave={() => setHot(null)}>
                      <span className="mark ax-mono" aria-hidden="true">{state === "done" ? "✓" : String(n).padStart(2, "0")}</span>
                      <span className="name">{L(s.th, s.en, s.ja)}</span>
                      <span className="when">{dates || fallback}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {t && ship && (
              <div className="tk-ship" data-state={ship} role="group" aria-label={L("สถานะการจัดส่ง", "Delivery status", "配送状況")}>
                <span className="lbl">{L("การจัดส่ง", "Delivery", "配送")}</span>
                <b className="state">
                  {ship === "arrived" ? L("ได้รับของแล้ว", "Delivered", "お届け済み")
                    : ship === "sent" ? L("ส่งออกจากโรงงานแล้ว · กำลังขนส่ง", "Left the factory · on its way", "工場から発送済み · 配送中")
                    : L("ยังไม่จัดส่ง", "Not shipped yet", "未発送")}
                </b>
                {ship !== "waiting" && (parcel ? (
                  <span className="parcel">
                    {t.shipment?.courier ? `${t.shipment.courier} · ` : ""}{L("เลขพัสดุ", "Tracking no.", "追跡番号")} <b className="ax-mono">{parcel}</b>
                    <button type="button" className="copy" onClick={() => copyParcel(parcel)}>{copied ? L("คัดลอกแล้ว", "Copied", "コピーしました") : L("คัดลอก", "Copy", "コピー")}</button>
                  </span>
                ) : (
                  <span className="parcel">{L("เลขพัสดุ: ", "Tracking no.: ", "追跡番号: ")}<a href="#contact">{L("สอบถามทีมงาน", "ask our team", "お問い合わせください")}</a></span>
                ))}
                {ship !== "waiting" && t.shipment?.shippedAt && <span>{L("ส่งเมื่อ", "Sent", "発送日")} {shortDay(t.shipment.shippedAt, lang)}</span>}
                {ship === "arrived" && t.shipment?.deliveredAt && <span>{L("ได้รับเมื่อ", "Arrived", "お届け日")} {shortDay(t.shipment.deliveredAt, lang)}</span>}
                {ship === "waiting" && t.dueDate && <span>{L("กำหนดผลิตเสร็จ", "Due", "完成予定")} {shortDay(t.dueDate, lang)}</span>}
              </div>
            )}

            {t && (
              <>
                <p className="tk-meta">
                  {L("อัปเดต", "Updated", "更新")} {new Date(t.updatedAt).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" })}
                  {" · "}{L("หน้านี้อัปเดตตามโรงงาน กลับมาดูได้ด้วยเลขเดิม", "this page follows the factory", "工場の進捗と連動しています")}
                </p>
                <div className="tk-actions">
                  <button type="button" className="ax-btn ghost" onClick={another}>{L("ค้นหาออเดอร์อื่น", "Track another order", "別の注文を調べる")}</button>
                  <Link href="/account" className="ax-btn ghost">{L("ออเดอร์ของฉัน", "My orders", "注文履歴")}</Link>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
