import UPNG from "@pdf-lib/upng";
import CHART from "./dtp-chart.json";

/**
 * The factory prints from CMYK only. Colours picked on the website come from
 * its DTP chart (the same 280 swatches the kit studio offers), so each one maps
 * to the chart's exact CMYK. A colour typed in off the chart is converted
 * plainly and reported, so the graphics team can check it.
 */
export type Cmyk = [number, number, number, number]; // 0–100 each

const chart = (CHART as { colors: Record<string, string> }).colors;

/** "C0 M22.5 Y90 K0" → [0, 22.5, 90, 0] */
export function parseCmyk(s: string): Cmyk | null {
  const m = /^C\s*([\d.]+)\s+M\s*([\d.]+)\s+Y\s*([\d.]+)\s+K\s*([\d.]+)$/i.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}

export const cmykText = (c: Cmyk) => `C${c[0]} M${c[1]} Y${c[2]} K${c[3]}`;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** a plain conversion with full black generation: for colours off the chart only */
export function naiveCmyk(hex: string): Cmyk {
  const v = parseInt(hex.slice(1), 16);
  const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [round1(((1 - r - k) / (1 - k)) * 100), round1(((1 - g - k) / (1 - k)) * 100), round1(((1 - b - k) / (1 - k)) * 100), round1(k * 100)];
}

export interface Ink { hex: string; cmyk: Cmyk; onChart: boolean }

export function ink(hex: string): Ink {
  const h = hex.toLowerCase();
  // the fabric itself: no ink
  if (h === "#ffffff") return { hex: h, cmyk: [0, 0, 0, 0], onChart: true };
  const c = chart[h] ? parseCmyk(chart[h]) : null;
  return c ? { hex: h, cmyk: c, onChart: true } : { hex: h, cmyk: naiveCmyk(h), onChart: false };
}

/**
 * A PNG logo as CMYK pixels and its transparency, for a DeviceCMYK image in
 * the print file. Pixels are converted plainly (a vector logo from the team
 * keeps its own colours better: a later step).
 */
export function pngToCmyk(png: Uint8Array): { w: number; h: number; cmyk: Uint8Array; alpha: Uint8Array | null } {
  const img = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const n = img.width * img.height;
  const cmyk = new Uint8Array(n * 4);
  const alpha = new Uint8Array(n);
  let seeThrough = false;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    const d = k >= 1 ? 1 : 1 - k;
    cmyk[i * 4] = Math.round(((1 - r - k) / d) * 255);
    cmyk[i * 4 + 1] = Math.round(((1 - g - k) / d) * 255);
    cmyk[i * 4 + 2] = Math.round(((1 - b - k) / d) * 255);
    cmyk[i * 4 + 3] = Math.round(k * 255);
    alpha[i] = rgba[i * 4 + 3];
    if (alpha[i] < 255) seeThrough = true;
  }
  return { w: img.width, h: img.height, cmyk, alpha: seeThrough ? alpha : null };
}
