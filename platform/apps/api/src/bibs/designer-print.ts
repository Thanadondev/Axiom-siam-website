import { z } from "zod";
import { zipSync } from "fflate";
import { jobFolderName, safeName } from "../orders/nas-export";
import { CUT_COLOR, pngSize, type Affine, type Shape } from "./draw";
import { orderSheetJpeg, svgShapes, label, box, type SheetMeta } from "./order-sheet";
import { parsePath, type Seg } from "./path";
import { printPdf } from "./print-pdf";
import { BIB_SIZES, layoutFor, piecesFor, ribsFor, SIZE_NAME, TEMPLATE, type BibSize, type Part, type Piece, type Side } from "./template";
import { textShape } from "./text";
import { xlsx } from "./xlsx";
import { inkText } from "./color";
import { yieldToOthers, type BuiltJob } from "./job";

/**
 * A design from the advanced designer (apps/web/public/designer), made ready to
 * print: the browser that drew it lays every shape down as outlines (text
 * included, in the font the customer saw) on the bib's own pattern, and sends
 * them here once, when the order is placed. The job is then built as a web bib's
 * is: one print file per bib on CB-005, the order sheet per size, the list.
 *
 * Everything is in mm on the piece it was drawn on — origin at the cut line's
 * top-left, y down — at the one size the customer drew (`size`). The other
 * sizes take it as the factory would: each shape keeps its place across and
 * down the piece and grows with the piece's width; a shape that spans the piece
 * (a background) is stretched to the new piece instead.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(s => s.toLowerCase());
const num = z.number().finite();
const matrix = z.tuple([num, num, num, num, num, num]);

/** a filled / stroked outline: `d` in its own units, `m` taking them to mm */
const PathItem = z.object({
  d: z.string().min(1).max(600_000),
  m: matrix,
  fill: hex.optional(),
  stroke: hex.optional(),
  /** stroke width in the path's own units */
  sw: z.number().min(0).max(10_000).optional(),
  /** even-odd fill */
  eo: z.boolean().optional(),
  /** a dashed stroke: dash and gap lengths, in the path's own units */
  dash: z.array(z.number().min(0).max(10_000)).max(16).optional(),
  /** the artwork's own clip (a logo's clip path), already in mm on the piece drawn */
  clip: z.string().min(1).max(200_000).optional(),
});
/** a picture: `img` indexes `images`, `m` takes its unit square (y down) to mm */
const ImageItem = z.object({
  img: z.number().int().min(0), m: matrix,
  /** a crop: the part of the picture shown, in mm on the piece drawn */
  clip: z.string().min(1).max(200_000).optional(),
});
const Item = z.union([PathItem, ImageItem]);

/** one thing the customer placed, with its centre and size (mm) so it can be carried to another size */
const Obj = z.object({
  c: z.tuple([num, num]),
  w: z.number().min(0),
  h: z.number().min(0),
  /** lettering: carried to another size uniformly, never stretched like a background */
  text: z.boolean().optional(),
  items: z.array(Item).max(20_000),
});

export const DESIGNER_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

export const DesignerPrintSchema = z.object({
  app: z.literal("axiom-print"),
  v: z.literal(1),
  /** the size it was drawn on */
  size: z.enum(DESIGNER_SIZES),
  /** "แบบ 2": both sides (an R-bib) */
  reversible: z.boolean(),
  /** the order's name, for the job folder and the sheet */
  team: z.string().max(80).default(""),
  /** the bib's colour and its trim, as the designer paints them */
  body: hex,
  trimColor: hex,
  trim: z.enum(["none", "neck", "neckarm", "full"]),
  /** a pattern picture covering the bib (index into images) */
  pattern: z.number().int().min(0).optional(),
  /** base64 PNGs, shared by every bib */
  images: z.array(z.string().max(16_000_000)).max(60).default([]),
  /** what every bib carries, per piece */
  panels: z.array(z.object({ side: z.enum(["A", "B"]), part: z.enum(["front", "back"]), objs: z.array(Obj).max(1000) })).min(1).max(4),
  /** the players, each with their own name / number fields (index into panels) */
  players: z.array(z.object({
    name: z.string().max(60).default(""),
    number: z.string().max(10).default(""),
    size: z.string().max(10).default(""),
    objs: z.array(Obj.extend({ panel: z.number().int().min(0).max(3) })).max(40),
  })).max(2000),
});
export type DesignerPrint = z.infer<typeof DesignerPrintSchema>;
type PrintObj = z.infer<typeof Obj>;
type Player = DesignerPrint["players"][number];

// ------------------------------------------------------------ geometry

/** A · B: B first, then A */
export function compose(A: Affine, B: Affine): Affine {
  return [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

export function transformPath(segs: Seg[], m: Affine): Seg[] {
  const X = (x: number, y: number) => m[0] * x + m[2] * y + m[4];
  const Y = (x: number, y: number) => m[1] * x + m[3] * y + m[5];
  return segs.map(s => s.op === "Z" ? s
    : s.op === "C" ? { op: "C", x1: X(s.x1, s.y1), y1: Y(s.x1, s.y1), x2: X(s.x2, s.y2), y2: Y(s.x2, s.y2), x: X(s.x, s.y), y: Y(s.x, s.y) }
    : { op: s.op, x: X(s.x, s.y), y: Y(s.x, s.y) });
}

/** a share of the piece past which a shape counts as spanning it (a background), and is stretched with it */
const SPAN = 0.9;

/**
 * Carries a shape from the piece it was drawn on to another size's: its centre
 * keeps its place across (from the middle) and down (from the top), and it grows
 * with the piece's width — or, spanning the piece, with its width and height.
 */
export function fitToSize(o: { c: [number, number]; w: number; h: number; text?: boolean }, from: { w: number; h: number }, to: { w: number; h: number }): Affine {
  const kw = to.w / from.w, kh = to.h / from.h;
  const spans = !o.text && (o.w > SPAN * from.w || o.h > SPAN * from.h);
  const sx = kw, sy = spans ? kh : kw;
  const cx = to.w / 2 + (o.c[0] - from.w / 2) * kw, cy = o.c[1] * kh;
  return [sx, 0, 0, sy, cx - sx * o.c[0], cy - sy * o.c[1]];
}

/** a name or number keeps this far inside the cut line: the trim band along the armholes is up to 20 mm, and 15 mm clear of it */
export const FIT_MARGIN_MM = 35;

const outlines = new WeakMap<object, { x: number; y: number }[]>();
/** the cut line as points, curves sampled */
function outline(piece: Piece) {
  let pts = outlines.get(piece);
  if (pts) return pts;
  pts = [];
  let x = 0, y = 0;
  for (const s of parsePath(piece.cut)) {
    if (s.op === "Z") continue;
    if (s.op === "C") {
      // every 3 mm or so: an armhole is one long curve, and a name is looked up by height
      const len = Math.hypot(s.x1 - x, s.y1 - y) + Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + Math.hypot(s.x - s.x2, s.y - s.y2);
      const n = Math.max(16, Math.ceil(len / 3));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        pts.push({ x: u * u * u * x + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x, y: u * u * u * y + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y });
      }
    } else if (s.op === "L") {
      const n = Math.max(1, Math.ceil(Math.hypot(s.x - x, s.y - y) / 5));
      for (let i = 1; i <= n; i++) pts.push({ x: x + (s.x - x) * i / n, y: y + (s.y - y) * i / n });
    } else pts.push({ x: s.x, y: s.y });
    x = s.x; y = s.y;
  }
  outlines.set(piece, pts);
  return pts;
}

/**
 * How much a name or number, centred at c and w × h mm on this piece, must shrink
 * (≤ 1) to sit inside the cut line at its height, clear of the trim — the
 * designer fits it on the size drawn; another size's armholes sit elsewhere.
 */
export function fitInPiece(piece: Piece, c: [number, number], w: number, h: number): number {
  const pts = outline(piece), mid = piece.w / 2;
  let left = -Infinity, right = Infinity;
  const y0 = c[1] - h / 2, y1 = c[1] + h / 2;
  for (let yy = y0; yy <= y1 + 1e-6; yy += Math.max(1, (y1 - y0) / 8)) {
    const near = pts.filter(q => Math.abs(q.y - yy) < 4);
    const l = near.filter(q => q.x < mid), r = near.filter(q => q.x > mid);
    if (!l.length || !r.length) continue;
    left = Math.max(left, Math.min(...l.map(q => q.x)));
    right = Math.min(right, Math.max(...r.map(q => q.x)));
  }
  if (!isFinite(left) || !isFinite(right) || w <= 0) return 1;
  const half = Math.min(c[0] - (left + FIT_MARGIN_MM), right - FIT_MARGIN_MM - c[0]);
  return half > 0 ? Math.min(1, (2 * half) / w) : 1;
}

// ------------------------------------------------------------ drawing

/** the designer's units (public/designer/sizes.js): 1 unit = 1.86347 mm */
export const DESIGNER_UNIT_MM = 1.86347;
/**
 * What the designer's pattern picture covers (editor.js svgFrame): its 400 × 470 frame,
 * or the piece and its 7 mm cut line (+2 units) where that is bigger (XXL), centred on the piece.
 */
export function patternBox(piece: { w: number; h: number }) {
  const margin = 2 * (7 + 2 * DESIGNER_UNIT_MM);
  return { w: Math.max(400 * DESIGNER_UNIT_MM, piece.w + margin), h: Math.max(470 * DESIGNER_UNIT_MM, piece.h + margin) };
}

export interface DesignerPictures { png: Uint8Array[]; size: { w: number; h: number }[] }

export function pictures(d: DesignerPrint): DesignerPictures {
  const png = d.images.map(b => new Uint8Array(Buffer.from(b, "base64")));
  return { png, size: png.map(p => pngSize(p)) };
}

/** path data parsed once: a team's shared artwork is the same on every bib of the job */
const parsed = new Map<string, Seg[]>();
function parsedOnce(d: string): Seg[] {
  let segs = parsed.get(d);
  if (!segs) {
    segs = parsePath(d);
    if (parsed.size > 5000) parsed.clear();
    parsed.set(d, segs);
  }
  return segs;
}

const TRIM_ZONES: Record<DesignerPrint["trim"], ("neck" | "arm" | "hem")[]> = {
  none: [], neck: ["neck"], neckarm: ["neck", "arm"], full: ["neck", "arm", "hem"],
};

/** a piece of one size, with the shared art and this player's fields on it, as shapes in mm on the piece */
export function designerPiece(
  d: DesignerPrint, pics: DesignerPictures, size: BibSize, side: Side, part: Part, piece: Piece, player: Player | null,
  opts: { cutLine?: boolean; sizeMark?: string } = {},
): Shape[] {
  const cut = parsePath(piece.cut);
  const drawn = piecesFor(d.size, "A")[part];
  const out: Shape[] = [{ kind: "path", segs: cut, fill: d.body }];

  // the pattern picture as the designer lays it: covering its frame, centred on the piece (no stretch),
  // so the pattern keeps its size in cm on every size and a bigger piece shows more of it
  if (d.pattern !== undefined && pics.png[d.pattern]) {
    const { w, h } = pics.size[d.pattern];
    const box = patternBox(piece);
    const k = Math.max(box.w / w, box.h / h);
    const x = (piece.w - w * k) / 2, y = (piece.h - h * k) / 2;
    // the designer shows the inside (side B) mirrored — the picture with it, the artwork not
    out.push(side === "B"
      ? { kind: "image", png: pics.png[d.pattern], x: 0, y: 0, w: 1, h: 1, m: [-w * k, 0, 0, h * k, x + w * k, y], clip: cut }
      : { kind: "image", png: pics.png[d.pattern], x, y, w: w * k, h: h * k, clip: cut });
  }

  const idx = d.panels.findIndex(p => p.side === side && p.part === part);
  const mine = player?.objs.filter(o => o.panel === idx) ?? [];
  const objs: PrintObj[] = idx < 0 ? [] : [...d.panels[idx].objs, ...mine];
  for (const o of objs) {
    let fit = fitToSize(mine.includes(o as (typeof mine)[number]) ? { ...o, text: true } : o, drawn, piece);
    // a player's name / number on another size: kept inside that piece at its height
    if (mine.includes(o as (typeof mine)[number])) {
      const c: [number, number] = [fit[0] * o.c[0] + fit[4], fit[3] * o.c[1] + fit[5]];
      const k = fitInPiece(piece, c, o.w * fit[0], o.h * fit[3]);
      if (k < 1) fit = compose([k, 0, 0, k, c[0] * (1 - k), c[1] * (1 - k)], fit);
    }
    for (const it of o.items) {
      const m = compose(fit, it.m as Affine);
      // its own clip is in mm on the piece drawn: carried to this size with the object
      const artClip = it.clip ? transformPath(parsedOnce(it.clip), fit) : undefined;
      if ("img" in it) {
        if (pics.png[it.img]) out.push({ kind: "image", png: pics.png[it.img], x: 0, y: 0, w: 1, h: 1, m, clip: cut, ...(artClip ? { artClip } : {}) });
        continue;
      }
      if (!it.fill && !it.stroke) continue;
      const segs = transformPath(parsedOnce(it.d), m);
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      out.push({
        kind: "path", segs, clip: cut,
        ...(it.fill ? { fill: it.fill } : {}),
        ...(it.stroke && (it.sw ?? 1) > 0 ? { stroke: it.stroke, width: (it.sw ?? 1) * scale } : {}),
        ...(it.eo ? { evenOdd: true } : {}),
        ...(artClip ? { artClip } : {}),
        ...(it.stroke && it.dash?.length ? { dash: it.dash.map(v => v * scale) } : {}),
      });
    }
  }

  // the trim, over the art as the designer shows it
  const zones = TRIM_ZONES[d.trim];
  for (const r of ribsFor(size, part)) {
    if (!zones.includes(r.zone)) continue;
    out.push("d" in r
      ? { kind: "path", segs: parsePath(r.d), fill: d.trimColor, clip: cut }
      : { kind: "path", segs: parsePath(r.line), stroke: d.trimColor, width: r.width, clip: cut });
  }

  if (opts.cutLine) out.push({ kind: "path", segs: cut, stroke: CUT_COLOR, width: 0.353 });
  if (opts.sizeMark) {
    const t = textShape(opts.sizeMark, "label", { h: 4.5 }, { right: piece.w - 4, bottom: piece.h - 2.5 }, 2);
    if (t) out.push({ kind: "path", segs: t.segs, fill: CUT_COLOR });
  }
  return out;
}

// ------------------------------------------------------------ the order's bibs

export interface DesignerRow { name: string; number: string; size: BibSize; player: Player | null }

const key = (name: string, number: string) => `${name.trim().toLowerCase()}|${number.trim()}`;

/**
 * One row per bib, from the order's lines and names, each with the player the
 * designer drew it for (matched by name and number). A bib with no name on the
 * list — a spare — has the shared art only. A name the designer never drew is
 * refused: its file would go out without it.
 */
export function designerRows(
  d: DesignerPrint,
  items: { size: string; qty: number; roster: { playerName: string | null; number: string | null; qty: number }[] }[],
): DesignerRow[] {
  const pool = new Map<string, Player[]>();
  for (const p of d.players) {
    const k = key(p.name, p.number);
    pool.set(k, [...(pool.get(k) ?? []), p]);
  }
  const rows: DesignerRow[] = [];
  const missing: string[] = [];
  for (const it of items) {
    if (!(BIB_SIZES as readonly string[]).includes(it.size)) continue;
    const size = it.size as BibSize;
    let left = it.qty;
    for (const r of it.roster) {
      for (let n = 0; n < r.qty && left > 0; n++, left--) {
        const name = r.playerName ?? "", number = r.number ?? "";
        if (!name.trim() && !number.trim()) { rows.push({ name: "", number: "", size, player: null }); continue; }
        const list = pool.get(key(name, number));
        const player = list?.shift() ?? d.players.find(p => key(p.name, p.number) === key(name, number)) ?? null;
        if (!player) missing.push([number && `No.${number}`, name].filter(Boolean).join(" "));
        rows.push({ name, number, size, player });
      }
    }
    for (; left > 0; left--) rows.push({ name: "", number: "", size, player: null });
  }
  if (missing.length) throw new Error(`not in the design's print data: ${missing.join(", ")} — open the design and order again`);
  return rows;
}

// ------------------------------------------------------------ the order sheet

const RED = "#e60012", INK = "#231f20";

/** the sheet for one size: every piece of its first bib, the trim, how many of what */
export function designerSheetSvg(d: DesignerPrint, pics: DesignerPictures, size: BibSize, row: DesignerRow, counts: Partial<Record<BibSize, number>>, meta: SheetMeta) {
  const sides: Side[] = d.reversible ? ["A", "B"] : ["A"];
  const W = 2400, colW = 860, gapX = 190, left = 150; // as order-sheet.ts: clear of the rib colour box
  const pA = piecesFor(size, "A");
  const s = Math.min(colW / Math.max(pA.front.w, pA.back.w), 1.6);
  const pieceH = Math.max(pA.front.h, pA.back.h) * s;
  const top = 230, rowH = pieceH + 140;
  const H = top + rowH * sides.length + 260;
  const out: Shape[] = [];
  const product = d.reversible ? "Reversible Bibs" : "Normal Bibs";

  out.push({ kind: "path", segs: box(0, 0, W, 92), fill: RED });
  label(`${meta.ref} ${d.team} ${product} ${SIZE_NAME[size]} size`.replace(/\s+/g, " "), 34, { x: 28, cy: 46 }, "#ffffff", out);
  label(`${meta.date.getFullYear()}.${meta.date.getMonth() + 1}.${meta.date.getDate()}`, 34, { right: W - 28, cy: 46 }, "#ffffff", out);
  label(`Advanced designer - drawn on size ${SIZE_NAME[d.size]}; other sizes scaled to the pattern. Colours on screen may differ slightly.`, 18, { x: 28, cy: 122 }, INK, out);

  sides.forEach((side, r) => {
    const pcs = piecesFor(size, side);
    (["front", "back"] as Part[]).forEach((part, col) => {
      const p = pcs[part];
      const x0 = left + col * (colW + gapX), y0 = top + r * rowH;
      const shapes = designerPiece(d, pics, size, side, part, p, row.player);
      shapes.push({ kind: "path", segs: parsePath(p.cut), stroke: "#bcbec0", width: 1.5 / s });
      out.push(...shapes.map(sh => moveScaled(sh, x0, y0, s)));
      label(`${r ? "Reversible " : ""}${part === "front" ? "Front" : "Back"}`, 30, { cx: x0 + (p.w * s) / 2, top: y0 + p.h * s + 40 }, INK, out);
    });
  });

  // the trim colour, right of the pieces
  const rx = W - 305, ry = top + 20, bw = 290;
  out.push({ kind: "path", segs: box(rx, ry, bw, 150), stroke: RED, width: 3, fill: "#ffffff" });
  out.push({ kind: "path", segs: box(rx, ry, bw, 36), fill: RED });
  label("RIB COLOUR", 16, { cx: rx + bw / 2, cy: ry + 18 }, "#ffffff", out);
  if (d.trim === "none") label("No rib bands", 18, { x: rx + 16, cy: ry + 90 }, INK, out);
  else {
    out.push({ kind: "path", segs: box(rx + 16, ry + 50, 40, 40), fill: d.trimColor, stroke: "#bcbec0", width: 2 });
    label({ neck: "Neck", neckarm: "Neck, sleeves", full: "Neck, sleeves, hem" }[d.trim], 15, { x: rx + 66, cy: ry + 70 }, INK, out);
    label(inkText(d.trimColor), 13, { x: rx + 16, top: ry + 106 }, "#6d6e71", out);
  }

  const fy = H - 230;
  const notes = [...(meta.notes ?? [])];
  notes.reverse().forEach((n, i) => label(n, 18, { x: 28, bottom: fy - 16 - i * 28 }, RED, out));
  out.push({ kind: "path", segs: box(0, fy, W, 86), fill: RED });
  label(`Order Sheet ${meta.ref}`, 48, { cx: W / 2, cy: fy + 43 }, "#ffffff", out);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const bySize = (Object.keys(counts) as BibSize[]).map(z => `${SIZE_NAME[z]} ${counts[z]}`).join(" · ");
  label(`${product} x ${total} pcs  (${bySize})`, 36, { cx: W / 2, top: fy + 112 }, RED, out);
  label(`Fabric : ${meta.fabric ?? "Mesh full sublimation"}      Brand : ${meta.brand ?? "OEM"}      Pattern : ${TEMPLATE.code}`, 30, { cx: W / 2, top: fy + 172 }, RED, out);

  const { defs, body } = svgShapes(out, { n: 0 });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><defs>${defs}</defs>${body}</svg>`, width: W, height: H };
}

function moveScaled(sh: Shape, dx: number, dy: number, k: number): Shape {
  const m: Affine = [k, 0, 0, k, dx, dy];
  if (sh.kind === "image") {
    const own: Affine = sh.m ?? [sh.w, 0, 0, sh.h, sh.x, sh.y];
    return { ...sh, m: compose(m, own), clip: sh.clip && transformPath(sh.clip, m), artClip: sh.artClip && transformPath(sh.artClip, m) };
  }
  return { ...sh, segs: transformPath(sh.segs, m), clip: sh.clip && transformPath(sh.clip, m), artClip: sh.artClip && transformPath(sh.artClip, m), width: sh.width !== undefined ? sh.width * k : undefined, dash: sh.dash?.map(v => v * k) };
}

// ------------------------------------------------------------ the job

/**
 * The job package, laid out as a web bib's (bibs/job.ts):
 *   <job>/<size>/<nn> No.<number> <name>_ol.pdf, <job>/<job>_<size>.jpg, <job>/<job>.xlsx, <job>/<job>_design.json
 */
/**
 * What the print manager reads from <job>_design.json to lay the files out (its web_job.py,
 * rule R1): the product, each side's body and trim band colours (a band of another colour
 * means a vertical layout with a stroke), and the fabric (B1 / C1 vertical) — the same fields
 * a web bib's design.json has.
 */
export function designerFacts(d: DesignerPrint, fabric?: string) {
  const zones = TRIM_ZONES[d.trim];
  const side = { body: d.body, ...(zones.length ? { rib: Object.fromEntries((["neck", "arm", "hem"] as const).map(z => [z, zones.includes(z) ? d.trimColor : d.body])) } : {}) };
  return {
    product: d.reversible ? "bib_r" as const : "bib_n" as const,
    sides: d.reversible ? [side, side] : [side],
    kit: { id: "advanced", code: "ADV", name: "Advanced designer", ...(fabric ? { fabric } : {}) },
  };
}

export async function buildDesignerJob(input: unknown, rows: DesignerRow[], meta: SheetMeta & { fabricId?: string }): Promise<BuiltJob> {
  const d = DesignerPrintSchema.parse(input);
  const pics = pictures(d);
  const product = d.reversible ? "bib_r" : "bib_n";
  const sides: Side[] = d.reversible ? ["A", "B"] : ["A"];
  const groups = BIB_SIZES.map(z => [z, rows.filter(r => r.size === z).sort((a, b) => (Number(a.number || 1e9) - Number(b.number || 1e9)) || a.name.localeCompare(b.name))] as const)
    .filter(([, rs]) => rs.length);
  if (!groups.length) throw new Error("the order has no bibs");
  const counts = Object.fromEntries(groups.map(([z, rs]) => [z, rs.length])) as Partial<Record<BibSize, number>>;
  const name = jobFolderName({ orderNo: meta.ref, product, sizes: groups.map(([z]) => z), team: d.team || null });
  const files: Record<string, Uint8Array> = {};
  const offChart = new Set<string>();
  let preview: Uint8Array | undefined;
  const notes = [...(meta.notes ?? [])];
  if (groups.some(([z]) => z !== d.size)) notes.push(`Drawn on ${SIZE_NAME[d.size]}: the other sizes are scaled to the pattern by the website - check them before printing`);

  for (const [size, rs] of groups) {
    const folder = `${name}/${safeName(SIZE_NAME[size])}`;
    const used = new Set<string>();
    for (const [i, r] of rs.entries()) {
      const nn = String(i + 1).padStart(rs.length >= 100 ? 3 : 2, "0");
      let file = safeName([nn, r.number && `No.${r.number}`, r.name].filter(Boolean).join(" "), 80);
      while (used.has(file)) file += "_";
      used.add(file);
      const tag = [meta.ref, d.team, r.number && `No.${r.number}`, r.name, SIZE_NAME[size], `${i + 1}/${rs.length}`].filter(Boolean).join("   ");
      const { page, pieces } = layoutFor(size, sides);
      const shapes: Shape[] = [];
      const t = textShape(tag, "label", { h: 4.5 }, { x: 10, top: 2.5 }, 1);
      if (t) shapes.push({ kind: "path", segs: t.segs, fill: CUT_COLOR });
      for (const { side, part, piece } of pieces) {
        shapes.push(...designerPiece(d, pics, size, side, part, piece, r.player, { cutLine: true, sizeMark: SIZE_NAME[size] })
          .map(sh => moveScaled(sh, piece.x, piece.y, 1)));
      }
      const out = await printPdf(shapes, page.w, page.h, { title: `${name} ${SIZE_NAME[size]} ${file}` });
      out.offChart.forEach(c => offChart.add(c));
      files[`${folder}/${file}_ol.pdf`] = out.pdf;
      await yieldToOthers();
    }
    const fabricName = meta.fabricId ? `${meta.fabricId === "mesh" ? "Mesh" : meta.fabricId} full sublimation` : meta.fabric;
    const { svg } = designerSheetSvg(d, pics, size, rs[0], counts, { ...meta, fabric: fabricName, notes });
    const jpg = orderSheetJpeg(svg);
    files[`${name}/${name}_${safeName(SIZE_NAME[size])}.jpg`] = jpg;
    preview ??= jpg;
  }

  const list: (string | number)[][] = [["No.", "Name", "Number", "Size"]];
  groups.forEach(([size, rs]) => rs.forEach(r => list.push([list.length, r.name, r.number, SIZE_NAME[size]])));
  list.push([], ["Size", "Qty"], ...groups.map(([z, rs]) => [SIZE_NAME[z], rs.length] as (string | number)[]), ["Total", rows.length]);
  files[`${name}/${name}.xlsx`] = xlsx(safeName(d.team || "Bibs", 31), list, [8, 24, 10, 12]);
  // what was ordered, without the pictures (they are in every print file)
  const { images, ...rest } = d;
  files[`${name}/${name}_design.json`] = new TextEncoder().encode(JSON.stringify({
    template: TEMPLATE.code, ref: meta.ref, source: "advanced designer", images: images.length,
    design: { ...designerFacts(d, meta.fabricId), ...rest }, offChart: [...offChart], notes,
  }));

  const zip = zipSync(files, { level: 6 });
  return { name, zip, preview: preview!, counts, offChart: [...offChart], files: Object.entries(files).map(([path, b]) => ({ path, bytes: b.length })) };
}
