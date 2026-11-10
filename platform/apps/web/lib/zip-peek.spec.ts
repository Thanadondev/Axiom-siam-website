import { describe, it, expect } from "vitest";
import { deflateRawSync, crc32 } from "zlib";
import { existsSync, readdirSync, openAsBlob } from "fs";
import { join } from "path";
import { peekZip, kindOf, isJunk } from "./zip-peek";

/** a zip built by hand: each file stored or deflated, names UTF-8 (flagged) or raw bytes */
function makeZip(files: { name: string | Buffer; data: Buffer; deflate?: boolean; utf8?: boolean }[]) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = typeof f.name === "string" ? Buffer.from(f.name, "utf8") : f.name;
    const body = f.deflate ? deflateRawSync(f.data) : f.data;
    const flags = f.utf8 === false ? 0 : 0x800;
    const method = f.deflate ? 8 : 0;
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Blob([Buffer.concat([...locals, cd, end])]);
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 9), Buffer.from([0xff, 0xd9])]);
const SMALL_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 3)]);
const AI = Buffer.from("%PDF-1.6 %Adobe Illustrator".repeat(200));
// "陵北ミニバス.ai" in Shift-JIS, as a Japanese Windows zip tool writes it (no UTF-8 flag)
const SJIS_NAME = Buffer.from([0x97, 0xcb, 0x96, 0x6b, 0x83, 0x7e, 0x83, 0x6a, 0x83, 0x6f, 0x83, 0x58, 0x2e, 0x61, 0x69]);

describe("peeking inside a customer's zip", () => {
  it("lists the files, skipping what a Mac leaves behind, and counts the Illustrator files", async () => {
    const z = makeZip([
      { name: "HF-100 (N) 4379 J-Field Axis R bib (ML)/", data: Buffer.alloc(0) },
      { name: "HF-100 (N) 4379 J-Field Axis R bib (ML)/(HF-100)4379 J-Field Axis R bib (ML)_ol.ai", data: AI, deflate: true },
      { name: "HF-100 (N) 4379 J-Field Axis R bib (ML)/.DS_Store", data: Buffer.alloc(10) },
      { name: "__MACOSX/HF-100/._(HF-100)4379.ai", data: Buffer.alloc(10) },
      { name: "HF-100 (N) 4379 J-Field Axis R bib (ML)/ビブスご注文リスト.xlsx", data: Buffer.alloc(300) },
    ]);
    const p = await peekZip(z);
    expect(p.entries.map(e => e.name.split("/").pop())).toEqual(["(HF-100)4379 J-Field Axis R bib (ML)_ol.ai", "ビブスご注文リスト.xlsx"]);
    expect(p.counts).toMatchObject({ ai: 1, sheet: 1, image: 0 });
    expect(p.entries[0].size).toBe(AI.length);
    expect(p.preview).toBeNull();
  });

  it("takes out the biggest picture, deflated or stored, byte for byte", async () => {
    for (const deflate of [true, false]) {
      const p = await peekZip(makeZip([
        { name: "job/small.jpg", data: SMALL_JPEG, deflate },
        { name: "job/(HF-100)4379-J-Field-Axis-R-bib-(ML).jpg", data: JPEG, deflate },
        { name: "job/art_ol.ai", data: AI, deflate: true },
      ]));
      expect(p.previewName).toBe("(HF-100)4379-J-Field-Axis-R-bib-(ML).jpg");
      expect(p.preview?.type).toBe("image/jpeg");
      expect(Buffer.from(await p.preview!.arrayBuffer()).equals(JPEG)).toBe(true);
    }
  });

  it("reads a Japanese name written in Shift-JIS by a Windows zip tool", async () => {
    const p = await peekZip(makeZip([{ name: SJIS_NAME, data: AI, utf8: false }]));
    expect(p.entries[0].name).toBe("陵北ミニバス.ai");
    expect(p.counts.ai).toBe(1);
  });

  it("says so, in Thai, when it isn't a zip", async () => {
    await expect(peekZip(new Blob([AI]))).rejects.toThrow(/ไม่ใช่ไฟล์ zip/);
  });

  it("knows the kinds and the junk", () => {
    expect(["a.AI", "b.pdf", "c.eps", "d.psd", "e.JPG", "f.png", "g.xlsx", "h.txt"].map(kindOf)).toEqual(["ai", "pdf", "eps", "psd", "image", "image", "sheet", "other"]);
    expect(isJunk("x/.DS_Store")).toBe(true);
    expect(isJunk("__MACOSX/a/._b.ai")).toBe(true);
    expect(isJunk("job/._b.ai")).toBe(true);
    expect(isJunk("job/b.ai")).toBe(false);
  });
});

// The factory's own folder of real customer zips, when this machine has it (Z: drive)
const REAL = "Z:/@graphic/New";
describe.skipIf(!existsSync(REAL))("real customer zips from the factory", () => {
  it("finds the artwork and the job picture in each", async () => {
    const zips = readdirSync(REAL).filter(n => n.toLowerCase().endsWith(".zip")).slice(0, 10);
    let withPicture = 0;
    for (const n of zips) {
      const p = await peekZip(await openAsBlob(join(REAL, n)));
      expect(p.counts.ai, n).toBeGreaterThan(0);
      expect(p.entries.some(e => e.name.includes("__MACOSX") || e.name.endsWith(".DS_Store")), n).toBe(false);
      if (p.preview) {
        withPicture++;
        const head = Buffer.from(await p.preview.slice(0, 3).arrayBuffer());
        expect([...head], n).toEqual(p.preview.type === "image/png" ? [0x89, 0x50, 0x4e] : [0xff, 0xd8, 0xff]);
      }
    }
    expect(withPicture).toBeGreaterThan(zips.length / 2);
  }, 120_000);
});
