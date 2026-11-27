"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { tri, type Lang } from "../lib/i18n";
import { videoOk } from "../lib/motion";
import { isSoon } from "../lib/launch";
import { STATIONS, type Station, type T3 } from "../lib/stations";

const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";

/** where each station sits on the picture; the words come from lib/stations.ts */
type Spot = Station & {
  dot: [number, number];    // % of the picture: the machine
  tag: [number, number];    // % of the picture: where the label hangs (its bottom edge)
  right?: boolean;          // label leans left (near the right edge)
  cardRight?: boolean;      // zoomed in, the card goes on the right (the machine is on the left of the close-up)
  box: [number, number, number, number]; // % x0 y0 x1 y1: outline on hover, and where the zoom goes
};

/**
 * Positions come from the Blender factory (AXIOM-WEB\3D Factory\garment_web_v2.blend,
 * camera VIEW_overview at 40 mm, shift x 0.07, 2560x1440 cropped to rows 115-1196):
 * each station's machines projected into the render (render_v2.py),
 * labels staggered so neighbours don't overlap. Picture: public/factory/factory-*.webp.
 * Moving: public/factory/loop.mp4 is the overview with the workers at work (an 8 s seamless loop),
 * and fly-<id>.mp4 is the 3D camera flying from that overview down to the station's own camera
 * (VIEW_<station>); its last frame is public/factory/<id>-*.webp. Without video (reduced motion,
 * or a flight that doesn't start) the still overview zooms in CSS and the close-up fades in.
 */
const AT: Record<Station["id"], Omit<Spot, keyof Station>> = {
  printing: { cardRight: true, dot: [8.6, 76.5], tag: [8.6, 62.0], box: [2.5, 72.3, 14.6, 80.6] },
  heatpress: { cardRight: true, dot: [21.8, 73.5], tag: [21.8, 50.0], box: [17.1, 67.9, 26.5, 79.3] },
  laser: { dot: [34.2, 72.3], tag: [34.2, 60.0], box: [31.0, 65.8, 37.3, 78.8] },
  sewing: { dot: [55.3, 67.4], tag: [55.3, 50.0], box: [49.1, 58.5, 61.9, 77.0] },
  shipping: { right: true, dot: [89.9, 64.3], tag: [89.9, 52.0], box: [81.5, 56.0, 98.7, 72.6] },
  office: { dot: [17.6, 39.8], tag: [17.6, 27.0], box: [8.1, 32.2, 26.5, 47.7] },
};
const SPOTS: Spot[] = STATIONS.map(s => ({ ...s, ...AT[s.id] }));

const ZOOM_MS = 750;   // fallback zoom of the still picture (matches .fx-cam transition)
const FLY_WAIT_MS = 2500;   // a flight that hasn't started by then gives way to the fallback zoom

/** scale and shift that bring a station's box to the middle of the frame */
function camFor(s: Spot) {
  const [x0, y0, x1, y1] = s.box;
  const k = Math.min(3.2, 100 / ((x1 - x0) * 1.9), 100 / ((y1 - y0) * 1.9));
  // keep the picture filling the frame: the view's middle can't come closer than 50/k to an edge
  const m = 50 / k, clamp = (v: number) => Math.min(100 - m, Math.max(m, v));
  const cx = clamp((x0 + x1) / 2), cy = clamp((y0 + y1) / 2);
  return `scale(${k.toFixed(3)}) translate(${(50 - cx).toFixed(2)}%, ${(50 - cy).toFixed(2)}%)`;
}

export default function FactoryHome({ lang }: { lang: Lang }) {
  const L = tri(lang);
  const t = (x: T3) => L(x[0], x[1], x[2]);
  const [hot, setHot] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Spot | null>(null);   // the station being looked at
  const [near, setNear] = useState(false);               // arrived: the card is showing
  const [flying, setFlying] = useState<string | null>(null);  // the flight video on screen
  const [css, setCss] = useState(false);                 // fallback: zoom the still picture
  const [motion, setMotion] = useState(false);           // video allowed (not reduced motion), known after mount
  const loop = useRef<HTMLVideoElement>(null);
  const flights = useRef<Record<string, HTMLVideoElement | null>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const opener = useRef<HTMLElement | null>(null);

  // phones: the picture is wider than the screen — keep it on the middle of the floor
  const centre = () => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  };
  useEffect(centre, []);

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => setMotion(videoOk()), []);

  /** start loading a station's flight (on hover / focus, so the click plays at once) */
  const warm = (id: string) => {
    const v = flights.current[id];
    if (v && v.preload !== "auto") { v.preload = "auto"; v.load(); }
  };

  function zoomStill(s: Spot) {
    setFlying(null); setCss(true);
    timer.current = setTimeout(() => setNear(true), reduced() ? 0 : ZOOM_MS - 150);
  }

  function open(s: Spot, from: HTMLElement | null) {
    clearTimeout(timer.current);
    opener.current = from;
    setHot(null); setNear(false); setCss(false);
    setZoom(s);
    centre();
    const v = motion ? flights.current[s.id] : null;
    if (!v) { zoomStill(s); return; }
    warm(s.id);
    v.currentTime = 0;
    let started = false;
    v.onplaying = () => { started = true; setFlying(s.id); loop.current?.pause(); };
    v.onended = () => setNear(true);
    v.play().catch(() => { if (!started) zoomStill(s); });
    timer.current = setTimeout(() => { if (!started) { v.pause(); zoomStill(s); } }, FLY_WAIT_MS);
  }
  function back() {
    clearTimeout(timer.current);
    setNear(false); setFlying(null);
    loop.current?.play().catch(() => {});
    timer.current = setTimeout(() => {
      setZoom(null); setCss(false);
      Object.values(flights.current).forEach(v => { if (v) { v.pause(); v.onplaying = v.onended = null; } });
      opener.current?.focus();
    }, reduced() ? 0 : 350);
  }

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!zoom) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") back(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [zoom]);
  useEffect(() => { if (near) panel.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true }); }, [near]);

  const box = hot && !zoom ? SPOTS.find(s => s.id === hot)?.box : null;

  return (
    <section className={"fx" + (zoom ? " zoomed" : "")} aria-label={L("โรงงาน Axiom Siam", "The Axiom Siam factory", "Axiom Siam 工場")}>
      <p className="fx-hint">{L("แตะที่เครื่องจักรในโรงงานเพื่อเริ่ม", "Tap a machine in the factory to begin", "工場の機械をタップしてスタート")}</p>

      <div className="fx-frame">
        <div className="fx-scroll" ref={scroller}>
          <div className="fx-scene">
            {/* the overview: everything in here moves together when zooming */}
            <div className="fx-cam" style={{ transform: zoom && css ? camFor(zoom) : undefined }}>
              <img
                className="fx-img"
                src="/factory/factory-1600.webp"
                srcSet="/factory/factory-1600.webp 1600w, /factory/factory-2560.webp 2560w"
                sizes="(max-width: 760px) 900px, 100vw"
                alt={L("โรงงานผลิตเสื้อกีฬา Axiom Siam มุมสูง: เครื่องพิมพ์ รีดร้อน ตัดเลเซอร์ ไลน์เย็บ แพ็กและส่ง",
                  "Axiom Siam's sportswear factory from above: printing, heat press, laser cutting, sewing lines, packing and shipping",
                  "Axiom Siam のスポーツウェア工場の全景：プリント、ヒートプレス、レーザーカット、縫製、梱包・出荷")}
                draggable={false}
              />
              {motion && (
                <video ref={loop} className="fx-img fx-loop" src="/factory/loop.mp4" poster="/factory/factory-1600.webp"
                  autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
              )}
              {box && <span className="fx-box" style={{ left: `${box[0]}%`, top: `${box[1]}%`, width: `${box[2] - box[0]}%`, height: `${box[3] - box[1]}%` }} aria-hidden />}
              {SPOTS.map(s => <span key={s.id + "-dot"} className={"fx-dot" + (hot === s.id ? " on" : "")} style={{ left: `${s.dot[0]}%`, top: `${s.dot[1]}%` }} aria-hidden />)}
            </div>

            {/* labels sit outside the camera so they stay sharp; they fade while zoomed */}
            <div className="fx-spots" aria-hidden={!!zoom}>
              {SPOTS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={"fx-spot" + (s.right ? " right" : "") + (hot === s.id ? " on" : "")}
                  style={{ left: `${s.tag[0]}%`, top: `${s.tag[1]}%` }}
                  tabIndex={zoom ? -1 : 0}
                  onMouseEnter={() => { setHot(s.id); warm(s.id); }} onMouseLeave={() => setHot(null)}
                  onFocus={() => { setHot(s.id); warm(s.id); }} onBlur={() => setHot(null)}
                  onClick={e => open(s, e.currentTarget)}
                >
                  <span className="fx-line" style={{ height: `${s.dot[1] - s.tag[1]}cqh` }} aria-hidden />
                  <span className="fx-pill">
                    <small>{t(s.place)}</small>
                    <b>{t(s.title)}{s.href && isSoon(s.href) && <em className="ax-soon">Coming soon</em>}</b>
                  </span>
                </button>
              ))}
            </div>

            {/* the camera flight down to each station; it stays on its last frame when it lands */}
            {motion && SPOTS.map(s => (
              <video
                key={s.id + "-fly"}
                ref={el => { flights.current[s.id] = el; }}
                className={"fx-fly" + (flying === s.id ? " on" : "")}
                src={`/factory/fly-${s.id}.mp4`}
                muted playsInline preload="none" aria-hidden="true"
                onClick={near ? back : undefined}
              />
            ))}

            {/* fallback: the station's still close-up, faded in once the CSS zoom has arrived */}
            {SPOTS.map(s => (
              <img
                key={s.id + "-near"}
                className={"fx-near" + (near && css && zoom?.id === s.id ? " on" : "")}
                src={`/factory/${s.id}-1600.webp`}
                srcSet={`/factory/${s.id}-1600.webp 1600w, /factory/${s.id}-2560.webp 2560w`}
                sizes="(max-width: 760px) 900px, 100vw"
                alt=""
                loading={zoom?.id === s.id ? "eager" : "lazy"}
                draggable={false}
                onClick={back}
              />
            ))}
          </div>
        </div>

        {zoom && (
          <div ref={panel} className={"fx-panel" + (zoom.cardRight ? " right" : "") + (near ? " on" : "")} role="dialog" aria-label={t(zoom.place)}>
            <small>{t(zoom.place)}</small>
            <b>{t(zoom.title)}{zoom.href && isSoon(zoom.href) && <em className="ax-soon">Coming soon</em>}</b>
            <p>{t(zoom.about)}</p>
            {zoom.href
              ? <Link href={zoom.href} className="ax-btn solid">{L("ไปต่อ", "Go", "進む")} →</Link>
              : (
                <div className="fx-contact">
                  <a href={`mailto:${CONTACT_EMAIL}`} className="ax-btn solid">{CONTACT_EMAIL}</a>
                  <span>LINE: {CONTACT_LINE}</span>
                </div>
              )}
            <button type="button" className="fx-back" onClick={back}>← {L("กลับไปดูทั้งโรงงาน", "Back to the factory", "工場全体に戻る")}</button>
          </div>
        )}
      </div>

      {/* the same stations as a list, for phones and screen readers that skip the picture */}
      <nav className="fx-list" aria-label={L("ไปที่", "Go to", "移動")}>
        {SPOTS.map(s => (
          <button key={s.id} type="button" onClick={e => open(s, e.currentTarget)} onFocus={() => warm(s.id)} onPointerEnter={() => warm(s.id)}>
            <small>{t(s.place)}</small>{t(s.title)}{s.href && isSoon(s.href) && <em className="ax-soon">Coming soon</em>}
          </button>
        ))}
      </nav>
    </section>
  );
}
