import UPNG from "@pdf-lib/upng";
import CHART from "./dtp-chart.json";
import FACTORY from "./factory-cmyk.json";

/**
 * The factory prints from CMYK only. Colours picked on the website come from
 * its DTP chart (the same 280 swatches the kit studio offers), so each one maps
 * to the chart's exact CMYK. A colour typed in off the chart is converted as
 * the factory's Illustrator would (factoryCmyk) and reported, so the graphics
 * team can check it.
 */
export type Cmyk = [number, number, number, number]; // 0–100 each

const chart = (CHART as { colors: Record<string, string> }).colors;
const numbers = (CHART as { numbers?: Record<string, string> }).numbers ?? {};

/** the swatch's number on the paper chart ("0031"), for the team to find it */
export const chartNumber = (hex: string): string | undefined => numbers[hex.toLowerCase()];

/** a design's own inks: the CMYK the customer typed in, by the screen colour the designer shows for it */
export type OwnInks = Record<string, Cmyk>;

/** how the order sheet names an ink: "0031 C0 M75 Y100 K0" on the chart, else its CMYK */
export const inkText = (hex: string, own?: OwnInks) => {
  const i = ink(hex, own);
  const n = i.own ? undefined : chartNumber(hex);
  const t = cmykText(i.cmyk);
  return n ? `${n}  ${t}` : t;
};

/** "C0 M22.5 Y90 K0" → [0, 22.5, 90, 0] */
export function parseCmyk(s: string): Cmyk | null {
  const m = /^C\s*([\d.]+)\s+M\s*([\d.]+)\s+Y\s*([\d.]+)\s+K\s*([\d.]+)$/i.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}

export const cmykText = (c: Cmyk) => `C${c[0]} M${c[1]} Y${c[2]} K${c[3]}`;

const lut = FACTORY as { grid: number[]; cmyk: number[] };

/** the chart's greys, K only, by how light they are: [0–255, K] from white to black */
const greys: [number, number][] = [[255, 0], ...Object.entries(chart)
  .map(([h, s]) => [h, parseCmyk(s)] as const)
  .filter(([, c]) => c && !c[0] && !c[1] && !c[2])
  .map(([h, c]): [number, number] => [rgbOf(h).reduce((a, v) => a + v, 0) / 3, c![3]])
  .sort((a, b) => b[0] - a[0])];

function rgbOf(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * A colour off the chart, as the factory's Illustrator makes it CMYK (its own
 * colour settings, read into factory-cmyk.json by scripts/factory-cmyk.jsx; the
 * chart's 280 colours were made the same way: the same CMYK within 2 points).
 * A grey is printed in black only, as the chart's greys are, where Illustrator
 * would mix all four inks. The plain formula this replaced put black in every
 * colour: a dark green #255934 came out C58 M0 Y42 K65, muddy, where the
 * factory gives C83 M40 Y90 K37.
 */
export function factoryCmyk(hex: string): Cmyk {
  const c = rgbOf(hex);
  if (Math.max(...c) - Math.min(...c) <= 6) {
    const l = (c[0] + c[1] + c[2]) / 3;
    for (let i = 1; i < greys.length; i++) {
      const [l0, k0] = greys[i - 1], [l1, k1] = greys[i];
      if (l >= l1) return [0, 0, 0, Math.round(k0 + ((l0 - l) / (l0 - l1)) * (k1 - k0))];
    }
    return [0, 0, 0, 100];
  }
  const { grid, cmyk } = lut, n = grid.length;
  const at = c.map(v => { let i = 0; while (i < n - 2 && grid[i + 1] <= v) i++; return [i, (v - grid[i]) / (grid[i + 1] - grid[i])] as const; });
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 2; r++) for (let g = 0; g < 2; g++) for (let b = 0; b < 2; b++) {
    const w = (r ? at[0][1] : 1 - at[0][1]) * (g ? at[1][1] : 1 - at[1][1]) * (b ? at[2][1] : 1 - at[2][1]);
    if (!w) continue;
    const p = (((at[0][0] + r) * n + at[1][0] + g) * n + at[2][0] + b) * 4;
    for (let k = 0; k < 4; k++) out[k] += w * cmyk[p + k];
  }
  return out.map(v => Math.min(100, Math.max(0, Math.round(v)))) as Cmyk;
}

export interface Ink { hex: string; cmyk: Cmyk; onChart: boolean; /** typed in by the customer: printed exactly, not reported */ own?: boolean }

export function ink(hex: string, own?: OwnInks): Ink {
  const h = hex.toLowerCase();
  const typed = own?.[h];
  if (typed) return { hex: h, cmyk: typed, onChart: true, own: true };
  // the fabric itself: no ink
  if (h === "#ffffff") return { hex: h, cmyk: [0, 0, 0, 0], onChart: true };
  const c = chart[h] ? parseCmyk(chart[h]) : null;
  return c ? { hex: h, cmyk: c, onChart: true } : { hex: h, cmyk: factoryCmyk(h), onChart: false };
}

/**
 * A picture (a team's PNG logo, a photo, a pattern) as its RGB pixels and its
 * transparency, for an RGB image in the print file. Illustrator turns it into
 * CMYK with the factory's own colour settings when the print manager lays the
 * sheet out, as it does a customer's photo the graphics team places by hand.
 * Converted here with the plain formula (black in every colour), a bright red
 * came out C0 M84 Y81 K11 where Illustrator gives C5 M98 Y95 K0: the print was
 * dull next to the same design made in Illustrator.
 */
export function pngToRgb(png: Uint8Array): { w: number; h: number; rgb: Uint8Array; alpha: Uint8Array | null } {
  const img = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const n = img.width * img.height;
  const rgb = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  let seeThrough = false;
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = rgba[i * 4];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
    alpha[i] = rgba[i * 4 + 3];
    if (alpha[i] < 255) seeThrough = true;
  }
  return { w: img.width, h: img.height, rgb, alpha: seeThrough ? alpha : null };
}

/**
 * A one-colour print of a logo: its shape (the PNG's transparency) filled with
 * one ink, as the kit studio prints the Axiom mark or a team logo when asked.
 * Print: the ink's own CMYK, every pixel; preview: a PNG in that colour.
 */
export function tintCmyk(png: Uint8Array, hex: string): { w: number; h: number; cmyk: Uint8Array; alpha: Uint8Array } {
  const img = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const n = img.width * img.height;
  const c = ink(hex).cmyk.map(v => Math.round((v / 100) * 255));
  const cmyk = new Uint8Array(n * 4);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cmyk.set(c, i * 4);
    alpha[i] = rgba[i * 4 + 3];
  }
  return { w: img.width, h: img.height, cmyk, alpha };
}

export function tintPng(png: Uint8Array, hex: string): Uint8Array {
  const img = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const v = parseInt(hex.slice(1), 16);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = (v >> 16) & 255; rgba[i + 1] = (v >> 8) & 255; rgba[i + 2] = v & 255; }
  return new Uint8Array(UPNG.encode([rgba.buffer as ArrayBuffer], img.width, img.height, 0));
}
