import type { Metadata } from "next";
import { station, type Station } from "./stations";

/**
 * Each page's <title>, description and share picture (public/og/<name>.jpg, 1200×630, cut from the
 * factory renders), in Thai: the language the site opens in. Pages are client components, so these
 * sit in a small layout.tsx beside each one.
 */
export function pageMeta(title: string, description?: string, og?: string, opts: { noindex?: boolean } = {}): Metadata {
  const m: Metadata = { title };
  if (description) m.description = description;
  if (og || description) m.openGraph = { title: `${title} — Axiom Siam`, ...(description && { description }), ...(og && { images: [{ url: `/og/${og}.jpg`, width: 1200, height: 630 }] }) };
  if (opts.noindex) m.robots = { index: false, follow: false };
  return m;
}

/** a page behind one of the home page's stations: its name, what you do there, its picture */
export function stationMeta(id: Station["id"]): Metadata {
  const s = station(id);
  return pageMeta(s.title[0], s.about[0], id);
}
