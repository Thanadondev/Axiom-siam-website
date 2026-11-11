import { readFileSync } from "node:fs";
import * as opentype from "opentype.js";
import { bounds, mapPath, parsePath, type Box, type Seg } from "./path";

/**
 * Text as outlines: the factory's files have no live text (the "_ol" in their
 * names), so every name, number and label is drawn from the glyph shapes. The
 * same fonts as the kit studio, each with a fallback chain so a Thai or
 * accented name still comes out.
 */

export type FontId = "block" | "classic" | "thai";
type Face = "anton" | "sora8" | "sora7" | "thai8" | "thai7";

const FILES: Record<Face, string[]> = {
  anton: ["@fontsource/anton/files/anton-latin-400-normal.woff", "@fontsource/anton/files/anton-latin-ext-400-normal.woff"],
  sora8: ["@fontsource/sora/files/sora-latin-800-normal.woff", "@fontsource/sora/files/sora-latin-ext-800-normal.woff"],
  sora7: ["@fontsource/sora/files/sora-latin-700-normal.woff", "@fontsource/sora/files/sora-latin-ext-700-normal.woff"],
  thai8: ["@fontsource/noto-sans-thai/files/noto-sans-thai-thai-800-normal.woff", "@fontsource/noto-sans-thai/files/noto-sans-thai-latin-800-normal.woff"],
  thai7: ["@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff", "@fontsource/noto-sans-thai/files/noto-sans-thai-latin-700-normal.woff"],
};

/** the faces tried in turn for each character */
const CHAINS: Record<FontId | "label", Face[]> = {
  block: ["anton", "thai8", "sora8"],
  classic: ["sora8", "thai8"],
  thai: ["thai8", "sora8"],
  label: ["sora7", "thai7"],
};

const loaded = new Map<string, opentype.Font>();
function font(file: string): opentype.Font {
  let f = loaded.get(file);
  if (!f) {
    const b = readFileSync(require.resolve(file));
    f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    loaded.set(file, f);
  }
  return f;
}
const fontsOf = (chain: Face[]) => chain.flatMap(face => FILES[face]).map(font);

/** the glyph outlines of a line of text at font size 100, baseline at y = 0 */
function rawText(text: string, chain: Face[], tracking = 0): Seg[] {
  const fonts = fontsOf(chain);
  const segs: Seg[] = [];
  let x = 0;
  for (const ch of Array.from(text.normalize("NFC"))) {
    const f = fonts.find(ff => ff.charToGlyphIndex(ch) > 0) ?? fonts[0];
    const g = f.charToGlyph(ch);
    const scale = 100 / f.unitsPerEm;
    segs.push(...parsePath(g.getPath(x, 0, 100).toPathData(3)));
    const adv = (g.advanceWidth ?? 0) * scale;
    x += adv + (adv > 0 ? tracking : 0);
  }
  return segs;
}

export interface Fit {
  /** height of the ink, mm (the "H85mm" on the order sheet) */
  h?: number;
  /** width of the ink, mm ("W320mm"); with h, the smaller of the two wins */
  w?: number;
  /** never wider than this */
  maxW?: number;
}

export interface TextShape { segs: Seg[]; box: Box }

/**
 * A line of text sized to the ink (not the font size) and placed by its box:
 * `cx` is the centre, `top` the top of the ink. Empty text gives null.
 */
export function textShape(text: string, font: FontId | "label", fit: Fit, at: { cx?: number; x?: number; right?: number; top?: number; cy?: number; bottom?: number }, tracking = 4): TextShape | null {
  const t = text.trim();
  if (!t) return null;
  const raw = rawText(t, CHAINS[font], tracking);
  const b = bounds(raw);
  if (!b || b.w <= 0 || b.h <= 0) return null;
  let k = Infinity;
  if (fit.h) k = Math.min(k, fit.h / b.h);
  if (fit.w) k = Math.min(k, fit.w / b.w);
  if (fit.maxW) k = Math.min(k, fit.maxW / b.w);
  if (!Number.isFinite(k)) k = 1;
  const w = b.w * k, h = b.h * k;
  const left = at.cx !== undefined ? at.cx - w / 2 : at.right !== undefined ? at.right - w : at.x ?? 0;
  const top = at.top !== undefined ? at.top : at.cy !== undefined ? at.cy - h / 2 : at.bottom !== undefined ? at.bottom - h : 0;
  const segs = mapPath(raw, k, left - b.x * k, top - b.y * k);
  return { segs, box: { x: left, y: top, w, h } };
}
