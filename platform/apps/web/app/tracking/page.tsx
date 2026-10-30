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
  shipment: { courier: string | null; trackingNo: string | null; shippedAt?: string | null } | null;
}

/**
 * /tracking — type the order number, and the 3D production line walks to the
 * station the job is at, with the factory's dates on every step. Without a
 * number it is the walk down the line (what /process used to be).
 */
export default function TrackingPage() {
  const [lang, setLang] = useLang();
  const th = lang === "th";
  const L = tri(lang);
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [t, setT] = useState<Tracked | null>(null);
  const input = useRef<HTMLInputElement>(null);

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

  const again = () => { window.scrollTo({ top: 0, behavior: "smooth" }); window.setTimeout(() => input.current?.focus(), 400); };
  const shipped = t ? t.step >= SHIP_STEP : false;
  const closed = t ? ["cancelled", "refunded"].includes(t.status) : false;
  const head = !t ? "" : closed ? t.statusLabel
    : t.status === "pending" ? (L("รอชำระเงิน · เริ่มผลิตหลังชำระ", "Awaiting payment", "お支払い待ち"))
    : t.step === 0 ? (L("รอเข้าไลน์ผลิต", "Waiting to start", "生産開始待ち"))
    : shipped ? (L("จัดส่งแล้ว", "Shipped", "発送済み"))
    : L(`ขั้นที่ ${t.step} จาก ${SHIP_STEP} · ${t.stepName}`, `Step ${t.step} of ${SHIP_STEP} · ${STEPS[t.step - 1]?.en}`, `工程 ${t.step} / ${SHIP_STEP} · ${STEPS[t.step - 1]?.ja}`);

  const hero = (
    <>
      <span className="ax-kicker">{L("ติดตามงาน · ไลน์ผลิต 3D", "Track your order · 3D line", "注文追跡 · 3D生産ライン")}</span>
      <h1 className="ax-display"><Words text={L("งานของคุณ\n*อยู่ตรงไหน", "Where's\n*your *kit", "ご注文は\n*いまどこ?")} /></h1>
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
            <ol className="ax-proc-bar" aria-hidden="true">
              {STEPS.map((_, k) => <li key={k} data-done={k < t.step - 1 || shipped ? "" : undefined} data-now={k === t.step - 1 && !shipped ? "" : undefined} />)}
            </ol>
          )}
          <div className="meta">
            {t.shipment?.trackingNo && <span>{L("พัสดุ", "Parcel", "配送")}: <b className="ax-mono">{t.shipment.courier ? `${t.shipment.courier} · ` : ""}{t.shipment.trackingNo}</b></span>}
            {t.dueDate && !shipped && !closed && <span>{L("กำหนดผลิตเสร็จ", "Due", "完成予定")} {shortDay(t.dueDate, lang)}</span>}
            <span>{L("อัปเดต", "Updated", "更新")} {new Date(t.updatedAt).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          {t.step >= 1 && !closed && (
            <button type="button" className="ax-story-link" onClick={() => walkTo(Math.min(t.step, SHIP_STEP))}>
              {L(`ไปดูขั้นที่ ${Math.min(t.step, SHIP_STEP)} ในไลน์ผลิต`, `See step ${Math.min(t.step, SHIP_STEP)} on the line`, `ラインで工程${Math.min(t.step, SHIP_STEP)}を見る`)} <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>
      ) : (
        <p>{L("กรอกเลขออเดอร์ แล้วไลน์ผลิตจะพาไปที่ขั้นที่เสื้อของคุณอยู่ตอนนี้ หรือเลื่อนลงเพื่อดูทั้ง 10 ขั้นตั้งแต่ไฟล์ถึงรถส่งของ", "Enter your order number and the line takes you to the step your kit is at, or scroll to walk all ten steps from file to truck.", "注文番号を入力すると、ユニフォームがいまどの工程にあるかを生産ラインがご案内します。スクロールすれば、データ作成から出荷までの全10工程もご覧いただけます。")}</p>
      )}
    </>
  );

  const finale = t ? (
    <>
      <span className="ax-kicker">{t.orderNo}</span>
      <h2 className="ax-display"><Words text={shipped ? (L("*ออกเดินทาง\nแล้ว", "On its *way", "*発送済み")) : (L("กำลัง*ผลิต\nให้ทีมคุณ", "In the *works", "*製作中"))} /></h2>
      <p>{shipped
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
