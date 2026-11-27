"use client";

import { useEffect, useRef, useState } from "react";
import { STEPS, SHIP_STEP } from "../lib/production-steps";
import { tri, type Lang } from "../lib/i18n";
import { videoOk } from "../lib/motion";
import { TRACK_MAP } from "../lib/track-map";

/**
 * The /tracking picture is the factory with the line built into it in 3D (public/factory/tracking-*.webp,
 * AXIOM-WEB\3D Factory\web_render\track_route.py + render_track.py): a lit walkway from the printers to
 * the truck, an arc from the design room to the printers, and a numbered sign at each of the ten steps.
 * TRACK_MAP (lib/track-map.ts, written from render_track.py's track_map.json) says where the signs and
 * the route land in the picture, in %. Each step has its own flight from this picture down to it,
 * fly-step-<n>.mp4, whose last frame is step-<n>-1600.webp (shown instead without video): web_render
 * track_views.py (the ten cameras) + run_track_anim.sh.
 */
export const STOPS = TRACK_MAP.signs.map(at => ({ at: at as [number, number] }));

const FLY_WAIT_MS = 2500;

/**
 * The factory from above with the line in it: the part the order has passed drawn over the route
 * in accent, a ✓ on the signs it has passed, a pin on the step it is at. `step` 0 = not started,
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
  const [near, setNear] = useState<number | null>(null);   // the step being looked at up close
  const [still, setStill] = useState(false);              // showing the close-up picture (no video)
  const [flying, setFlying] = useState(false);
  const fly = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setMotion(videoOk()), []);
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

  function look(n: number) {
    clearTimeout(timer.current);
    setNear(n); setStill(false); setFlying(false);
    const v = fly.current;
    if (!motion || !v) { setStill(true); return; }
    v.src = `/factory/fly-step-${n}.mp4`;
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
  const upto = at >= 2 ? TRACK_MAP.at[Math.min(at, SHIP_STEP) - 1] : -1;
  const done = upto > 0 ? TRACK_MAP.route.slice(0, upto + 1).map(p => `${p[0]},${p[1]}`).join(" ") : "";
  const cur = at >= 1 ? STOPS[at - 1] : null;
  const name = (n: number) => L(STEPS[n - 1].th, STEPS[n - 1].en, STEPS[n - 1].ja);

  return (
    <div className={"tk-map" + (near ? " near" : "")}>
      <div className="tk-scroll" ref={scroller}>
        <div className="tk-scene">
          <img className="tk-img" src="/factory/tracking-1600.webp"
            srcSet="/factory/tracking-1600.webp 1600w, /factory/tracking-2560.webp 2560w" sizes="(max-width: 760px) 900px, 66vw"
            alt={L("ไลน์ผลิตของโรงงาน Axiom Siam มุมสูง", "The Axiom Siam production line from above", "Axiom Siam 工場の生産ライン全景")} draggable={false} />
          {/* the part of the route the order has passed */}
          {done && (
            <svg className="tk-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline className="done" points={done} />
            </svg>
          )}

          {STOPS.map((s, i) => {
            const n = i + 1;
            const state = step === null ? "line" : n < at || at === SHIP_STEP ? "done" : n === at ? "now" : "todo";
            return (
              <button key={n} type="button" className={"tk-stop" + (hot === n ? " hot" : "")} data-state={state}
                style={{ left: `${s.at[0]}%`, top: `${s.at[1]}%` }}
                onMouseEnter={() => onHot(n)} onMouseLeave={() => onHot(null)} onFocus={() => onHot(n)} onBlur={() => onHot(null)}
                onClick={() => look(n)}
                aria-label={`${n} · ${name(n)} — ${L("ดูใกล้ๆ", "look closer", "近くで見る")}`}>
                {state === "done" && <span className="tk-tick" aria-hidden="true">✓</span>}
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
          {near && <img className={"tk-near" + (still ? " on" : "")} src={`/factory/step-${near}-1600.webp`}
            alt="" onClick={back} draggable={false} />}
        </div>
      </div>
      <div className="tk-mapbar">
        {near
          ? <button type="button" className="tk-back" onClick={back}>← {L("กลับไปดูทั้งโรงงาน", "Back to the whole factory", "工場全体に戻る")}</button>
          : cur
            ? <button type="button" className="tk-back" onClick={() => look(at)}>{L("ดูใกล้ๆ ตรงที่งานอยู่", "Look closer where it is", "近くで見る")} →</button>
            : <span>{L("แตะเลขบนภาพเพื่อดูแต่ละจุดใกล้ๆ", "Tap a number to look closer", "番号をタップして近くで見る")}</span>}
      </div>
    </div>
  );
}
