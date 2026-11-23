"use client";

import Link from "next/link";
import { station, type Station } from "../lib/stations";
import { tri, type Lang } from "../lib/i18n";
import "../app/station.css";

/**
 * The band at the top of a page behind one of the home page's stations: that station's own
 * render (public/factory/<id>-*.webp), its name and what you do here, and the way back to the
 * whole factory — so each page reads as standing at that machine.
 */
export default function StationHero({ id, lang }: { id: Station["id"]; lang?: Lang }) {
  const L = tri(lang ?? "th");
  const s = station(id);
  return (
    <div className="st-hero">
      <img className="st-img" src={`/factory/${id}-1600.webp`} srcSet={`/factory/${id}-1600.webp 1600w, /factory/${id}-2560.webp 2560w`}
        sizes="(max-width: 1400px) 100vw, 1360px" alt="" draggable={false} />
      <div className="st-copy">
        <small>{L("สถานี", "Station", "ステーション")} · {L(...s.place)}</small>
        <b>{L(...s.title)}</b>
        <p>{L(...s.about)}</p>
      </div>
      <Link href="/" className="st-back">← {L("ดูทั้งโรงงาน", "The whole factory", "工場全体")}</Link>
    </div>
  );
}
