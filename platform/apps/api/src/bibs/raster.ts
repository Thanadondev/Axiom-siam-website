import { Resvg } from "@resvg/resvg-js";
import { pngSize } from "./draw";

/**
 * A logo no bigger than it needs to be. The biggest print is the XXL's
 * (85 mm × 1.47 ≈ 125 mm tall, or up to 160 mm wide): 2400 px on the long side
 * is ≈ 400–480 dpi there, finer than sublimation prints. Anything larger only
 * makes every bib's file heavier; the live preview needs far less.
 */
export const PRINT_LOGO_PX = 2400;
export const PREVIEW_LOGO_PX = 900;

/** the PNG scaled down (never up) so its long side is at most `maxPx`, transparency kept */
export function fitPng(png: Uint8Array, maxPx: number): Uint8Array {
  const { w, h } = pngSize(png);
  if (Math.max(w, h) <= maxPx) return png;
  const k = maxPx / Math.max(w, h);
  const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image width="${W}" height="${H}" preserveAspectRatio="none" href="data:image/png;base64,${Buffer.from(png).toString("base64")}"/></svg>`;
  return new Uint8Array(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
}

/** the logo's resolution where it prints largest: dots per inch at its printed height */
export const dpiAt = (pxHigh: number, mmHigh: number) => Math.round(pxHigh / (mmHigh / 25.4));
