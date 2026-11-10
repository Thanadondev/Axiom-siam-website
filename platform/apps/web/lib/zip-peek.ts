/**
 * A look inside the customer's print-file zip, in the browser, before it's uploaded:
 * what's in it (is there an .ai?), and the job's picture (the .jpg) to show them.
 *
 * Only the zip's table of contents at the end of the file is read, plus the one
 * picture — never the whole zip (they run to a few hundred MB). No dependency:
 * the picture is inflated with the browser's own DecompressionStream.
 */

export type ZipKind = "ai" | "pdf" | "eps" | "psd" | "image" | "sheet" | "other";

export interface ZipEntry {
  name: string;
  size: number;
  kind: ZipKind;
}

export interface ZipPeek {
  entries: ZipEntry[];
  counts: Record<ZipKind, number>;
  /** the biggest .jpg / .png in the zip, if any */
  preview: Blob | null;
  previewName: string | null;
}

interface CdEntry extends ZipEntry { method: number; flags: number; compSize: number; offset: number; dir: boolean }

const KIND: Record<string, ZipKind> = {
  ai: "ai", pdf: "pdf", eps: "eps", psd: "psd",
  jpg: "image", jpeg: "image", png: "image",
  xlsx: "sheet", xls: "sheet", csv: "sheet",
};
export const kindOf = (name: string): ZipKind => KIND[name.toLowerCase().split(".").pop() ?? ""] ?? "other";

/** Mac and Windows leave these in zips: not the customer's files */
export const isJunk = (name: string) => /(^|\/)__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name) || /(^|\/)\._[^/]*$/.test(name) || /(^|\/)Thumbs\.db$/i.test(name);

/** names are UTF-8 when flagged; Japanese zips made on Windows are often Shift-JIS */
function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder("utf-8").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* not UTF-8 */ }
  try { return new TextDecoder("shift_jis").decode(bytes); } catch { /* no decoder */ }
  return Array.from(bytes, b => String.fromCharCode(b)).join("");
}

async function bytesOf(file: Blob, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function centralDirectory(file: Blob): Promise<CdEntry[]> {
  const tailLen = Math.min(file.size, 22 + 65535 + 20);
  const tail = await bytesOf(file, file.size - tailLen, file.size);
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ไม่ใช่ไฟล์ zip หรือไฟล์เสีย");

  let count = dv.getUint16(eocd + 10, true);
  let cdSize = dv.getUint32(eocd + 12, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  // ZIP64: the real numbers are in another record, pointed to just before the end record
  if ((count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) && eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
    const at = Number(dv.getBigUint64(eocd - 20 + 8, true));
    const z = await bytesOf(file, at, at + 56);
    const zv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    if (zv.getUint32(0, true) !== 0x06064b50) throw new Error("อ่านสารบัญ zip ไม่ได้");
    count = Number(zv.getBigUint64(32, true));
    cdSize = Number(zv.getBigUint64(40, true));
    cdOffset = Number(zv.getBigUint64(48, true));
  }
  if (cdOffset + cdSize > file.size) throw new Error("ไฟล์ zip ไม่ครบ");

  const cd = await bytesOf(file, cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const out: CdEntry[] = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    let compSize = v.getUint32(p + 20, true);
    let size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    let offset = v.getUint32(p + 42, true);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    // ZIP64 sizes / offset live in the extra field (id 0x0001), in this order, only when maxed out
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = v.getUint16(e, true), len = v.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = Number(v.getBigUint64(q, true)); q += 8; }
        if (compSize === 0xffffffff) { compSize = Number(v.getBigUint64(q, true)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(v.getBigUint64(q, true)); }
      }
      e += 4 + len;
    }
    out.push({ name, size, kind: kindOf(name), method, flags, compSize, offset, dir: name.endsWith("/") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function extract(file: Blob, e: CdEntry): Promise<Blob | null> {
  if (e.flags & 1) return null; // encrypted
  const head = await bytesOf(file, e.offset, e.offset + 30);
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (hv.getUint32(0, true) !== 0x04034b50) return null;
  const start = e.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const raw = file.slice(start, start + e.compSize);
  if (e.method === 0) return raw;
  if (e.method !== 8 || typeof DecompressionStream === "undefined") return null;
  const out = raw.stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Response(out).blob();
}

const PREVIEW_MAX = 20 * 1024 * 1024;

/** what's in the zip, and its picture. Throws (in Thai) when it isn't a readable zip. */
export async function peekZip(file: Blob): Promise<ZipPeek> {
  const all = await centralDirectory(file);
  const files = all.filter(e => !e.dir && !isJunk(e.name));
  const counts: Record<ZipKind, number> = { ai: 0, pdf: 0, eps: 0, psd: 0, image: 0, sheet: 0, other: 0 };
  files.forEach(f => { counts[f.kind]++; });
  const pic = files.filter(f => f.kind === "image" && f.size > 0 && f.size <= PREVIEW_MAX).sort((a, b) => b.size - a.size)[0];
  let preview: Blob | null = null;
  if (pic) {
    try {
      const b = await extract(file, pic);
      const type = /\.png$/i.test(pic.name) ? "image/png" : "image/jpeg";
      preview = b ? new Blob([b], { type }) : null;
    } catch { preview = null; }
  }
  return {
    entries: files.map(({ name, size, kind }) => ({ name, size, kind })),
    counts,
    preview,
    previewName: preview && pic ? pic.name.split("/").pop() ?? pic.name : null,
  };
}
