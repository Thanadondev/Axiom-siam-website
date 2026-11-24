import type { MetadataRoute } from "next";
import { isOpen } from "../lib/launch";
import { SITE_NAV } from "../lib/stations";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://axiomsiam.com").replace(/\/$/, "");

/** /sitemap.xml: the home page, the stations' pages that are open (lib/launch.ts), the terms */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", ...SITE_NAV.map(s => s.href!), "/terms"].filter(p => isOpen(p));
  return pages.map(p => ({ url: SITE + (p === "/" ? "" : p), changeFrequency: "weekly", priority: p === "/" ? 1 : p === "/terms" ? 0.3 : 0.8 }));
}
