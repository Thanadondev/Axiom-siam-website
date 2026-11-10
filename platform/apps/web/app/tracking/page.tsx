"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import StoreHeader from "../../components/StoreHeader";
import { RingCursor, Words } from "../../components/ScrollStory";
import ProcessStory, { shortDay, walkTo, type TrackView } from "../../components/ProcessStory";
import SiteFooter from "../../components/SiteFooter";
import { STEPS, SHIP_STEP } from "../../lib/production-steps";
import { apiFetch } from "../../lib/api";
import { tri, locale, useLang } from "../../lib/i18n";
import "../app.css"; // UserMenu styles
import "../home.css";

interface Tracked extends TrackView {
  status: string;
  statusLabel: string;
  stepName: string;
  qty: number;
  product?: string | null;
  updatedAt: string;
  shipment: { courier: string | null; trackingNo: string | null; shippedAt?: string | null; deliveredAt?: string | null } | null;
}

/**
 * /tracking — type the order number to see all ten steps with the factory's
 * dates, and a button down to the job's station on the 3D production line.
 * Without a number it is the walk down the line (what /process used to be).
 */
export default function TrackingPage() {
  const [lang, setLang] = useLang();
  const th = lang === "th";
  const L = tri(lang);
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [t, setT] = useState<Tracked | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function copyParcel(no: string) {
    try { await navigator.clipboard.writeText(no); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* the number is on screen to copy by hand */ }
  }

  async function lookup(raw: string) {
    const q = raw.replace(/\s+/g, "").toUpperCase();
    if (!q) { setErr(L("กรอกเลขออเดอร์ก่อน", "Enter your order number", "注文番号を入力してください")); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch<Tracked>(`/orders/track/${encodeURIComponent(q)}`);
      setT(r);
      setNo(r.orderNo);
      const u = new URL(window.location.href);
      u.searchParams.set("no", r.orderNo);
      u.searchParams.delete("step");
      window.history.replaceState(null, "", u.toString());
    } catch (e: any) {
      setT(null);
      setErr(e.message || (L("ค้นหาไม่สำเร็จ", "Couldn't look that up", "検索できませんでした")));
    } finally { setBusy(false); }
  }

  // /tracking?no=AX-… (the link on each order) looks it up straight away
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("no");
    if (q) { setNo(q); lookup(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // back to the search: a cut to the top, not a ride back past all ten stations
  const again = () => { walkTo(0); window.setTimeout(() => input.current?.focus({ preventScroll: true }), 300); };
  const shipped = t ? t.step >= SHIP_STEP : false;
  const closed = t ? ["cancelled", "refunded"].includes(t.status) : false;
  const arrived = t ? ["delivered", "completed"].includes(t.status) || Boolean(t.shipment?.deliveredAt) : false;
  /** delivery: not sent yet → on its way → arrived */
  const ship = !t || closed ? null : arrived ? "arrived" : shipped ? "sent" : "waiting";
  const parcel = t?.shipment?.trackingNo ?? null;
  const head = !t ? "" : closed ? t.statusLabel
    : t.status === "pending" ? (L("รอชำระเงิน · เริ่มผลิตหลังชำระ", "Awaiting payment", "お支払い待ち"))
    : t.step === 0 ? (L("รอเข้าไลน์ผลิต", "Waiting to start", "生産開始待ち"))
    : arrived ? (L("ได้รับของแล้ว", "Delivered", "お届け済み"))
    : shipped ? (L("จัดส่งแล้ว", "Shipped", "発送済み"))
    : L(`ขั้นที่ ${t.step} จาก ${SHIP_STEP} · ${t.stepName}`, `Step ${t.step} of ${SHIP_STEP} · ${STEPS[t.step - 1]?.en}`, `工程 ${t.step} / ${SHIP_STEP} · ${STEPS[t.step - 1]?.ja}`);

  const hero = (
    <>
      <span className="ax-kicker">{L("ติดตามงาน · ไลน์ผลิต 3D", "Track your order · 3D line", "注文追跡 · 3D生産ライン")}</span>
      <h1 className={`ax-display${t ? " ax-track-compact" : ""}`}><Words text={L("งานของคุณ\n*อยู่ตรงไหน", "Where's\n*your *kit", "ご注文は\n*いまどこ?")} /></h1>
      <form className="ax-track-form" onSubmit={e => { e.preventDefault(); lookup(no); }}>
        <input ref={input} className="ax-field" value={no} onChange={e => setNo(e.target.value)} maxLength={40}
          placeholder={L("เลขออเดอร์ เช่น AX-261029-K7QZ หรือ HJ-447", "Order number, e.g. AX-261029-K7QZ or HJ-447", "注文番号 例: HJ-447")}
          aria-label={L("เลขออเดอร์", "Order number", "注文番号")} autoComplete="off" spellCheck={false} />
        <button type="submit" className="ax-btn solid sq" disabled={busy}>{busy ? "…" : L("ติดตาม", "Track", "追跡")}</button>
      </form>
      {err && <p className="ax-err" role="alert">{err}</p>}
      {t ? (
        <div className="ax-track-card" role="status">
          <div className="top">
            <b className="ax-mono">{t.orderNo}</b>
            <span>{t.qty} {L("ตัว", "pcs", "枚")}{t.product ? ` · ${t.product}` : ""}</span>
          </div>
          <div className="now">{head}</div>
          {!closed && (
            <ol className="ax-track-steps" aria-label={L("ลำดับขั้นตอนผลิตทั้งหมด", "All production steps", "全製造工程")}>
              {STEPS.map((s, i) => {
                const n = i + 1;
                const state = n < t.step || shipped ? "done" : n === t.step ? "now" : "todo";
                const e = t.steps.find(x => x.no === n);
                const dates = [
                  e?.startedOn && `${L("เริ่ม", "Start", "開始")} ${shortDay(e.startedOn, lang)}`,
                  e?.finishedOn && `${L("เสร็จ", "Done", "完了")} ${shortDay(e.finishedOn, lang)}`,
                ].filter(Boolean).join(" · ");
                const fallback = state === "done" ? L("ผ่านแล้ว", "Done", "完了") : state === "now" ? L("กำลังทำ", "In progress", "作業中") : L("ยังไม่ถึง", "Not yet", "未着手");
                return (
                  <li key={s.en} data-state={state} aria-current={state === "now" ? "step" : undefined}>
                    <span className="mark ax-mono" aria-hidden="true">{state === "done" ? "✓" : String(n).padStart(2, "0")}</span>
                    <span className="name">{L(s.th, s.en, s.ja)}</span>
                    <span className="when">{dates || fallback}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {ship && (
            <div className="ax-track-ship" data-state={ship} role="group" aria-label={L("สถานะการจัดส่ง", "Delivery status", "配送状況")}>
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
                <span className="parcel">{L("เลขพัสดุ: ", "Tracking no.: ", "追跡番号: ")}<a href="/#contact">{L("สอบถามทีมงาน", "ask our team", "お問い合わせください")}</a></span>
              ))}
              {ship !== "waiting" && t.shipment?.shippedAt && <span>{L("ส่งเมื่อ", "Sent", "発送日")} {shortDay(t.shipment.shippedAt, lang)}</span>}
              {ship === "arrived" && t.shipment?.deliveredAt && <span>{L("ได้รับเมื่อ", "Arrived", "お届け日")} {shortDay(t.shipment.deliveredAt, lang)}</span>}
              {ship === "waiting" && t.dueDate && <span>{L("กำหนดผลิตเสร็จ", "Due", "完成予定")} {shortDay(t.dueDate, lang)}</span>}
            </div>
          )}
          <div className="meta">
            <span>{L("อัปเดต", "Updated", "更新")} {new Date(t.updatedAt).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          {t.step >= 1 && !closed && (
            <button type="button" className="ax-story-link" onClick={() => walkTo(Math.min(t.step, SHIP_STEP))}>
              {L(`ไปดูขั้นที่ ${Math.min(t.step, SHIP_STEP)} ในไลน์ผลิต`, `See step ${Math.min(t.step, SHIP_STEP)} on the line`, `ラインで工程${Math.min(t.step, SHIP_STEP)}を見る`)} <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <p>{L("กรอกเลขออเดอร์เพื่อดูว่างานอยู่ขั้นไหน พร้อมวันที่ของทุกขั้น หรือเลื่อนลงเพื่อเดินดูไลน์ผลิตทั้ง 10 ขั้น", "Enter your order number to see which step your kit is at, with the dates of every step, or scroll to walk the ten steps of the line.", "注文番号を入力すると、現在の工程と各工程の日付をご確認いただけます。スクロールすれば、生産ラインの全10工程もご覧いただけます。")}</p>
          <ol className="ax-proc-list ax-track-preview">
            {STEPS.map((s, i) => <li key={s.en}><b>{String(i + 1).padStart(2, "0")}</b> {L(s.th, s.en, s.ja)}</li>)}
          </ol>
        </>
      )}
    </>
  );

  const finale = t ? (
    <>
      <span className="ax-kicker">{t.orderNo}</span>
      <h2 className="ax-display"><Words text={arrived ? (L("*ถึงมือ\nคุณแล้ว", "*Delivered", "*お届け済み")) : shipped ? (L("*ออกเดินทาง\nแล้ว", "On its *way", "*発送済み")) : (L("กำลัง*ผลิต\nให้ทีมคุณ", "In the *works", "*製作中"))} /></h2>
      <p>{arrived
        ? (L(`ทีมคุณได้รับเสื้อแล้ว${t.shipment?.deliveredAt ? ` เมื่อ ${shortDay(t.shipment.deliveredAt, lang)}` : ""} · ขอบคุณที่ใช้บริการ`, `Your team has the kit${t.shipment?.deliveredAt ? ` since ${shortDay(t.shipment.deliveredAt, lang)}` : ""} — thank you.`, `ユニフォームはお手元に届いています${t.shipment?.deliveredAt ? `(${shortDay(t.shipment.deliveredAt, lang)})` : ""}。ありがとうございました。`))
        : shipped
        ? (L(`ส่งออกจากโรงงานแล้ว${t.shipment?.trackingNo ? ` · เลขพัสดุ ${t.shipment.courier ? t.shipment.courier + " " : ""}${t.shipment.trackingNo}` : ""}`, `Left the factory${t.shipment?.trackingNo ? ` · tracking ${t.shipment.trackingNo}` : ""}`, `工場から発送しました${t.shipment?.trackingNo ? ` · 追跡番号 ${t.shipment.trackingNo}` : ""}`))
        : (L(`ตอนนี้อยู่${head ? ` ${head}` : ""} — หน้านี้อัปเดตตามโรงงาน กลับมาดูได้ทุกเมื่อด้วยเลขออเดอร์เดิม`, "This page follows the factory — come back any time with the same order number.", "このページは工場の進捗と連動しています。同じ注文番号でいつでもご確認いただけます。"))}</p>
      <div className="ax-row" style={{ justifyContent: "center" }}>
        <button type="button" className="ax-btn solid" onClick={again}>{L("ค้นหาออเดอร์อื่น", "Track another order", "別の注文を調べる")}</button>
        <Link href="/account" className="ax-btn ghost">{L("ออเดอร์ของฉัน", "My orders", "注文履歴")}</Link>
      </div>
    </>
  ) : undefined;

  return (
    <div className="ax ax-landing" lang={lang}>
      <RingCursor />
      <StoreHeader
        lang={lang}
        onLang={setLang}
        nav={[
          { href: "/", label: L("หน้าแรก", "Home", "ホーム") },
          { href: "/shop", label: L("คอลเลกชัน", "Collection", "コレクション") },
          { href: "/tracking", label: L("ติดตามงาน", "Track order", "注文追跡") },
          { href: "/#contact", label: L("ติดต่อ", "Contact", "お問い合わせ") },
        ]}
      />
      <main>
        <ProcessStory lang={lang} hero={hero} track={closed ? null : t} finale={finale} />
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
