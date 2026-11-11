/**
 * The bib designer's name list: pasted from Excel (or typed), one bib per line —
 * name, number and size in any order. Sizes as teams write them: S M L XL XXL,
 * the Japanese 2L / 3L, the factory's "XL-2L" / "XXL-3L", and the specials
 * (SPM / SPL, "Special M"). Full-width characters (Japanese input) are read too.
 */

export const BIB_SIZES = ["S", "M", "L", "XL", "XXL", "SPM", "SPL"] as const;
export type BibSize = (typeof BIB_SIZES)[number];

/** how each size is shown (the order sheet's names) */
export const BIB_SIZE_LABEL: Record<BibSize, string> = {
  S: "S", M: "M", L: "L", XL: "XL-2L", XXL: "XXL-3L", SPM: "Special M", SPL: "Special L",
};

export interface BibRow { name: string; number: string; size: BibSize }
export interface RosterRead { rows: BibRow[]; errors: { line: number; text: string; why: "size" | "number" | "name" }[] }

export const NAME_MAX = 20;

const ALIAS: Record<string, BibSize> = {
  S: "S", M: "M", L: "L",
  XL: "XL", "2L": "XL", LL: "XL", O: "XL", "XL-2L": "XL", "XL2L": "XL",
  XXL: "XXL", "2XL": "XXL", "3L": "XXL", XO: "XXL", "XXL-3L": "XXL", "XXL3L": "XXL",
  SPM: "SPM", "SP-M": "SPM", "SPECIALM": "SPM", "SPECIAL-M": "SPM",
  SPL: "SPL", "SP-L": "SPL", "SPECIALL": "SPL", "SPECIAL-L": "SPL",
};

/** a size as a team writes it, or null */
export function readSize(raw: string): BibSize | null {
  const k = raw.normalize("NFKC").toUpperCase().replace(/\s+/g, "").replace(/サイズ$|SIZE$/, "");
  return ALIAS[k] ?? null;
}

const HEADER = /^(name|names|no\.?|number|size|ชื่อ|เบอร์|ไซ[สซ]์|名前|氏名|背番号|番号|サイズ)$/i;

export function readRoster(text: string): RosterRead {
  const rows: BibRow[] = [];
  const errors: RosterRead["errors"] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.normalize("NFKC").trim();
    if (!line) return;
    // "Special M" is one size, though written with a space
    const joined = line.replace(/\bspecial\s+([ml])\b/gi, "SPECIAL$1").replace(/\bsp\s+([ml])\b/gi, "SP$1");
    let cells = joined.split(/\t|,|、|;|\|/).map(c => c.trim()).filter(Boolean);
    if (cells.length === 1) cells = joined.split(/\s+/);
    // a header row
    if (cells.every(c => HEADER.test(c))) return;
    let size: BibSize | null = null;
    let number = "";
    const rest: string[] = [];
    for (const c of cells) {
      const z: BibSize | null = size ? null : readSize(c);
      if (z) { size = z; continue; }
      const n = c.replace(/^(no\.?|#)/i, "");
      if (!number && /^\d{1,3}$/.test(n)) { number = String(Number(n)); continue; }
      rest.push(c);
    }
    const name = rest.join(" ").trim();
    const why = !size ? "size" : name.length > NAME_MAX ? "name" : rest.some(r => /^\d{4,}$/.test(r)) ? "number" : null;
    if (why || !size) { errors.push({ line: i + 1, text: raw.trim(), why: why ?? "size" }); return; }
    rows.push({ name, number, size });
  });
  return { rows, errors };
}

/** bibs numbered in a run with no names ("Number: 1〜10"), as lines for the list */
export function numberedLines(size: BibSize, count: number, from: number): string {
  const n = Math.max(0, Math.min(200, Math.trunc(count)));
  return Array.from({ length: n }, (_, i) => `${from + i}\t${size}`).join("\n");
}

/** each size's piece width, mm (the factory template, CB-005): the logo scales with it from M */
const PIECE_W: Record<BibSize, number> = { S: 459, M: 519, L: 609, XL: 683, XXL: 763, SPM: 565, SPL: 634 };

/**
 * How sharp the logo prints where it prints biggest: the chest logo is 85 mm tall
 * on M (no wider than 110 mm), scaled with the piece — so the largest size on the
 * list decides. Dots per inch over its printed height.
 */
export function logoDpi(w: number, h: number, sizes: BibSize[]): { dpi: number; mm: number; size: string } {
  const size = (sizes.length ? sizes : (["M"] as BibSize[])).reduce((a, b) => (PIECE_W[b] > PIECE_W[a] ? b : a));
  const k = PIECE_W[size] / PIECE_W.M;
  let mmH = 85 * k;
  const mmW = (mmH * w) / h;
  if (mmW > 110 * k) mmH = (110 * k * h) / w;
  return { dpi: Math.round(h / (mmH / 25.4)), mm: Math.round(mmH), size: BIB_SIZE_LABEL[size] };
}

export function countBySize(rows: BibRow[]): Partial<Record<BibSize, number>> {
  const out: Partial<Record<BibSize, number>> = {};
  for (const r of rows) out[r.size] = (out[r.size] ?? 0) + 1;
  return out;
}
