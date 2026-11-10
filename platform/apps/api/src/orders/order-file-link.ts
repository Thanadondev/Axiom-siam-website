import { createHmac, timingSafeEqual } from "crypto";

/**
 * The customer's print files are their artwork, so they are not public files.
 * Whoever the API shows an order to (its owner, or an admin) gets short-lived
 * signed links to its zip and its preview picture. Pure — order-file-link.spec.ts.
 */

export type OrderFileKind = "zip" | "preview";
export const ORDER_FILE_LINK_TTL_MS = 60 * 60_000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret() {
  const s = process.env.FILE_URL_SECRET || process.env.SLIP_URL_SECRET || process.env.JWT_ACCESS_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("FILE_URL_SECRET (or JWT_ACCESS_SECRET) is not set");
  return "dev-only-order-file-link-secret";
}

const sign = (id: string, kind: OrderFileKind, exp: number) =>
  createHmac("sha256", secret()).update(`order-file.${id}.${kind}.${exp}`).digest("base64url");

/** a signed API link to one of an order file's parts */
export function signOrderFileUrl(id: string, kind: OrderFileKind, now = Date.now(), ttlMs = ORDER_FILE_LINK_TTL_MS): string | null {
  if (!ID.test(id)) return null;
  const exp = Math.floor((now + ttlMs) / 1000);
  return `/api/v1/order-files/${id}/${kind}?exp=${exp}&sig=${sign(id, kind, exp)}`;
}

/** true when the link is genuine, for this file and part, and not expired */
export function verifyOrderFileLink(id: unknown, kind: unknown, exp: unknown, sig: unknown, now = Date.now()): boolean {
  if (typeof id !== "string" || !ID.test(id) || (kind !== "zip" && kind !== "preview") || typeof sig !== "string") return false;
  const e = Number(exp);
  if (!Number.isInteger(e) || e * 1000 < now) return false;
  const want = Buffer.from(sign(id, kind, e));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** a customer's file name, safe to show and to offer on download: no folders, no control characters */
export function cleanZipName(raw: unknown): string {
  let s = typeof raw === "string" ? raw : "";
  try { s = decodeURIComponent(s); } catch { /* keep it as sent */ }
  s = s.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim();
  if (!s.toLowerCase().endsWith(".zip")) s = `${s || "artwork"}.zip`;
  return s.length > 200 ? `${s.slice(0, 196)}.zip` : s;
}

/** the first bytes of a zip that holds files ("PK\x03\x04") */
export const isZipStart = (b: Buffer) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
