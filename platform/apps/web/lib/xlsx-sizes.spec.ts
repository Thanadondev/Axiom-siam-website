import { describe, it, expect } from "vitest";
import { deflateRawSync, crc32 } from "zlib";
import { countWorkbook, sizesFromZip, sizeToken } from "./xlsx-sizes";

/** a zip built by hand (deflated, UTF-8 names) */
function zip(files: Record<string, string | Buffer>) {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [n, d] of Object.entries(files)) {
    const name = Buffer.from(n, "utf8"), data = Buffer.isBuffer(d) ? d : Buffer.from(d, "utf8"), body = deflateRawSync(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, body); central.push(ch, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const col = (i: number) => String.fromCharCode(65 + i);
/** a sheet from rows of cells; strings inline, numbers as numbers */
const sheetXml = (rows: (string | number | null)[][]) =>
  `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => v === null || v === "" ? "" :
    typeof v === "number" ? `<c r="${col(c)}${i + 1}"><v>${v}</v></c>` : `<c r="${col(c)}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
/** a workbook: sheets in order, by name; the sheet files numbered against that order on purpose */
function xlsx(sheets: [string, (string | number | null)[][]][], extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    "xl/workbook.xml": `<workbook><sheets>${sheets.map(([n], i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${sheets.length - i}.xml"/>`).join("")}</Relationships>`,
    ...extra,
  };
  sheets.forEach(([, rows], i) => { files[`xl/worksheets/sheet${sheets.length - i}.xml`] = sheetXml(rows); });
  return zip(files);
}
const book = (x: Buffer) => countWorkbook(new Blob([new Uint8Array(x)]), "list.xlsx");

describe("a size written in an order list", () => {
  it("knows ours however it's written, reports others, ignores notes", () => {
    expect(["L", "Ｌ", "l", "L（大人サイズ）", "M (junior)", "ＸＬ", " S "].map(s => sizeToken(s)?.size)).toEqual(["L", "L", "L", "L", "M", "XL", "S"]);
    expect(["LL", "O", "SS", "2XL", "130"].map(s => sizeToken(s))).toEqual(["LL", "O", "SS", "2XL", "130"].map(t => ({ size: null, token: t })));
    expect(sizeToken("※リストはサイズごと背番号の順に")).toBeNull();
    expect(sizeToken("")).toBeNull();
  });
});

describe("counting sizes in a customer's order list", () => {
  it("a table under サイズ with a 枚数 column; totals rows and title rows don't count", async () => {
    const r = await book(xlsx([["Sheet1", [
      ["リバーシブルビブス注文表"],
      ["チーム名"],
      [null, "サイズ", "背番号", "NAME", "枚数", "備考"],
      [1, "M", 1, "A", 1],
      [2, "XL", 45, "B", 1],
      [3, "L", 7, "C", 3],
      ["男子合計", null, null, null, 5],
    ]]]));
    expect(r).toMatchObject({ sheet: "Sheet1", how: "header", counts: { S: 0, M: 1, L: 3, XL: 1 }, total: 5, unknown: {} });
  });

  it("no 枚数 column: one bib a listed player", async () => {
    const r = await book(xlsx([["Sheet1", [[null, "size", "番号"], [1, "M", 21], [2, "M", 22], [3, "S", 9]]]]));
    expect(r).toMatchObject({ counts: { S: 1, M: 2, L: 0, XL: 0 }, total: 3 });
  });

  it("three tables side by side each count once", async () => {
    const H = ["サイズ", "枚数", "番号", "個人名"];
    const r = await book(xlsx([["Sheet1", [
      [null, ...H, null, ...H, null, ...H],
      [1, "L", 1, 81, "a", 21, "M", 2, 5, "b", 41, "S", 1, 3, "c"],
      [2, "M", 1, 55, "d", 22, null, null, null, null, 42, null, null, null, null],
    ]]]));
    expect(r?.counts).toEqual({ S: 1, M: 3, L: 1, XL: 0 });
  });

  it("the filled-in form: skips the worked example sheet, reads 'L（大人サイズ）', leaves the summary box alone", async () => {
    const example: (string | number | null)[][] = [["番号", "サイズ（S/M/L）", "枚数", "ネーム"], [10, "S（キッズサイズ）", 9, "例"]];
    const form: (string | number | null)[][] = [
      ["チーム名", "x", null, null, null, "・サイズはプルダウンから選択"],
      [null, null, null, null, null, "└ L（大人サイズ）"],
      ["番号", "サイズ（S/M/L）", "枚数", "ネーム（プリントする名前）", "備考"],
      [1, "M（ジュニアサイズ）", 1, "a", null, null, "S（キッズサイズ）", null, 1],
      [2, "L（大人サイズ）", 2, "b", null, null, "M（ジュニアサイズ）", null, 2],
      [3, "S（キッズサイズ）", 1, "c", null, null, "L（大人サイズ）", null, 2],
      [4, "M（ジュニアサイズ）", 1, "d", null, null, "合計", null, 5],
    ];
    const r = await book(xlsx([["記入例", example], ["商品注文リスト", form]]));
    expect(r).toMatchObject({ sheet: "商品注文リスト", counts: { S: 1, M: 2, L: 2, XL: 0 }, total: 5 });
  });

  it("the long form: a 'ビブスサイズ' header far across the sheet, instructions above it not taken for headers", async () => {
    const row = (n: number, size: string | null, qty: number | null) => [n, null, n * 3, null, null, null, null, null, size, null, null, null, qty];
    const r = await book(xlsx([["Sheet1", [
      ["リバーシブルビブスご注文リスト"],
      [null, null, null, null, null, "・サイズはプルダウンから選択"],
      [null, "※リストはサイズごと背番号の順に"],
      [null, null, "背番号", null, null, null, null, null, "ビブスサイズ", null, null, null, "枚数"],
      row(1, "M", 1), row(2, "M", 2), row(3, "L", 1), row(4, null, null),
    ]]]));
    expect(r).toMatchObject({ how: "header", counts: { S: 0, M: 3, L: 1, XL: 0 }, total: 4 });
  });

  it("no header at all: a column of sizes, one bib a row", async () => {
    const r = await book(xlsx([["フォームの回答 1", [[], [null, "チーム"], [], [null, "リバーシブルビブス", "背番号", "ネーム"], [null, "M", 15, "a"], [null, "M", 16, "b"], [null, "L", 7, "c"]]]]));
    expect(r).toMatchObject({ how: "column", counts: { S: 0, M: 2, L: 1, XL: 0 }, total: 3 });
  });

  it("reports sizes we don't make, and doesn't fold them into ours", async () => {
    const r = await book(xlsx([["Sheet1", [["サイズ", "枚数"], ["L", 2], ["LL", 1], ["O", 3], ["130", 1]]]]));
    expect(r).toMatchObject({ counts: { S: 0, M: 0, L: 2, XL: 0 }, total: 2, unknown: { LL: 1, O: 3, "130": 1 } });
  });

  it("reads shared strings without the phonetic guide Japanese Excel adds (枚数マイスウ → 枚数)", async () => {
    const shared = `<sst><si><t>サイズ</t></si><si><r><t>枚数</t></r><rPh sb="0" eb="2"><t>マイスウ</t></rPh></si><si><t>M</t></si></sst>`;
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>4</v></c></row></sheetData></worksheet>`;
    const r = await countWorkbook(new Blob([zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": shared, "xl/worksheets/sheet1.xml": sheet,
    })]), "x.xlsx");
    expect(r?.counts.M).toBe(4);
  });

  it("nothing to read: a form laid out as a picture grid, or an empty list", async () => {
    expect(await book(xlsx([["Sheet1", [["リバーシブルビブスご注文リスト"], [null, null, "8023398140"]]]]))).toBeNull();
    expect(await book(xlsx([["Sheet1", [["サイズ", "枚数"]]]]))).toBeNull();
  });
});

describe("the order list inside the customer's zip", () => {
  it("finds it among the artwork, skipping Mac junk and Excel's lock files", async () => {
    const list = xlsx([["Sheet1", [["サイズ", "枚数"], ["M", 10], ["L", 5]]]]);
    const z = zip({
      "job/art_ol.ai": "%PDF", "job/~$order.xlsx": "locked", "__MACOSX/job/._order.xlsx": "junk",
      "job/ビブスご注文リスト.xlsx": list,
    });
    expect(await sizesFromZip(new Blob([z]))).toMatchObject({ file: "ビブスご注文リスト.xlsx", counts: { S: 0, M: 10, L: 5, XL: 0 }, total: 15 });
    expect(await sizesFromZip(new Blob([zip({ "job/art_ol.ai": "%PDF" })]))).toBeNull();
  });
});
