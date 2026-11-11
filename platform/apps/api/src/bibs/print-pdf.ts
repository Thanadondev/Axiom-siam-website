import {
  PDFDocument, PDFName, PDFOperator, PDFRef, appendBezierCurve, clip, closePath, concatTransformationMatrix, drawObject,
  endPath, fill, fillAndStroke, lineTo, moveTo, popGraphicsState, pushGraphicsState, setFillingCmykColor, setLineJoin,
  setLineWidth, setStrokingCmykColor, stroke, LineJoinStyle,
} from "pdf-lib";
import { ink, pngToCmyk } from "./color";
import type { Shape } from "./draw";
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

/** a DeviceCMYK image (with a soft mask for the PNG's transparency) */
function cmykImage(doc: PDFDocument, png: Uint8Array): PDFRef {
  const { w, h, cmyk, alpha } = pngToCmyk(png);
  const ctx = doc.context;
  const smask = alpha ? ctx.register(ctx.flateStream(alpha, { Type: "XObject", Subtype: "Image", Width: w, Height: h, ColorSpace: "DeviceGray", BitsPerComponent: 8 })) : undefined;
  return ctx.register(ctx.flateStream(cmyk, {
    Type: "XObject", Subtype: "Image", Width: w, Height: h, ColorSpace: "DeviceCMYK", BitsPerComponent: 8,
    ...(smask ? { SMask: smask } : {}),
  }));
}

export async function printPdf(shapes: Shape[], wMm: number, hMm: number, meta: { title: string }): Promise<PrintPdf> {
  if (wMm > MAX_SIDE_MM || hMm > MAX_SIDE_MM) throw new Error(`print sheet ${Math.round(wMm)}×${Math.round(hMm)} mm is larger than Illustrator allows`);
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  doc.setCreator("Axiom Siam website");
  doc.setProducer("Axiom Siam website");
  const page = doc.addPage([wMm * PT, hMm * PT]);
  const images = new Map<Uint8Array, PDFName>();
  const offChart = new Map<string, string>();
  const cmyk = (hex: string): [number, number, number, number] => {
    const i = ink(hex);
    if (!i.onChart) offChart.set(i.hex, `C${i.cmyk[0]} M${i.cmyk[1]} Y${i.cmyk[2]} K${i.cmyk[3]}`);
    return [i.cmyk[0] / 100, i.cmyk[1] / 100, i.cmyk[2] / 100, i.cmyk[3] / 100];
  };
  const ops: PDFOperator[] = [
    pushGraphicsState(),
    // mm, y down, origin top-left
    concatTransformationMatrix(PT, 0, 0, -PT, 0, hMm * PT),
    setLineJoin(LineJoinStyle.Round),
  ];
  for (const s of shapes) {
    if (s.kind === "image") {
      let name = images.get(s.png);
      if (!name) { name = page.node.newXObject("Image", cmykImage(doc, s.png)); images.set(s.png, name); }
      // the image space is a unit square, y up: flip it back
      ops.push(pushGraphicsState(), concatTransformationMatrix(s.w, 0, 0, -s.h, s.x, s.y + s.h), drawObject(name), popGraphicsState());
      continue;
    }
    ops.push(pushGraphicsState());
    if (s.clip) ops.push(...pathOps(s.clip), clip(), endPath());
    if (s.fill) ops.push(setFillingCmykColor(...cmyk(s.fill)));
    if (s.stroke) ops.push(setStrokingCmykColor(...cmyk(s.stroke)), setLineWidth(s.width ?? 0.353));
    ops.push(...pathOps(s.segs), s.fill && s.stroke ? fillAndStroke() : s.fill ? fill() : stroke());
    ops.push(popGraphicsState());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);
  return { pdf: await doc.save(), offChart: [...offChart].map(([h, c]) => `${h} → ${c}`) };
}
