import CB005 from "./cb-005.json";
import { parsePath, pathData, type Seg } from "./path";

/**
 * The factory's bib pattern, per size: each piece's cut line and the rib bands
 * printed along the neck, armholes and hem, in mm from the cut line's top-left
 * corner (y down), and where the piece sits on the size's page. Taken from the
 * graphics team's own Illustrator template (CB-005, reversible bibs) by
 * scripts/bibs/extract-template.py, so a job built here lines up with one
 * drawn by hand.
 *
 * S–XL come with both rows (side A over side B) and the rib bands drawn; XXL
 * and the specials with one row and no bands. A bib can be made in any size
 * with 2 pieces (normal) or 4 (reversible), and either side may have bands —
 * the designer's choice — so the missing row and bands are derived here.
 */
export type Part = "front" | "back";
export type Side = "A" | "B";
export type RibZone = "neck" | "arm" | "hem";

/** a band from the template (a shape clipped to the cut line), or one derived: a stroke along the cut line, clipped to it */
export type Rib = { zone: RibZone; d: string } | { zone: RibZone; line: string; width: number };

export interface Piece {
  w: number;
  h: number;
  /** the cut line */
  cut: string;
  ribs: Rib[];
  neckDepth: number;
  /** where the cut line's top-left corner sits on the size's page, mm */
  x: number;
  y: number;
}

type SizeEntry = { page: { w: number; h: number } } & Partial<Record<Side, Record<Part, Piece>>>;

export interface BibTemplate {
  code: string;
  name: string;
  source: string;
  sizes: Record<string, SizeEntry>;
}

export const TEMPLATE = CB005 as unknown as BibTemplate;

/** the sizes a bib comes in, smallest first; SPM / SPL are the "special" M and L */
export const BIB_SIZES = ["S", "M", "L", "XL", "XXL", "SPM", "SPL"] as const;
export type BibSize = (typeof BIB_SIZES)[number];

/** how a size is written on the order sheet and in file names */
export const SIZE_NAME: Record<BibSize, string> = {
  S: "S", M: "M", L: "L", XL: "XL-2L", XXL: "XXL-3L", SPM: "Special M", SPL: "Special L",
};

/**
 * Rib band widths, mm, as measured on the template's own bands (16.5 mm on
 * S–L, 20 mm on XL; the hem 20 mm on all). XXL follows XL, the specials M/L.
 */
export const RIB_BAND: Record<BibSize, number> = { S: 16.5, M: 16.5, L: 16.5, XL: 20, XXL: 20, SPM: 16.5, SPL: 16.5 };
export const HEM_BAND = 20;

const entry = (size: BibSize) => {
  const s = TEMPLATE.sizes[size];
  if (!s?.A) throw new Error(`no template for size ${size}`);
  return s as SizeEntry & { A: Record<Part, Piece> };
};

/** whether the template draws the rib bands itself for this size (else they're derived) */
export const hasRibs = (size: BibSize) => !!TEMPLATE.sizes[size]?.A?.front.ribs.length;

/** width of the M front: art sizes are given for M and scale with the piece */
export const BASE_WIDTH = TEMPLATE.sizes.M.A!.front.w;

/** the gap under side A where the template has to add side B: as on M (≈ 200 mm; the drawn rows sit 40–200 mm apart) */
const ROW_GAP = TEMPLATE.sizes.M.B!.front.y - (TEMPLATE.sizes.M.A!.front.y + TEMPLATE.sizes.M.A!.front.h);
/** the template's margin under the last row */
const BOTTOM = TEMPLATE.sizes.M.page.h - (TEMPLATE.sizes.M.B!.front.y + TEMPLATE.sizes.M.B!.front.h);

/** one side's front and back for a size, placed where the template puts them (side B under side A) */
export function piecesFor(size: BibSize, side: Side): Record<Part, Piece> {
  const s = entry(size);
  const own = s[side];
  if (own) return own;
  const a = s.A;
  const shift = Math.max(a.front.h, a.back.h) + ROW_GAP;
  return { front: { ...a.front, ribs: [], y: a.front.y + shift }, back: { ...a.back, ribs: [], y: a.back.y + shift } };
}

/** the rib bands for a piece of this size: the template's own, or derived along its cut line */
export function ribsFor(size: BibSize, part: Part): Rib[] {
  const a = entry(size).A[part];
  return a.ribs.length ? a.ribs : deriveRibs(a, RIB_BAND[size]);
}

export interface Layout {
  page: { w: number; h: number };
  pieces: { side: Side; part: Part; piece: Piece }[];
}

/** one bib on one page, as the template lays it out: side A's front and back, side B's under them */
export function layoutFor(size: BibSize, sides: Side[]): Layout {
  const s = entry(size);
  const pieces = sides.flatMap(side => (["front", "back"] as Part[]).map(part => ({ side, part, piece: piecesFor(size, side)[part] })));
  const bottom = Math.max(...pieces.map(p => p.piece.y + p.piece.h)) + BOTTOM;
  return { page: { w: s.page.w, h: Math.round(bottom * 10) / 10 }, pieces };
}

// ------------------------------------------------------------ derived bands

type Zone = RibZone | "seam" | "shoulder";

/**
 * Sorts a cut line's segments into neck, armholes and hem (where bands go) and
 * side seams and shoulders (where they don't), by where they lie on the piece.
 */
function zoneOf(s: Seg, x0: number, y0: number, w: number, h: number): Zone {
  if (s.op === "M" || s.op === "Z") return "seam";
  const u0 = x0 / w, v0 = y0 / h, u1 = s.x / w, v1 = s.y / h;
  const straight = s.op === "L";
  if (straight && Math.abs(u0 - u1) < 0.01 && (u0 < 0.02 || u0 > 0.98) && Math.abs(v1 - v0) > 0.1) return "seam";
  if (v0 > 0.98 && v1 > 0.98) return "hem";
  if (straight && v0 < 0.1 && v1 < 0.1 && Math.hypot(s.x - x0, s.y - y0) > 0.08 * w) return "shoulder";
  if (Math.min(u0, u1) >= 0.3 && Math.max(u0, u1) <= 0.7 && Math.max(v0, v1) < 0.45) return "neck";
  if (Math.max(v0, v1) < 0.6) return "arm";
  return "seam";
}

const unit = (dx: number, dy: number) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

/** bands of `band` mm along the neck and armholes and HEM_BAND along the hem, as strokes to clip to the cut line */
export function deriveRibs(p: Piece, band: number): Rib[] {
  const segs = parsePath(p.cut);
  type Run = { zone: RibZone; start: [number, number]; segs: Seg[] };
  const runs: (Run | null)[] = [];
  let x = 0, y = 0, cur: Run | null = null;
  for (const s of segs) {
    if (s.op === "M") { x = s.x; y = s.y; cur = null; continue; }
    if (s.op === "Z") { cur = null; continue; }
    const z = zoneOf(s, x, y, p.w, p.h);
    if (z === "seam" || z === "shoulder") { if (cur) runs.push(null); cur = null; }
    else if (cur && cur.zone === z) cur.segs.push(s);
    else { cur = { zone: z, start: [x, y], segs: [s] }; runs.push(cur); }
    x = s.x; y = s.y;
  }
  const list = runs.filter((r): r is Run => !!r);
  // a run that crosses the path's start point comes out in two halves: join them
  if (list.length > 1) {
    const first = list[0], last = list[list.length - 1];
    const end = last.segs[last.segs.length - 1] as Exclude<Seg, { op: "Z" }>;
    if (first.zone === last.zone && Math.hypot(end.x - first.start[0], end.y - first.start[1]) < 0.01) {
      last.segs.push(...first.segs);
      list.shift();
    }
  }
  return list.map(r => {
    const width = r.zone === "hem" ? HEM_BAND : band;
    const reach = 2 * width;
    const firstSeg = r.segs[0] as Exclude<Seg, { op: "Z" | "M" }>;
    const lastSeg = r.segs[r.segs.length - 1] as Exclude<Seg, { op: "Z" | "M" }>;
    const [sx, sy] = r.start;
    // carry the band on past the ends that meet a shoulder or a corner, so it's cut by the cut line, not squared off
    const nx = firstSeg.op === "C" ? firstSeg.x1 : firstSeg.x, ny = firstSeg.op === "C" ? firstSeg.y1 : firstSeg.y;
    const [ux, uy] = unit(sx - nx, sy - ny);
    const prev = r.segs.length > 1 ? (r.segs[r.segs.length - 2] as Exclude<Seg, { op: "Z" | "M" }>) : null;
    const px = lastSeg.op === "C" ? lastSeg.x2 : prev ? prev.x : sx, py = lastSeg.op === "C" ? lastSeg.y2 : prev ? prev.y : sy;
    const [vx, vy] = unit(lastSeg.x - px, lastSeg.y - py);
    const reachStart = r.zone === "hem" || sy / p.h < 0.15;
    const reachEnd = r.zone === "hem" || lastSeg.y / p.h < 0.15;
    const out: Seg[] = [];
    if (reachStart) out.push({ op: "M", x: sx + ux * reach, y: sy + uy * reach }, { op: "L", x: sx, y: sy });
    else out.push({ op: "M", x: sx, y: sy });
    out.push(...r.segs);
    if (reachEnd) out.push({ op: "L", x: lastSeg.x + vx * reach, y: lastSeg.y + vy * reach });
    return { zone: r.zone, line: pathData(out), width: width * 2 };
  });
}
