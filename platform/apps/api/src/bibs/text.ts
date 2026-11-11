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
/** one of ours, or the team's own font (the kit studio's upload) with one of ours for what it lacks */
export type FontRef = FontId | "label" | { font: opentype.Font; fallback: FontId };

/** a team's font file as outlines, or null when it can't be read (opentype.js reads TTF, OTF and WOFF, not WOFF2) */
export function parseFont(buf: Uint8Array): opentype.Font | null {
  try {
    const f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    return f.charToGlyphIndex("0") > 0 || f.charToGlyphIndex("A") > 0 ? f : null;
  } catch { return null; }
}
type Face = "anton" | "sora8" | "sora7" | "thai8" | "thai7" | "jp8" | "jp7";

const FILES: Record<Exclude<Face, "jp8" | "jp7">, string[]> = {
  anton: ["@fontsource/anton/files/anton-latin-400-normal.woff", "@fontsource/anton/files/anton-latin-ext-400-normal.woff"],
  sora8: ["@fontsource/sora/files/sora-latin-800-normal.woff", "@fontsource/sora/files/sora-latin-ext-800-normal.woff"],
  sora7: ["@fontsource/sora/files/sora-latin-700-normal.woff", "@fontsource/sora/files/sora-latin-ext-700-normal.woff"],
  thai8: ["@fontsource/noto-sans-thai/files/noto-sans-thai-thai-800-normal.woff", "@fontsource/noto-sans-thai/files/noto-sans-thai-latin-800-normal.woff"],
  thai7: ["@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff", "@fontsource/noto-sans-thai/files/noto-sans-thai-latin-700-normal.woff"],
};

/**
 * The faces tried in turn for each character. Japanese names (kanji, kana) come
 * last, from Noto Sans JP, the face the website shows them in.
 */
const CHAINS: Record<FontId | "label", Face[]> = {
  block: ["anton", "thai8", "sora8", "jp8"],
  classic: ["sora8", "thai8", "jp8"],
  thai: ["thai8", "sora8", "jp8"],
  label: ["sora7", "thai7", "jp7"],
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

/**
 * Noto Sans JP comes in ~120 pieces by character (as the web loads it); each
 * piece's characters are read from the package's stylesheet, and only the
 * pieces a name uses are opened.
 */
const JP_DIR = "@fontsource/noto-sans-jp";
const jpPieces = new Map<number, { ranges: [number, number][]; file: string }[]>();
function jpPiecesOf(weight: number) {
  let pieces = jpPieces.get(weight);
  if (!pieces) {
    const css = readFileSync(require.resolve(`${JP_DIR}/${weight}.css`), "utf8");
    pieces = [];
    for (const m of css.matchAll(/url\(\.\/files\/([^)]+?)\.woff2\)[^;]*;\s*unicode-range:\s*([^;]+);/g)) {
      const ranges = m[2].split(",").map(r => {
        const [lo, hi] = r.trim().replace(/^U\+/i, "").split("-").map(h => parseInt(h, 16));
        return [lo, hi ?? lo] as [number, number];
      });
      pieces.push({ ranges, file: `${JP_DIR}/files/${m[1]}.woff` });
    }
    jpPieces.set(weight, pieces);
  }
  return pieces;
}
function jpFont(weight: number, cp: number): opentype.Font | null {
  const p = jpPiecesOf(weight).find(pc => pc.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));
  return p ? font(p.file) : null;
}

/** the font that draws this character: the first in the chain that has it */
function fontFor(ch: string, chain: Face[]): opentype.Font {
  for (const face of chain) {
    const fonts = face === "jp8" || face === "jp7"
      ? [jpFont(face === "jp8" ? 800 : 700, ch.codePointAt(0)!)].filter((f): f is opentype.Font => !!f)
      : FILES[face].map(font);
    const f = fonts.find(ff => ff.charToGlyphIndex(ch) > 0);
    if (f) return f;
  }
  return font(FILES[chain[0] as keyof typeof FILES][0]);
}

/** the glyph outlines of a line of text at font size 100, baseline at y = 0 */
function rawText(text: string, chain: Face[], tracking = 0, own?: opentype.Font): Seg[] {
  const segs: Seg[] = [];
  let x = 0;
  for (const ch of Array.from(text.normalize("NFC"))) {
    const f = own && own.charToGlyphIndex(ch) > 0 ? own : fontFor(ch, chain);
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
export function textShape(text: string, font: FontRef, fit: Fit, at: { cx?: number; x?: number; right?: number; top?: number; cy?: number; bottom?: number }, tracking = 4): TextShape | null {
  const t = text.trim();
  if (!t) return null;
  const raw = typeof font === "string" ? rawText(t, CHAINS[font], tracking) : rawText(t, CHAINS[font.fallback], tracking, font.font);
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
