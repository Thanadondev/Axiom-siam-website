/**
 * The size counts from the customer's order list (.xlsx) inside their zip, to
 * fill in the quantities for them. Japanese teams write these lists in several
 * shapes (see xlsx-sizes.spec.ts): a table under a サイズ / size header, with or
 * without a 枚数 (pieces) column, sometimes three tables side by side, a filled-in
 * form whose first sheet is a worked example (記入例), sizes written as
 * "L（大人サイズ）", a summary box beside the list. What it can't read, it says so,
 * and the customer types the counts as before.
 *
 * Only S, M, L and XL are counted (the sizes we make); any other size written in
 * the list (LL, O, SS, 130…) is reported, never guessed.
 *
 * An .xlsx is itself a zip of XML: read with the same zip reader, the XML with
 * plain patterns so it runs the same in the browser and in tests.
 */
import { openZip, isJunk, type ZipFileRef } from "./zip-peek";

export const SIZES = ["S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];

export interface SizeCount {
  /** the workbook it came from (its name inside the zip) and the sheet */
  file: string;
  sheet: string;
  counts: Record<Size, number>;
  total: number;
  /** sizes written in the list that we don't make, with how many */
  unknown: Record<string, number>;
  /** "header": found a サイズ/size header; "column": no header, a column of sizes (one piece a row) */
  how: "header" | "column";
}

type Grid = Map<number, Map<number, string>>;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);
/** the text of a string item, without the phonetic guide (<rPh>) Japanese Excel adds: 枚数マイスウ → 枚数 */
const textOf = (xml: string) => unxml([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(""));
const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const colIndex = (ref: string) => ref.replace(/\d+/g, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * A size column's header: a short label with サイズ / size in it ("サイズ", "size", "ビブスサイズ",
 * "サイズ（S/M/L）"), not a line of instructions ("・サイズはプルダウンから選択", "※リストはサイズごと…").
 */
const isSizeHead = (v: string) => v.length <= 12 && /サイズ|サイス|size/i.test(v) && !/^[・※└*＊]/.test(v) && !/[はをごにのでが]/.test(v.replace(/[（(].*$/, ""));
const QTY_HEAD = /^(枚数|数量|個数|qty|quantity|pcs)/i;
const EXAMPLE_SHEET = /記入例|見本|サンプル|sample|example/i;

/** "L", "Ｌ", "L（大人サイズ）", "l (adult)" → "L"; anything else → its short text, or null when it isn't a size at all */
export function sizeToken(raw: string): { size: Size | null; token: string } | null {
  const t = norm(raw).toUpperCase().replace(/[（(].*$/, "").trim();
  if (!t) return null;
  if ((SIZES as readonly string[]).includes(t)) return { size: t as Size, token: t };
  // a short size-looking word we don't make (LL, O, SS, 2XL, 130…); long text is a note, not a size
  if (/^([2-5]?X{0,3}[SML]{1,2}|O|XO|[2-5]?L|SS|\d{2,3})$/.test(t)) return { size: null, token: t };
  return null;
}

async function readText(ref: ZipFileRef | undefined) {
  const b = ref ? await ref.read() : null;
  return b ? new TextDecoder("utf-8").decode(await b.arrayBuffer()) : "";
}

function gridOf(sheetXml: string, shared: string[]): Grid {
  const grid: Grid = new Map();
  for (const row of sheetXml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<number, string>();
    for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(c[1])?.[1];
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const text = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? textOf(body) : v !== undefined ? unxml(v) : "";
      if (text !== "") cells.set(colIndex(ref), norm(text));
    }
    if (cells.size) grid.set(Number(row[1]), cells);
  }
  return grid;
}

const empty = (): Record<Size, number> => ({ S: 0, M: 0, L: 0, XL: 0 });
const qtyOf = (s: string | undefined) => {
  if (s === undefined || s === "") return 1; // a player listed with no count: one bib
  const n = Number(norm(s));
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? Math.round(n) : 1;
};

/** count one sheet: under each サイズ header (several tables may sit side by side), or a bare column of sizes */
export function countSheet(grid: Grid): { counts: Record<Size, number>; unknown: Record<string, number>; how: SizeCount["how"] } | null {
  const rows = [...grid.keys()].sort((a, b) => a - b);
  const counts = empty();
  const unknown: Record<string, number> = {};
  const add = (raw: string, qty: number) => {
    const t = sizeToken(raw);
    if (!t || qty <= 0) return;
    if (t.size) counts[t.size] += qty; else unknown[t.token] = (unknown[t.token] ?? 0) + qty;
  };

  const headRow = rows.find(r => [...grid.get(r)!.values()].some(isSizeHead));
  if (headRow !== undefined) {
    const head = grid.get(headRow)!;
    const sizeCols = [...head].filter(([, v]) => isSizeHead(v)).map(([c]) => c).sort((a, b) => a - b);
    const blocks = sizeCols.map((c, i) => {
      const next = sizeCols[i + 1] ?? Infinity;
      const q = [...head].filter(([qc, v]) => qc > c && qc < next && QTY_HEAD.test(v)).map(([qc]) => qc).sort((a, b) => a - b)[0];
      return { size: c, qty: q };
    });
    for (const r of rows.filter(r => r > headRow)) {
      const cells = grid.get(r)!;
      for (const b of blocks) {
        const s = cells.get(b.size);
        if (s) add(s, b.qty === undefined ? 1 : qtyOf(cells.get(b.qty)));
      }
    }
    return { counts, unknown, how: "header" };
  }

  // no header: the column holding the most size words (two at least), one piece a row
  const byCol = new Map<number, number>();
  for (const r of rows) for (const [c, v] of grid.get(r)!) if (sizeToken(v)?.size) byCol.set(c, (byCol.get(c) ?? 0) + 1);
  const best = [...byCol].sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 2) return null;
  for (const r of rows) { const v = grid.get(r)!.get(best[0]); if (v) add(v, 1); }
  return { counts, unknown, how: "column" };
}

/** a workbook's sheets in order, each as a grid of cell text (row number → column index → text) */
export async function workbookSheets(xlsx: Blob): Promise<{ name: string; grid: Grid }[]> {
  const files = await openZip(xlsx);
  const byName = new Map(files.map(f => [f.name.replace(/^\//, ""), f]));
  const shared = [...(await readText(byName.get("xl/sharedStrings.xml"))).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => norm(textOf(m[1])));
  const book = await readText(byName.get("xl/workbook.xml"));
  const rels = await readText(byName.get("xl/_rels/workbook.xml.rels"));
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [
    /\bId="([^"]+)"/.exec(m[0])?.[1] ?? "",
    (/\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? "").replace(/^\/?(xl\/)?/, "xl/"),
  ]));
  const sheets = [...book.matchAll(/<sheet\b[^>]*>/g)].map(m => ({
    name: unxml(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? ""),
    path: target.get(/\br:id="([^"]+)"/.exec(m[0])?.[1] ?? "") ?? "",
  }));
  const out: { name: string; grid: Grid }[] = [];
  for (const s of sheets) if (byName.has(s.path)) out.push({ name: s.name, grid: gridOf(await readText(byName.get(s.path)), shared) });
  return out;
}

/** the counts from one workbook: its first sheet (not a worked example) that has any */
export async function countWorkbook(xlsx: Blob, fileName: string): Promise<SizeCount | null> {
  for (const s of await workbookSheets(xlsx)) {
    if (EXAMPLE_SHEET.test(s.name)) continue;
    const got = countSheet(s.grid);
    if (!got) continue;
    const total = SIZES.reduce((n, z) => n + got.counts[z], 0);
    if (total + Object.values(got.unknown).reduce((a, b) => a + b, 0) === 0) continue;
    return { file: fileName, sheet: s.name, ...got, total };
  }
  return null;
}

/** the size counts from the order list in the customer's zip, or null when there's none we can read */
export async function sizesFromZip(zip: Blob): Promise<SizeCount | null> {
  const lists = (await openZip(zip)).filter(f => /\.xlsx$/i.test(f.name) && !isJunk(f.name) && !/(^|\/)~\$/.test(f.name));
  for (const f of lists) {
    try {
      const b = await f.read();
      const got = b ? await countWorkbook(b, f.name.split("/").pop() ?? f.name) : null;
      if (got) return got;
    } catch { /* a damaged or locked workbook: try the next */ }
  }
  return null;
}
