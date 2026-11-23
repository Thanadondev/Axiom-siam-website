"use client";

import { useEffect, useRef, useState } from "react";
import { STEPS, SHIP_STEP } from "../lib/production-steps";
import { tri, type Lang } from "../lib/i18n";

/**
 * Where each of the ten steps happens on the factory picture (public/factory/factory-*.webp),
 * in % of the picture, projected from the Blender camera VIEW_overview like FactoryHome's SPOTS.
 * `near` is the station whose flight (fly-<id>.mp4) and close-up (<id>-*.webp) show that step best.
 */
export const STOPS: { at: [number, number]; near: string }[] = [
  { at: [17.6, 39.8], near: "office" },     // 1 artwork: the design room
  { at: [8.6, 76.5], near: "printing" },    // 2 printing
  { at: [21.8, 73.5], near: "heatpress" },  // 3 heat transfer
  { at: [34.2, 72.3], near: "laser" },      // 4 laser cutting
  { at: [45.7, 69.0], near: "sewing" },     // 5 QC tables before the sewing line
  { at: [55.3, 67.4], near: "sewing" },     // 6 sewing
  { at: [65.7, 69.7], near: "sewing" },     // 7 QC before packing (dress forms)
  { at: [70.2, 68.8], near: "sewing" },     // 8 size-label presses
  { at: [77.8, 66.8], near: "shipping" },   // 9 press & pack
  { at: [89.9, 64.3], near: "shipping" },   // 10 the trucks
];

const FLY_WAIT_MS = 2500;

/**
 * The factory from above with the line drawn through it: the ten stops in order, the part the
 * order has passed in solid accent, a pin on the step it is at. `step` 0 = not started,
 * 1–10 = at that step (10 = shipped); null = no order looked up (just the line, numbered).
 * `hot` is the stop the list next to it is pointing at.
 */
export default function FactoryTrack({ lang, step, hot, onHot }: {
  lang: Lang;
  step: number | null;
  hot: number | null;
  onHot: (n: number | null) => void;
}) {
  const L = tri(lang);
  const [motion, setMotion] = useState(false);
  const [near, setNear] = useState<string | null>(null);   // the station being looked at up close
  const [still, setStill] = useState(false);              // showing the close-up picture (no video)
  const [flying, setFlying] = useState(false);
  const fly = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // phones: the picture scrolls sideways — bring the order's stop (or the middle) into view
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const x = step && step >= 1 ? STOPS[step - 1].at[0] / 100 : 0.5;
    el.scrollTo({ left: x * el.scrollWidth - el.clientWidth / 2, behavior: "smooth" });
  }, [step]);

  // a new lookup goes back to the whole factory
  useEffect(() => { back(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function look(id: string) {
    clearTimeout(timer.current);
    setNear(id); setStill(false); setFlying(false);
    const v = fly.current;
    if (!motion || !v) { setStill(true); return; }
    v.src = `/factory/fly-${id}.mp4`;
    let started = false;
    v.onplaying = () => { started = true; setFlying(true); };
    v.play().catch(() => { if (!started) setStill(true); });
    timer.current = setTimeout(() => { if (!started) { v.pause(); setStill(true); } }, FLY_WAIT_MS);
  }
  function back() {
    clearTimeout(timer.current);
    fly.current?.pause();
    setNear(null); setStill(false); setFlying(false);
  }

  const at = step ?? 0;
  const pts = STOPS.map(s => `${s.at[0]},${s.at[1]}`);
  const done = at >= 1 ? pts.slice(0, at).join(" ") : "";
  const cur = at >= 1 ? STOPS[at - 1] : null;
  const name = (n: number) => L(STEPS[n - 1].th, STEPS[n - 1].en, STEPS[n - 1].ja);

  return (
    <div className={"tk-map" + (near ? " near" : "")}>
      <div className="tk-scroll" ref={scroller}>
        <div className="tk-scene">
          <img className="tk-img" src="/factory/factory-1600.webp"
            srcSet="/factory/factory-1600.webp 1600w, /factory/factory-2560.webp 2560w" sizes="(max-width: 760px) 900px, 66vw"
            alt={L("ไลน์ผลิตของโรงงาน Axiom Siam มุมสูง", "The Axiom Siam production line from above", "Axiom Siam 工場の生産ライン全景")} draggable={false} />
          {motion && <video className="tk-img" src="/factory/loop.mp4" poster="/factory/factory-1600.webp" autoPlay muted loop playsInline aria-hidden="true" />}

          {/* the line: all ten stops dashed, the part already done solid */}
          <svg className="tk-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline className="all" points={pts.join(" ")} />
            {done && at >= 2 && <polyline className="done" points={done} />}
          </svg>

          {STOPS.map((s, i) => {
            const n = i + 1;
            const state = step === null ? "line" : n < at || at === SHIP_STEP ? "done" : n === at ? "now" : "todo";
            return (
              <button key={n} type="button" className={"tk-stop" + (hot === n ? " hot" : "")} data-state={state}
                style={{ left: `${s.at[0]}%`, top: `${s.at[1]}%` }}
                onMouseEnter={() => onHot(n)} onMouseLeave={() => onHot(null)} onFocus={() => onHot(n)} onBlur={() => onHot(null)}
                onClick={() => look(s.near)}
                aria-label={`${n} · ${name(n)} — ${L("ดูใกล้ๆ", "look closer", "近くで見る")}`}>
                <span aria-hidden="true">{state === "done" ? "✓" : n}</span>
                <i className="tk-tip" aria-hidden="true">{String(n).padStart(2, "0")} · {name(n)}</i>
              </button>
            );
          })}

          {cur && (
            <div className="tk-pin" style={{ left: `${cur.at[0]}%`, top: `${cur.at[1]}%` }} data-right={cur.at[0] > 75 || undefined}>
              <span className="tk-pill">
                <small>{at === SHIP_STEP ? L("จัดส่งแล้ว", "Shipped", "発送済み") : L("งานของคุณอยู่ที่นี่", "Your order is here", "ご注文はここ")}</small>
                <b>{String(at).padStart(2, "0")} · {name(at)}</b>
              </span>
            </div>
          )}

          {/* up close: the camera flies down to the station (or its picture, without video) */}
          <video ref={fly} className={"tk-fly" + (flying ? " on" : "")} muted playsInline preload="none" aria-hidden="true" onClick={back} />
          {near && <img className={"tk-near" + (still ? " on" : "")} src={`/factory/${near}-1600.webp`}
            srcSet={`/factory/${near}-1600.webp 1600w, /factory/${near}-2560.webp 2560w`} sizes="(max-width: 760px) 900px, 66vw"
            alt="" onClick={back} draggable={false} />}
        </div>
      </div>
      <div className="tk-mapbar">
        {near
          ? <button type="button" className="tk-back" onClick={back}>← {L("กลับไปดูทั้งโรงงาน", "Back to the whole factory", "工場全体に戻る")}</button>
          : cur
            ? <button type="button" className="tk-back" onClick={() => look(cur.near)}>{L("ดูใกล้ๆ ตรงที่งานอยู่", "Look closer where it is", "近くで見る")} →</button>
            : <span>{L("แตะเลขบนภาพเพื่อดูแต่ละจุดใกล้ๆ", "Tap a number to look closer", "番号をタップして近くで見る")}</span>}
      </div>
    </div>
  );
}
