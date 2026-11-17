import {
  PDFDict, PDFDocument, PDFName, PDFOperator, PDFOperatorNames, PDFRef, setDashPattern, appendBezierCurve, clip, closePath, concatTransformationMatrix, drawObject,
  endPath, fill, fillAndStroke, lineTo, moveTo, popGraphicsState, pushGraphicsState, setFillingCmykColor, setLineJoin,
  setLineWidth, setStrokingCmykColor, stroke, LineJoinStyle, setGraphicsState,
} from "pdf-lib";
import { ink, pngToRgb, tintCmyk, type OwnInks } from "./color";
import type { Grad, Shape } from "./draw";
import type { Seg } from "./path";

/**
 * Shapes (mm, y down) to a one-page PDF at full size, in CMYK only, as the
 * factory prints. Illustrator opens it as an editable file: every shape a
 * vector path, every text already outlined, the logo the only picture. One
 * page, because Illustrator opens a PDF's first page only.
 */
const PT = 72 / 25.4;
/** Illustrator's largest artboard is 5779 mm a side */
export const MAX_SIDE_MM = 5700;

function pathOps(segs: Seg[]): PDFOperator[] {
  return segs.map(s => s.op === "M" ? moveTo(s.x, s.y)
    : s.op === "L" ? lineTo(s.x, s.y)
    : s.op === "C" ? appendBezierCurve(s.x1, s.y1, s.x2, s.y2, s.x, s.y)
    : closePath());
}

export interface PrintPdf {
  pdf: Uint8Array;
  /** colours not on the DTP chart, converted plainly: hex → "C.. M.. Y.. K.." */
  offChart: string[];
}

/** a picture's pixels, kept for the job's other print files (a team's logo and pattern are on every bib) */
type Pixels = { w: number; h: number; alpha: Uint8Array | null } & ({ rgb: Uint8Array } | { cmyk: Uint8Array });
const decoded = new WeakMap<Uint8Array, Map<string, Pixels>>();
function pixels(png: Uint8Array, tint?: string): Pixels {
  let byTint = decoded.get(png);
  if (!byTint) decoded.set(png, (byTint = new Map()));
  let c = byTint.get(tint ?? "");
  if (!c) byTint.set(tint ?? "", (c = tint ? tintCmyk(png, tint) : pngToRgb(png)));
  return c;
}

/**
 * A picture in the print file, with a soft mask for the PNG's transparency: in
 * RGB, for Illustrator to turn into CMYK with the factory's colour settings
 * (pngToRgb says why); a tint (a logo printed in one ink) in that ink's CMYK.
 */
function pictureImage(doc: PDFDocument, png: Uint8Array, tint?: string): PDFRef {
  const px = pixels(png, tint);
  const { w, h, alpha } = px;
  const ctx = doc.context;
  const smask = alpha ? ctx.register(ctx.flateStream(alpha, { Type: "XObject", Subtype: "Image", Width: w, Height: h, ColorSpace: "DeviceGray", BitsPerComponent: 8 })) : undefined;
  return ctx.register(ctx.flateStream("rgb" in px ? px.rgb : px.cmyk, {
    Type: "XObject", Subtype: "Image", Width: w, Height: h, ColorSpace: "rgb" in px ? "DeviceRGB" : "DeviceCMYK", BitsPerComponent: 8,
    ...(smask ? { SMask: smask } : {}),
  }));
}

/**
 * A gradient as a PDF shading in CMYK (axial or radial, kept at its end
 * colours past the ends), which Illustrator opens as a gradient: one colour
 * blend per pair of stops, stitched along 0–1.
 */
function shading(doc: PDFDocument, g: Grad, cmyk: (hex: string) => number[]): PDFRef {
  const ctx = doc.context;
  const stops = [...g.stops].sort((a, b) => a.o - b.o);
  if (stops[0].o > 0) stops.unshift({ ...stops[0], o: 0 });
  if (stops[stops.length - 1].o < 1) stops.push({ ...stops[stops.length - 1], o: 1 });
  if (stops.length === 1) stops.push({ ...stops[0], o: 1 });
  const parts = [];
  for (let i = 1; i < stops.length; i++) parts.push(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: cmyk(stops[i - 1].c), C1: cmyk(stops[i].c), N: 1 }));
  // a hard edge (two stops at one place) needs bounds that still increase
  const bounds: number[] = [];
  for (let i = 1; i < stops.length - 1; i++) bounds.push(Math.min(1, Math.max(stops[i].o, (bounds[bounds.length - 1] ?? 0) + 1e-5)));
  const fn = parts.length === 1 ? parts[0]
    : ctx.obj({ FunctionType: 3, Domain: [0, 1], Functions: parts, Bounds: bounds, Encode: parts.flatMap(() => [0, 1]) });
  const c = g.coords;
  return ctx.register(ctx.obj({
    ShadingType: g.type === "linear" ? 2 : 3, ColorSpace: "DeviceCMYK",
    Coords: g.type === "linear" ? c : [c[3], c[4], 0, c[0], c[1], c[2]],
    Function: fn, Extend: [true, true],
  }));
}

export async function printPdf(shapes: Shape[], wMm: number, hMm: number, meta: { title: string; inks?: OwnInks }): Promise<PrintPdf> {
  if (wMm > MAX_SIDE_MM || hMm > MAX_SIDE_MM) throw new Error(`print sheet ${Math.round(wMm)}×${Math.round(hMm)} mm is larger than Illustrator allows`);
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  doc.setCreator("Axiom Siam website");
  doc.setProducer("Axiom Siam website");
  const page = doc.addPage([wMm * PT, hMm * PT]);
  const images = new Map<Uint8Array, Map<string, PDFName>>();
  const offChart = new Map<string, string>();
  const cmyk = (hex: string): [number, number, number, number] => {
    const i = ink(hex, meta.inks);
    if (!i.onChart) offChart.set(i.hex, `C${i.cmyk[0]} M${i.cmyk[1]} Y${i.cmyk[2]} K${i.cmyk[3]}`);
    return [i.cmyk[0] / 100, i.cmyk[1] / 100, i.cmyk[2] / 100, i.cmyk[3] / 100];
  };
  let nSh = 0;
  const shadingName = (ref: PDFRef) => {
    const res = page.node.normalizedEntries().Resources;
    let dict = res.lookupMaybe(PDFName.of("Shading"), PDFDict);
    if (!dict) { dict = doc.context.obj({}); res.set(PDFName.of("Shading"), dict); }
    nSh += 1;
    const name = PDFName.of("Sh" + nSh);
    dict.set(name, ref);
    return name;
  };
  const gStates = new Map<number, PDFName>();
  const seeThrough = (op?: number): PDFOperator[] => {
    if (op === undefined || op >= 1) return [];
    const k = Math.round(op * 1000) / 1000;
    let name = gStates.get(k);
    if (!name) gStates.set(k, (name = page.node.newExtGState("GS", doc.context.register(doc.context.obj({ Type: "ExtGState", ca: k, CA: k })))));
    return [setGraphicsState(name)];
  };
  const ops: PDFOperator[] = [
    pushGraphicsState(),
    // mm, y down, origin top-left
    concatTransformationMatrix(PT, 0, 0, -PT, 0, hMm * PT),
    setLineJoin(LineJoinStyle.Round),
  ];
  for (const s of shapes) {
    if (s.kind === "image") {
      const byTint = images.get(s.png) ?? new Map<string, PDFName>();
      images.set(s.png, byTint);
      let name = byTint.get(s.tint ?? "");
      if (!name) {
        if (s.tint) cmyk(s.tint); // an off-chart tint is reported like any colour
        name = page.node.newXObject("Image", pictureImage(doc, s.png, s.tint));
        byTint.set(s.tint ?? "", name);
      }
      ops.push(pushGraphicsState(), ...seeThrough(s.opacity));
      if (s.clip) ops.push(...pathOps(s.clip), clip(), endPath());
      if (s.artClip) ops.push(...pathOps(s.artClip), clip(), endPath());
      // the image space is a unit square, y up: flip it back
      ops.push(...(s.m
        ? [concatTransformationMatrix(...s.m), concatTransformationMatrix(1, 0, 0, -1, 0, 1)]
        : [concatTransformationMatrix(s.w, 0, 0, -s.h, s.x, s.y + s.h)]), drawObject(name), popGraphicsState());
      continue;
    }
    ops.push(pushGraphicsState(), ...seeThrough(s.opacity));
    if (s.clip) ops.push(...pathOps(s.clip), clip(), endPath());
    if (s.artClip) ops.push(...pathOps(s.artClip), clip(), endPath());
    if (s.fill && s.grad) {
      // the shape as a clip, the gradient painted through it; its stroke after, on top
      const name = shadingName(shading(doc, s.grad, h => cmyk(h)));
      ops.push(pushGraphicsState(), ...pathOps(s.segs), s.evenOdd ? PDFOperator.of(PDFOperatorNames.ClipEvenOdd) : clip(), endPath(),
        concatTransformationMatrix(...s.grad.m), PDFOperator.of(PDFOperatorNames.ShadingFill, [name]), popGraphicsState());
      if (s.stroke) {
        ops.push(setStrokingCmykColor(...cmyk(s.stroke)), setLineWidth(s.width ?? 0.353));
        if (s.dash?.length) ops.push(setDashPattern(s.dash, 0));
        ops.push(...pathOps(s.segs), stroke());
      }
      ops.push(popGraphicsState());
      continue;
    }
    if (s.fill) ops.push(setFillingCmykColor(...cmyk(s.fill)));
    if (s.stroke) ops.push(setStrokingCmykColor(...cmyk(s.stroke)), setLineWidth(s.width ?? 0.353));
    if (s.stroke && s.dash?.length) ops.push(setDashPattern(s.dash, 0));
    // an even-odd fill (a ring drawn as two outlines in the same direction) keeps its hole
    ops.push(...pathOps(s.segs), s.fill && s.stroke ? (s.evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke) : fillAndStroke())
      : s.fill ? (s.evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill()) : stroke());
    ops.push(popGraphicsState());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);
  return { pdf: await doc.save(), offChart: [...offChart].map(([h, c]) => `${h} → ${c}`) };
}
