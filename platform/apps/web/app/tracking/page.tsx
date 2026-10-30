"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import StoreHeader from "../../components/StoreHeader";
import { RingCursor, Words } from "../../components/ScrollStory";
import ProcessStory, { shortDay, walkTo, type TrackView } from "../../components/ProcessStory";
import SiteFooter from "../../components/SiteFooter";
import { STEPS, SHIP_STEP } from "../../lib/production-steps";
import { apiFetch } from "../../lib/api";
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
  const [lang, setLang] = useState<"th" | "en">("th");
  const th = lang === "th";
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [t, setT] = useState<Tracked | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function lookup(raw: string) {
    const q = raw.replace(/\s+/g, "").toUpperCase();
    if (!q) { setErr(th ? "กรอกเลขออเดอร์ก่อน" : "Enter your order number"); return; }
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
      setErr(e.message || (th ? "ค้นหาไม่สำเร็จ" : "Couldn't look that up"));
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
    : t.status === "pending" ? (th ? "รอชำระเงิน · เริ่มผลิตหลังชำระ" : "Awaiting payment")
    : t.step === 0 ? (th ? "รอเข้าไลน์ผลิต" : "Waiting to start")
    : shipped ? (th ? "จัดส่งแล้ว" : "Shipped")
    : th ? `ขั้นที่ ${t.step} จาก ${SHIP_STEP} · ${t.stepName}` : `Step ${t.step} of ${SHIP_STEP} · ${STEPS[t.step - 1]?.en}`;

  const hero = (
    <>
      <span className="ax-kicker">{th ? "ติดตามงาน · ไลน์ผลิต 3D" : "Track your order · 3D line"}</span>
      <h1 className="ax-display"><Words text={th ? "งานของคุณ\n*อยู่ตรงไหน" : "Where's\n*your *kit"} /></h1>
      <form className="ax-track-form" onSubmit={e => { e.preventDefault(); lookup(no); }}>
        <input ref={input} className="ax-field" value={no} onChange={e => setNo(e.target.value)} maxLength={40}
          placeholder={th ? "เลขออเดอร์ เช่น AX-261029-K7QZ" : "Order number, e.g. AX-261029-K7QZ"}
          aria-label={th ? "เลขออเดอร์" : "Order number"} autoComplete="off" spellCheck={false} />
        <button type="submit" className="ax-btn solid sq" disabled={busy}>{busy ? "…" : th ? "ติดตาม" : "Track"}</button>
      </form>
      {err && <p className="ax-err" role="alert">{err}</p>}
      {t ? (
        <div className="ax-track-card" role="status">
          <div className="top">
            <b className="ax-mono">{t.orderNo}</b>
            <span>{t.qty} {th ? "ตัว" : "pcs"}{t.product ? ` · ${t.product}` : ""}</span>
          </div>
          <div className="now">{head}</div>
          {!closed && (
            <ol className="ax-proc-bar" aria-hidden="true">
              {STEPS.map((_, k) => <li key={k} data-done={k < t.step - 1 || shipped ? "" : undefined} data-now={k === t.step - 1 && !shipped ? "" : undefined} />)}
            </ol>
          )}
          <div className="meta">
            {t.shipment?.trackingNo && <span>{th ? "พัสดุ" : "Parcel"}: <b className="ax-mono">{t.shipment.courier ? `${t.shipment.courier} · ` : ""}{t.shipment.trackingNo}</b></span>}
            {t.dueDate && !shipped && !closed && <span>{th ? "กำหนดผลิตเสร็จ" : "Due"} {shortDay(t.dueDate, th)}</span>}
            <span>{th ? "อัปเดต" : "Updated"} {new Date(t.updatedAt).toLocaleString(th ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          {t.step >= 1 && !closed && (
            <button type="button" className="ax-story-link" onClick={() => walkTo(Math.min(t.step, SHIP_STEP))}>
              {th ? `ไปดูขั้นที่ ${Math.min(t.step, SHIP_STEP)} ในไลน์ผลิต` : `See step ${Math.min(t.step, SHIP_STEP)} on the line`} <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>
      ) : (
        <p>{th
          ? "กรอกเลขออเดอร์ แล้วไลน์ผลิตจะพาไปที่ขั้นที่เสื้อของคุณอยู่ตอนนี้ หรือเลื่อนลงเพื่อดูทั้ง 10 ขั้นตั้งแต่ไฟล์ถึงรถส่งของ"
          : "Enter your order number and the line takes you to the step your kit is at, or scroll to walk all ten steps from file to truck."}</p>
      )}
    </>
  );

  const finale = t ? (
    <>
      <span className="ax-kicker">{t.orderNo}</span>
      <h2 className="ax-display"><Words text={shipped ? (th ? "*ออกเดินทาง\nแล้ว" : "On its *way") : (th ? "กำลัง*ผลิต\nให้ทีมคุณ" : "In the *works")} /></h2>
      <p>{shipped
        ? (th ? `ส่งออกจากโรงงานแล้ว${t.shipment?.trackingNo ? ` · เลขพัสดุ ${t.shipment.courier ? t.shipment.courier + " " : ""}${t.shipment.trackingNo}` : ""}` : `Left the factory${t.shipment?.trackingNo ? ` · tracking ${t.shipment.trackingNo}` : ""}`)
        : (th ? `ตอนนี้อยู่${head ? ` ${head}` : ""} — หน้านี้อัปเดตตามโรงงาน กลับมาดูได้ทุกเมื่อด้วยเลขออเดอร์เดิม` : "This page follows the factory — come back any time with the same order number.")}</p>
      <div className="ax-row" style={{ justifyContent: "center" }}>
        <button type="button" className="ax-btn solid" onClick={again}>{th ? "ค้นหาออเดอร์อื่น" : "Track another order"}</button>
        <Link href="/account" className="ax-btn ghost">{th ? "ออเดอร์ของฉัน" : "My orders"}</Link>
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
          { href: "/", label: th ? "หน้าแรก" : "Home" },
          { href: "/shop", label: th ? "คอลเลกชัน" : "Collection" },
          { href: "/tracking", label: th ? "ติดตามงาน" : "Track order" },
          { href: "/#contact", label: th ? "ติดต่อ" : "Contact" },
        ]}
      />
      <main>
        <ProcessStory th={th} hero={hero} track={closed ? null : t} finale={finale} />
      </main>
      <SiteFooter th={th} />
    </div>
  );
}
