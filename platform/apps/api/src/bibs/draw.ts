import { LAYOUT, type SideLook } from "./design";
import { mapPath, parsePath, type Seg } from "./path";
import { BASE_WIDTH, type Part, type Piece, type Rib } from "./template";
import { textShape, type FontId } from "./text";

/**
 * One cut piece with its artwork, as plain shapes in mm (y down, origin at the
 * cut line's top-left). The print file and the order sheet both draw these,
 * so what the customer approves is what goes to the printer.
 */
export type Shape =
  | { kind: "path"; segs: Seg[]; fill?: string; stroke?: string; width?: number; clip?: Seg[] }
  | { kind: "image"; png: Uint8Array; x: number; y: number; w: number; h: number };

export interface Art {
  font: FontId;
  team: string;
  name: string;
  number: string;
  /** the team's logo (PNG) and its pixel size */
  logo?: { png: Uint8Array; w: number; h: number };
  show: { frontNumber: boolean; frontLogo: boolean; frontTeam: boolean; backName: boolean; backNumber: boolean };
}

/** the template's cut line: K50 */
export const CUT_COLOR = "#939598";

/** the PNG's pixel size, from its header */
export function pngSize(png: Uint8Array): { w: number; h: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47];
  if (png.length < 24 || sig.some((b, i) => png[i] !== b)) throw new Error("logo must be a PNG");
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

/** stripes or hoops across the piece, clipped to the cut line */
function patternShapes(p: Piece, look: SideLook, cut: Seg[]): Shape[] {
  if (look.pattern === "plain" || !look.patternColor) return [];
  const out: Shape[] = [];
  if (look.pattern === "stripes") {
    // 7 equal stripes across, the 2nd, 4th and 6th in the pattern colour
    const sw = p.w / 7;
    for (let i = 1; i < 7; i += 2) out.push({ kind: "path", fill: look.patternColor, clip: cut, segs: rect(i * sw, 0, sw, p.h) });
  } else {
    // hoops: bands from below the armholes down, leaving the hem band clear
    const top = p.h * 0.38, bottom = p.h - 20;
    const bh = (bottom - top) / 5;
    for (let i = 0; i < 5; i += 2) out.push({ kind: "path", fill: look.patternColor, clip: cut, segs: rect(0, top + i * bh, p.w, bh) });
  }
  return out;
}

const rect = (x: number, y: number, w: number, h: number): Seg[] => [
  { op: "M", x, y }, { op: "L", x: x + w, y }, { op: "L", x: x + w, y: y + h }, { op: "L", x, y: y + h }, { op: "Z" },
];

/** a name or number: keyline under, ink on top, so the keyline only shows outside */
function inked(segs: Seg[], look: SideLook, k: number): Shape[] {
  const out: Shape[] = [];
  if (look.inkOutline) out.push({ kind: "path", segs, fill: look.inkOutline, stroke: look.inkOutline, width: LAYOUT.outline * 2 * k });
  out.push({ kind: "path", segs, fill: look.ink });
  return out;
}

export interface DrawOpts {
  /** the piece's rib bands (ribsFor), drawn when this side has rib colours */
  ribs?: Rib[];
  /** the grey cut line and size mark (print file) */
  cutLine?: boolean;
  sizeMark?: string;
}

export function drawPiece(p: Piece, part: Part, look: SideLook, art: Art, opts: DrawOpts = {}): Shape[] {
  const k = p.w / BASE_WIDTH;
  const cut = parsePath(p.cut);
  const out: Shape[] = [];
  // like the factory template, nothing reaches past the cut line (it already carries the seam allowance)
  out.push({ kind: "path", segs: cut, fill: look.body });
  out.push(...patternShapes(p, look, cut));
  // rib bands, clipped to the cut line: the template's broad shapes, or strokes along the cut line
  const rib = look.rib;
  if (rib) for (const r of opts.ribs ?? []) {
    out.push("d" in r
      ? { kind: "path", segs: parsePath(r.d), fill: rib[r.zone], clip: cut }
      : { kind: "path", segs: parsePath(r.line), stroke: rib[r.zone], width: r.width, clip: cut });
  }

  if (part === "front") {
    const L = LAYOUT.front;
    if (art.show.frontNumber) {
      const t = textShape(art.number, art.font, { h: L.number.h * k }, { cx: L.number.cx * p.w, top: L.number.top * p.h });
      if (t) out.push(...inked(t.segs, look, k));
    }
    if (art.show.frontLogo && art.logo) {
      let h = L.logo.h * k, w = (h * art.logo.w) / art.logo.h;
      if (w > L.logo.maxW * k) { w = L.logo.maxW * k; h = (w * art.logo.h) / art.logo.w; }
      out.push({ kind: "image", png: art.logo.png, x: L.logo.cx * p.w - w / 2, y: L.logo.top * p.h, w, h });
    }
    if (art.show.frontTeam) {
      const t = textShape(art.team, art.font, { w: L.team.w * k, h: L.team.h * k }, { cx: L.team.cx * p.w, cy: L.team.cy * p.h });
      if (t) out.push(...inked(t.segs, look, k));
    }
  } else {
    const L = LAYOUT.back;
    if (art.show.backName) {
      const t = textShape(art.name, art.font, { h: L.name.h * k, maxW: L.name.maxW * k }, { cx: L.name.cx * p.w, top: L.name.top * p.h });
      if (t) out.push(...inked(t.segs, look, k));
    }
    if (art.show.backNumber) {
      const t = textShape(art.number, art.font, { h: L.number.h * k, maxW: L.number.maxW * k }, { cx: L.number.cx * p.w, top: L.number.top * p.h }, 2);
      if (t) out.push(...inked(t.segs, look, k));
    }
  }

  if (opts.cutLine) out.push({ kind: "path", segs: cut, stroke: CUT_COLOR, width: 0.353 });
  if (opts.sizeMark) {
    const t = textShape(opts.sizeMark, "label", { h: 4.5 }, { right: p.w - 4, bottom: p.h - 2.5 }, 2);
    if (t) out.push({ kind: "path", segs: t.segs, fill: CUT_COLOR });
  }
  return out;
}

/** shapes moved by (dx, dy) */
export function moveShapes(shapes: Shape[], dx: number, dy: number, k = 1): Shape[] {
  return shapes.map(s => s.kind === "image"
    ? { ...s, x: s.x * k + dx, y: s.y * k + dy, w: s.w * k, h: s.h * k }
    : { ...s, segs: mapPath(s.segs, k, dx, dy), clip: s.clip && mapPath(s.clip, k, dx, dy), width: s.width !== undefined ? s.width * k : undefined });
}
