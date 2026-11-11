import { frontLayout, LAYOUT, type SideLook } from "./design";
import { mapPath, parsePath, type Seg } from "./path";
import { BASE_WIDTH, type Part, type Piece, type Rib } from "./template";
import { textShape, type FontRef } from "./text";

/**
 * One cut piece with its artwork, as plain shapes in mm (y down, origin at the
 * cut line's top-left). The print file and the order sheet both draw these,
 * so what the customer approves is what goes to the printer.
 */
export type Shape =
  | { kind: "path"; segs: Seg[]; fill?: string; stroke?: string; width?: number; clip?: Seg[] }
  | { kind: "image"; png: Uint8Array; x: number; y: number; w: number; h: number; tint?: string };

export interface Art {
  font: FontRef;
  team: string;
  name: string;
  number: string;
  /** the team's logo (PNG) and its pixel size; `tint`: printed in the ink colour; `scale`: of the usual size (the Axiom mark is smaller) */
  logo?: { png: Uint8Array; w: number; h: number; tint?: boolean; scale?: number };
  /** the logo on the viewer's left and the number on the right (the kit studio's front) */
  logoLeft?: boolean;
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

/**
 * The kit studio's patterns as its 3D singlet paints them (lib/jersey3d.ts, the
 * torso shader), in that model's units: half-width W at the chest, `top` the
 * shoulder line, H from shoulder to hem. Mapped onto the piece by its width and
 * height; seen from behind the back is mirrored, as the shader's x is the body's.
 */
const KIT = { W: 1.232, top: 1.566, H: 3.24 };

function kitPattern(p: Piece, pattern: SideLook["pattern"], mirror: boolean): Seg[][] {
  const half = p.w / 2;
  const X = (xm: number) => half + (mirror ? -xm : xm) * (half / KIT.W); // model x → mm across
  const Y = (ym: number) => ((KIT.top - ym) * p.h) / KIT.H; // model y → mm down
  const out: Seg[][] = [];
  const poly = (pts: [number, number][]): Seg[] => [
    { op: "M", x: pts[0][0], y: pts[0][1] }, ...pts.slice(1).map(([x, y]) => ({ op: "L" as const, x, y })), { op: "Z" },
  ];
  const span = KIT.W * 1.6; // past both side seams
  if (pattern === "diagonal") {
    // between the lines y + 0.42x = -0.05 and 0.38
    const yAt = (c: number, xm: number) => c - 0.42 * xm;
    out.push(poly([[X(-span), Y(yAt(0.38, -span))], [X(span), Y(yAt(0.38, span))], [X(span), Y(yAt(-0.05, span))], [X(-span), Y(yAt(-0.05, -span))]]));
  } else if (pattern === "chest") {
    out.push(rect(-10, Y(KIT.top - 0.88), p.w + 20, Y(KIT.top - 1.28) - Y(KIT.top - 0.88)));
  } else if (pattern === "side") {
    const inner = 0.75 * half; // |x| > 0.75 W, the same both sides
    out.push(rect(-10, -10, half - inner + 10, p.h + 20), rect(half + inner, -10, half + 10, p.h + 20));
  } else if (pattern === "pin") {
    // fract(3.2x + 0.25) < 0.16
    for (let n = -8; n <= 8; n++) {
      const a = X((n - 0.25) / 3.2), b = X((n - 0.09) / 3.2);
      out.push(rect(Math.min(a, b), -10, Math.abs(b - a), p.h + 20));
    }
  } else if (pattern === "rings") {
    // fract(1.35y + 0.1) < 0.42
    for (let n = -6; n <= 6; n++) {
      const a = Y((n - 0.1) / 1.35), b = Y((n + 0.32) / 1.35);
      out.push(rect(-10, Math.min(a, b), p.w + 20, Math.abs(b - a)));
    }
  }
  return out;
}

/** the side's pattern in its second colour, clipped to the cut line */
function patternShapes(p: Piece, look: SideLook, cut: Seg[], part: Part): Shape[] {
  if (look.pattern === "plain" || !look.patternColor) return [];
  const out: Shape[] = [];
  if (look.pattern === "stripes") {
    // 7 equal stripes across, the 2nd, 4th and 6th in the pattern colour
    const sw = p.w / 7;
    for (let i = 1; i < 7; i += 2) out.push({ kind: "path", fill: look.patternColor, clip: cut, segs: rect(i * sw, 0, sw, p.h) });
  } else if (look.pattern === "hoops") {
    // hoops: bands from below the armholes down, leaving the hem band clear
    const top = p.h * 0.38, bottom = p.h - 20;
    const bh = (bottom - top) / 5;
    for (let i = 0; i < 5; i += 2) out.push({ kind: "path", fill: look.patternColor, clip: cut, segs: rect(0, top + i * bh, p.w, bh) });
  } else {
    for (const segs of kitPattern(p, look.pattern, part === "back")) out.push({ kind: "path", fill: look.patternColor, clip: cut, segs });
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
  out.push(...patternShapes(p, look, cut, part));
  // rib bands, clipped to the cut line: the template's broad shapes, or strokes along the cut line
  const rib = look.rib;
  if (rib) for (const r of opts.ribs ?? []) {
    out.push("d" in r
      ? { kind: "path", segs: parsePath(r.d), fill: rib[r.zone], clip: cut }
      : { kind: "path", segs: parsePath(r.line), stroke: rib[r.zone], width: r.width, clip: cut });
  }

  if (part === "front") {
    const L = frontLayout(!!art.logoLeft);
    if (art.show.frontNumber) {
      const t = textShape(art.number, art.font, { h: L.number.h * k }, { cx: L.number.cx * p.w, top: L.number.top * p.h });
      if (t) out.push(...inked(t.segs, look, k));
    }
    if (art.show.frontLogo && art.logo) {
      const g = art.logo.scale ?? 1;
      let h = L.logo.h * k * g, w = (h * art.logo.w) / art.logo.h;
      if (w > L.logo.maxW * k * g) { w = L.logo.maxW * k * g; h = (w * art.logo.h) / art.logo.w; }
      // a smaller logo keeps its centre where the full-size one would be
      const top = L.logo.top * p.h + ((1 - g) * L.logo.h * k) / 2;
      out.push({ kind: "image", png: art.logo.png, x: L.logo.cx * p.w - w / 2, y: top, w, h, ...(art.logo.tint ? { tint: look.ink } : {}) });
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
