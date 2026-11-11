import { zipSync } from "fflate";
import { jobFolderName, safeName } from "../orders/nas-export";
import { BibDesignSchema, type BibDesign, type RosterRow } from "./design";
import { drawPiece, moveShapes, pngSize, CUT_COLOR, type Art, type Shape } from "./draw";
import { orderSheetJpeg, orderSheetSvg, type SheetMeta } from "./order-sheet";
import { printPdf } from "./print-pdf";
import { BIB_SIZES, layoutFor, ribsFor, SIZE_NAME, TEMPLATE, type BibSize, type Side } from "./template";
import { textShape } from "./text";
import { xlsx } from "./xlsx";

/**
 * A web-designed bib order as the same job package the graphics team makes:
 *
 *   <job>/<size>/<nn> No.<number> <name>_ol.pdf   one file per bib, laid out as the
 *                                                  template is: a normal bib's front and
 *                                                  back (2 pieces), a reversible one's
 *                                                  reverse under them (4), CMYK only
 *   <job>/<job>_<size>.jpg                         order sheet per size
 *   <job>/<job>.xlsx                               name / number / size list
 *   <job>/<job>_design.json                        what the customer picked, to build it again
 *
 * <job> is the NAS folder name: "<web order no> R-bib (ML) <team>".
 */

export interface BuiltJob {
  name: string;
  zip: Uint8Array;
  /** the first order sheet, for the order's picture */
  preview: Uint8Array;
  files: { path: string; bytes: number }[];
  counts: Partial<Record<BibSize, number>>;
  /** colours not on the DTP chart, as they were converted */
  offChart: string[];
}

const bySize = (roster: RosterRow[]) => {
  const m = new Map<BibSize, RosterRow[]>();
  for (const z of BIB_SIZES) m.set(z, []);
  for (const r of roster) m.get(r.size)!.push(r);
  for (const rows of m.values()) rows.sort((a, b) => (Number(a.number || 1e9) - Number(b.number || 1e9)) || a.name.localeCompare(b.name));
  return [...m].filter(([, rows]) => rows.length) as [BibSize, RosterRow[]][];
};

const artFor = (d: BibDesign, r: RosterRow, logo?: Art["logo"]): Art => ({
  font: d.font, team: d.team, name: r.name, number: r.number, logo, show: d.show,
});

/** one bib's print file */
async function bibFile(d: BibDesign, size: BibSize, r: RosterRow, tag: string, logo: Art["logo"], title: string) {
  const sides: Side[] = d.product === "bib_r" ? ["A", "B"] : ["A"];
  const { page, pieces } = layoutFor(size, sides);
  const shapes: Shape[] = [];
  const t = textShape(tag, "label", { h: 4.5 }, { x: 10, top: 2.5 }, 1);
  if (t) shapes.push({ kind: "path", segs: t.segs, fill: CUT_COLOR });
  for (const { side, part, piece } of pieces) {
    const look = d.sides[side === "A" ? 0 : 1];
    shapes.push(...moveShapes(drawPiece(piece, part, look, artFor(d, r, logo), { ribs: ribsFor(size, part), cutLine: true, sizeMark: SIZE_NAME[size] }), piece.x, piece.y));
  }
  return printPdf(shapes, page.w, page.h, { title });
}

export async function buildBibJob(input: unknown, meta: SheetMeta & { logoPng?: Uint8Array }): Promise<BuiltJob> {
  const d = BibDesignSchema.parse(input);
  const logo = meta.logoPng ? { png: meta.logoPng, ...pngSize(meta.logoPng) } : undefined;
  const groups = bySize(d.roster);
  const counts = Object.fromEntries(groups.map(([z, rows]) => [z, rows.length])) as Partial<Record<BibSize, number>>;
  const name = jobFolderName({ orderNo: meta.ref, product: d.product, sizes: groups.map(([z]) => z), team: d.team || null });
  const files: Record<string, Uint8Array> = {};
  const offChart = new Set<string>();
  let preview: Uint8Array | undefined;

  for (const [size, rows] of groups) {
    const folder = `${name}/${safeName(SIZE_NAME[size])}`;
    const used = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const nn = String(i + 1).padStart(rows.length >= 100 ? 3 : 2, "0");
      let file = safeName([nn, r.number && `No.${r.number}`, r.name].filter(Boolean).join(" "), 80);
      while (used.has(file)) file += "_";
      used.add(file);
      const tag = [meta.ref, d.team, r.number && `No.${r.number}`, r.name, SIZE_NAME[size], `${i + 1}/${rows.length}`].filter(Boolean).join("   ");
      const out = await bibFile(d, size, r, tag, logo, `${name} ${SIZE_NAME[size]} ${file}`);
      out.offChart.forEach(c => offChart.add(c));
      files[`${folder}/${file}_ol.pdf`] = out.pdf;
    }
    const { svg } = orderSheetSvg(d, artFor(d, rows[0], logo), size, counts, meta);
    const jpg = orderSheetJpeg(svg);
    files[`${name}/${name}_${safeName(SIZE_NAME[size])}.jpg`] = jpg;
    preview ??= jpg;
  }

  const list: (string | number)[][] = [["No.", "Name", "Number", "Size"]];
  groups.forEach(([size, rows]) => rows.forEach(r => list.push([list.length, r.name, r.number, SIZE_NAME[size]])));
  list.push([], ["Size", "Qty"], ...groups.map(([z, rows]) => [SIZE_NAME[z], rows.length] as (string | number)[]), ["Total", d.roster.length]);
  files[`${name}/${name}.xlsx`] = xlsx(safeName(d.team || "Bibs", 31), list, [8, 24, 10, 12]);
  files[`${name}/${name}_design.json`] = new TextEncoder().encode(JSON.stringify({ template: TEMPLATE.code, ref: meta.ref, design: d, offChart: [...offChart] }, null, 2));

  const zip = zipSync(files, { level: 6 });
  return {
    name, zip, preview: preview!, counts, offChart: [...offChart],
    files: Object.entries(files).map(([path, b]) => ({ path, bytes: b.length })),
  };
}
