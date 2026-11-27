/**
 * Will the names and numbers be readable? A colour picked to match the stripes
 * (a blue number on blue stripes) disappears wherever it crosses them — found
 * trying every bib design (2026-11-17). Checked against the body and, with a
 * pattern, the pattern colour; a keyline that stands out from that background
 * keeps the text readable there.
 */

/** WCAG relative luminance of #rrggbb */
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio, 1 (same) to 21 (black on white) */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** below this the text melts into the body: navy on black is 1.53; white on cyan 2.53 and yellow on green 2.73 read well from across a pitch */
export const MIN_CONTRAST = 1.8;
/**
 * A pattern covers part of the piece, so the text only crosses it: a little lower.
 * The bib kit's own white number over its gold chest band is 1.62; blue on blue stripes is 1.
 */
export const MIN_CONTRAST_PATTERN = 1.5;

export interface InkLook { body: string; pattern: string; patternColor?: string; ink: string; inkOutline?: string | null }

/** where the names and numbers can't be read: on the body, on the pattern, or nowhere ([]) */
export function inkClashes(s: InkLook): ("body" | "pattern")[] {
  const on = (bg: string, min: number) => contrast(s.ink, bg) >= min || (!!s.inkOutline && contrast(s.inkOutline, bg) >= min);
  const out: ("body" | "pattern")[] = [];
  if (!on(s.body, MIN_CONTRAST)) out.push("body");
  // side panels run down the edges, clear of the names and numbers in the middle
  const crosses = !["plain", "none", "side"].includes(s.pattern);
  if (crosses && s.patternColor && !on(s.patternColor, MIN_CONTRAST_PATTERN)) out.push("pattern");
  return out;
}
