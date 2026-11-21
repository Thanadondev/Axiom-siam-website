"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { tri, type Lang } from "../lib/i18n";
import { isSoon } from "../lib/launch";

const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";

type T3 = [string, string, string];
type Spot = {
  id: string;
  href?: string;            // no href = opens the contact card
  title: T3;                // what the button does
  place: T3;                // the station it sits on
  dot: [number, number];    // % of the picture: the machine
  tag: [number, number];    // % of the picture: where the label hangs (its bottom edge)
  right?: boolean;          // label leans left (near the right edge)
  box: [number, number, number, number]; // % x0 y0 x1 y1: outline on hover
};

/**
 * Positions come from the Blender factory (AXIOM-WEB\3D Factory\garment_web.blend,
 * camera VIEW_overview at 40 mm, shift x 0.07, 2560x1440 cropped to rows 115-1196):
 * each station's machines projected into the render (the sewing lines placed by eye),
 * labels staggered so neighbours don't overlap. Picture: public/factory/factory-*.webp.
 */
const SPOTS: Spot[] = [
  { id: "printing", href: "/order/bib", title: ["ออกแบบเอี๊ยม", "Design a bib", "ビブをデザイン"], place: ["เครื่องพิมพ์", "Printing", "プリント"],
    dot: [8.0, 74.1], tag: [8.0, 62.0], box: [3.4, 68.4, 12.4, 80.0] },
  { id: "heatpress", href: "/order/upload", title: ["ส่งไฟล์เอง", "Send your own file", "データ入稿"], place: ["เครื่องรีดร้อน", "Heat press", "ヒートプレス"],
    dot: [21.7, 73.4], tag: [21.7, 48.0], box: [17.4, 68.0, 25.8, 78.8] },
  { id: "laser", href: "/design", title: ["ออกแบบขั้นสูง", "Advanced designer", "詳細デザイン"], place: ["ตัดเลเซอร์", "Laser cutting", "レーザーカット"],
    dot: [34.8, 66.6], tag: [34.8, 60.0], box: [28.8, 55.2, 40.5, 78.7] },
  { id: "sewing", href: "/templates", title: ["ร้านแม่แบบ", "Template shop", "テンプレート"], place: ["ไลน์เย็บ", "Sewing line", "縫製ライン"],
    dot: [56.0, 64.0], tag: [56.0, 47.0], box: [49.5, 53.0, 62.5, 78.0] },
  { id: "shipping", href: "/tracking", right: true, title: ["ติดตามงาน", "Track order", "注文追跡"], place: ["แพ็กและส่ง", "Packing & shipping", "梱包・出荷"],
    dot: [89.9, 64.3], tag: [89.9, 52.0], box: [82.0, 56.7, 98.0, 72.0] },
  { id: "office", title: ["ติดต่อเรา", "Contact us", "お問い合わせ"], place: ["สำนักงาน", "Office", "オフィス"],
    dot: [17.4, 38.7], tag: [17.4, 27.0], box: [8.0, 30.1, 26.1, 47.7] },
];

export default function FactoryHome({ lang }: { lang: Lang }) {
  const L = tri(lang);
  const t = (x: T3) => L(x[0], x[1], x[2]);
  const [hot, setHot] = useState<string | null>(null);
  const [contact, setContact] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // phones: the picture is wider than the screen — start in the middle of the floor
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);
  useEffect(() => {
    if (!contact) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setContact(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [contact]);

  const box = hot ? SPOTS.find(s => s.id === hot)?.box : null;

  return (
    <section className="fx" aria-label={L("โรงงาน Axiom Siam", "The Axiom Siam factory", "Axiom Siam 工場")}>
      <p className="fx-hint">{L("แตะที่เครื่องจักรในโรงงานเพื่อเริ่ม", "Tap a machine in the factory to begin", "工場の機械をタップしてスタート")}</p>

      <div className="fx-scroll" ref={scroller}>
        <div className="fx-scene">
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
          {box && <span className="fx-box" style={{ left: `${box[0]}%`, top: `${box[1]}%`, width: `${box[2] - box[0]}%`, height: `${box[3] - box[1]}%` }} aria-hidden />}

          {SPOTS.map(s => {
            const soon = s.href ? isSoon(s.href) : false;
            const inner = (
              <>
                <span className="fx-line" style={{ height: `${s.dot[1] - s.tag[1]}cqh` }} aria-hidden />
                <span className="fx-pill">
                  <small>{t(s.place)}</small>
                  <b>{t(s.title)}{soon && <em className="ax-soon">Coming soon</em>}</b>
                </span>
              </>
            );
            const common = {
              className: "fx-spot" + (s.right ? " right" : "") + (hot === s.id ? " on" : ""),
              style: { left: `${s.tag[0]}%`, top: `${s.tag[1]}%` },
              onMouseEnter: () => setHot(s.id), onMouseLeave: () => setHot(null),
              onFocus: () => setHot(s.id), onBlur: () => setHot(null),
            };
            return s.href
              ? <Link key={s.id} href={s.href} {...common}>{inner}</Link>
              : <button key={s.id} type="button" {...common} aria-expanded={contact} onClick={() => setContact(v => !v)}>{inner}</button>;
          })}
          {SPOTS.map(s => <span key={s.id + "-dot"} className={"fx-dot" + (hot === s.id ? " on" : "")} style={{ left: `${s.dot[0]}%`, top: `${s.dot[1]}%` }} aria-hidden />)}

          {contact && (
            <div className="fx-card" role="dialog" aria-label={L("ติดต่อเรา", "Contact us", "お問い合わせ")}>
              <button type="button" className="fx-x" onClick={() => setContact(false)} aria-label={L("ปิด", "Close", "閉じる")}>×</button>
              <b>{L("ติดต่อ Axiom Siam", "Contact Axiom Siam", "Axiom Siam へのお問い合わせ")}</b>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <span>LINE: {CONTACT_LINE}</span>
            </div>
          )}
        </div>
      </div>

      {/* the same buttons as a list, for phones and screen readers that skip the picture */}
      <nav className="fx-list" aria-label={L("ไปที่", "Go to", "移動")}>
        {SPOTS.map(s => s.href
          ? <Link key={s.id} href={s.href}><small>{t(s.place)}</small>{t(s.title)}{isSoon(s.href) && <em className="ax-soon">Coming soon</em>}</Link>
          : <button key={s.id} type="button" onClick={() => setContact(v => !v)}><small>{t(s.place)}</small>{t(s.title)}</button>)}
      </nav>
    </section>
  );
}
