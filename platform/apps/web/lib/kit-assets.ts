/**
 * A team's own logo and number/name font, imported in the kit studio.
 *
 * Files are checked, normalised and kept on this device in IndexedDB (they are
 * too big for localStorage). The design itself only refers to them by id; when
 * a design is saved to the account or ordered, the files travel inside the
 * design snapshot (`assets`), so the factory gets exactly what the customer saw.
 */

export type AssetKind = "logo" | "font";

export interface KitAsset {
  id: string;
  kind: AssetKind;
  /** the customer's file name, for showing back to them and the factory */
  name: string;
  /** data: URL — logos are re-encoded as PNG, fonts kept as uploaded */
  data: string;
  /** logos: whether the upload had a white background we removed */
  cleaned?: boolean;
  created: number;
  /** where the server keeps it once uploaded (path on the API, e.g. /uploads/kit-assets/…) */
  url?: string;
}

/**
 * What a saved design carries so another device (or the factory) can rebuild it:
 * a link to the file on the server. Designs saved before the upload endpoint
 * carried the file itself (`data`); those still open.
 */
export interface DesignAssets {
  logo?: { name: string; url?: string; data?: string };
  font?: { name: string; url?: string; data?: string; format: string };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
/** an asset path from the API as a full URL */
export const assetHref = (url: string) => (/^(https?:|data:)/.test(url) ? url : `${API_BASE}${url}`);

/** uploads the file once and remembers its server URL on this device */
export async function uploadAsset(a: KitAsset, token: string): Promise<string> {
  if (a.url) return a.url;
  const res = await fetch(`${API_BASE}/api/v1/kit-assets`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: a.kind, name: a.name, data: a.data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.url !== "string") throw new Error(body.message || `อัปโหลด${a.kind === "logo" ? "โลโก้" : "ฟอนต์"}ไม่สำเร็จ`);
  a.url = body.url;
  putAsset(a).catch(() => {});
  return body.url;
}

/** a file the server keeps, as a data: URL (so it can be stored on this device and drawn without CORS fuss) */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const r = await fetch(assetHref(url), { mode: "cors" });
  if (!r.ok) throw new Error(String(r.status));
  return readAs(await r.blob(), "dataURL");
}

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg";
export const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2";
export const LOGO_MAX_BYTES = 8 * 1024 * 1024;
export const FONT_MAX_BYTES = 4 * 1024 * 1024;
/** longest side a logo is kept at: sharp at print-preview size, small enough to save */

// ---------------------------------------------------------------- storage
const DB = "axiom-kit-assets";
const STORE = "assets";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("เบราว์เซอร์นี้เก็บไฟล์ไม่ได้")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("เปิดที่เก็บไฟล์ไม่ได้"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = run(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listAssets(kind: AssetKind): Promise<KitAsset[]> {
  try {
    const all = await tx<KitAsset[]>("readonly", s => s.getAll() as IDBRequest<KitAsset[]>);
    return all.filter(a => a.kind === kind).sort((a, b) => b.created - a.created);
  } catch { return []; }
}

export async function getAsset(id: string): Promise<KitAsset | null> {
  try { return (await tx<KitAsset | undefined>("readonly", s => s.get(id) as IDBRequest<KitAsset | undefined>)) ?? null; } catch { return null; }
}

export async function putAsset(a: KitAsset): Promise<KitAsset> {
  await tx("readwrite", s => s.put(a));
  return a;
}

export async function deleteAsset(id: string): Promise<void> {
  try { await tx("readwrite", s => s.delete(id)); } catch { /* already gone */ }
}

const newId = (kind: AssetKind) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readAs(file: Blob, how: "dataURL" | "arrayBuffer"): Promise<any> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("อ่านไฟล์ไม่ได้"));
    if (how === "dataURL") r.readAsDataURL(file); else r.readAsArrayBuffer(file);
  });
}

// ---------------------------------------------------------------- logos
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("เปิดรูปไม่ได้ ลองบันทึกเป็น PNG แล้วอัปโหลดใหม่"));
    img.src = src;
  });
}

/**
 * Takes away a plain white (or near-white) background that touches the edges —
 * what a JPG logo nearly always has — so the logo prints on the shirt colour,
 * not inside a white box. Only runs on images without transparency.
 */
function clearWhiteBackground(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return false; // already has transparency
  const white = (p: number) => d[p] > 236 && d[p + 1] > 236 && d[p + 2] > 236;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  let cleared = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (!white(i * 4)) continue;
    d[i * 4 + 3] = 0;
    cleared++;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  if (cleared < w * h * 0.05) return false; // no real background: keep the image as it was
  // soften the cut edge a little so it doesn't look jagged
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const p = i * 4;
    const lum = Math.min(d[p], d[p + 1], d[p + 2]);
    if (lum > 215) d[p + 3] = Math.round(255 * (1 - (lum - 215) / 40));
  }
  ctx.putImageData(im, 0, 0);
  return true;
}

/**
 * Checks, trims and re-encodes an uploaded logo; throws a message for the customer.
 * Kept at print resolution (importPrintLogo): the kit studio's designs are printed
 * from it (the basketball singlet's job is built from this very file).
 */
export async function importLogo(file: File): Promise<KitAsset> {
  const p = await importPrintLogo(file);
  return putAsset({ id: newId("logo"), kind: "logo", name: p.name, data: p.data, cleaned: p.cleaned, created: Date.now() });
}

/** a print logo's long side: SVG is drawn this big, bigger pictures are brought down to it */
export const PRINT_LOGO_PX = 3000;

export interface PrintLogo { name: string; data: string; w: number; h: number; cleaned: boolean }

/** an SVG's own proportions, from its width/height or viewBox (browsers give 150×150 when it has neither) */
function svgAspect(text: string): number | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const num = (a: string) => { const m = new RegExp(`\\b${a}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i").exec(tag); return m ? Number(m[1]) : NaN; };
  const w = num("width"), h = num("height");
  if (w > 0 && h > 0) return w / h;
  const vb = /\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return vb && Number(vb[1]) > 0 && Number(vb[2]) > 0 ? Number(vb[1]) / Number(vb[2]) : null;
}

/**
 * A logo for printing (the bib designer and the kit studio): kept at the resolution
 * it came in, up to PRINT_LOGO_PX on the long side, and an SVG drawn at that size,
 * so it stays sharp on the biggest piece. A plain white background is cleared.
 */
export async function importPrintLogo(file: File): Promise<PrintLogo> {
  const type = file.type || (file.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "");
  if (!LOGO_TYPES.includes(type)) throw new Error("รองรับโลโก้ PNG, JPG, WEBP หรือ SVG");
  if (file.size > 20 * 1024 * 1024) throw new Error("ไฟล์โลโก้ใหญ่เกิน 20MB");
  const svg = type === "image/svg+xml";
  const src = await readAs(file, "dataURL");
  const img = await loadImage(src);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (svg) {
    const aspect = svgAspect(await file.text()) ?? (w && h ? w / h : 1);
    w = aspect >= 1 ? PRINT_LOGO_PX : Math.round(PRINT_LOGO_PX * aspect);
    h = aspect >= 1 ? Math.round(PRINT_LOGO_PX / aspect) : PRINT_LOGO_PX;
  } else {
    const k = Math.min(1, PRINT_LOGO_PX / Math.max(w, h));
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const cleaned = !svg && clearWhiteBackground(ctx, w, h);
  const out = trimTransparent(c);
  let data = out.toDataURL("image/png");
  // the upload limit is 8 MB: a busy photo-like logo at full size can pass it
  if (data.length * 0.75 > 7.5 * 1024 * 1024) {
    const k = Math.sqrt((7 * 1024 * 1024) / (data.length * 0.75));
    const s = document.createElement("canvas");
    s.width = Math.max(1, Math.round(out.width * k)); s.height = Math.max(1, Math.round(out.height * k));
    const sx = s.getContext("2d")!;
    sx.imageSmoothingQuality = "high";
    sx.drawImage(out, 0, 0, s.width, s.height);
    data = s.toDataURL("image/png");
    return { name: file.name.slice(0, 80), data, w: s.width, h: s.height, cleaned };
  }
  if (data.length < 200) throw new Error("โลโก้ว่างเปล่า");
  return { name: file.name.slice(0, 80), data, w: out.width, h: out.height, cleaned };
}

/** crops away fully transparent margins, so the logo sizes by what is actually drawn */
function trimTransparent(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return c;
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------------------------------------------------------------- fonts
const FONT_SIGS: [string, (b: Uint8Array) => boolean][] = [
  ["woff2", b => b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32],
  ["woff", b => b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46],
  ["opentype", b => b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f],
  ["truetype", b => (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) || (b[0] === 0x74 && b[1] === 0x72 && b[2] === 0x75 && b[3] === 0x65)],
];

export function fontFormat(data: string): string {
  const m = /^data:font\/([a-z0-9]+)/.exec(data);
  return m ? m[1] : "truetype";
}

/** the CSS family a stored font is registered under */
export const fontFamilyOf = (id: string) => `AxiomUser_${id.replace(/[^a-z0-9]/gi, "")}`;

const registered = new Map<string, Promise<string | null>>();

/** makes a stored font usable in canvas and CSS; resolves the family name, or null */
export function registerFont(a: { id: string; data: string }): Promise<string | null> {
  if (!registered.has(a.id)) {
    registered.set(a.id, (async () => {
      try {
        const buf = await (await fetch(a.data)).arrayBuffer();
        const family = fontFamilyOf(a.id);
        const face = new (window as any).FontFace(family, buf);
        await face.load();
        (document as any).fonts.add(face);
        return family;
      } catch { registered.delete(a.id); return null; }
    })());
  }
  return registered.get(a.id)!;
}

/** checks an uploaded font really is one and that the browser can draw with it */
export async function importFont(file: File): Promise<KitAsset> {
  if (file.size > FONT_MAX_BYTES) throw new Error("ไฟล์ฟอนต์ใหญ่เกิน 4MB");
  const buf = new Uint8Array(await readAs(file, "arrayBuffer"));
  const sig = FONT_SIGS.find(([, test]) => test(buf));
  if (!sig) throw new Error("รองรับฟอนต์ .ttf .otf .woff หรือ .woff2");
  const fmt = sig[0];
  const mime = fmt === "truetype" ? "font/ttf" : fmt === "opentype" ? "font/otf" : `font/${fmt}`;
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const data = `data:${mime};base64,${btoa(bin)}`;
  const id = newId("font");
  const family = await registerFont({ id, data });
  if (!family) throw new Error("เปิดฟอนต์นี้ไม่ได้ ไฟล์อาจเสีย");
  return putAsset({ id, kind: "font", name: file.name.slice(0, 80), data, created: Date.now() });
}
