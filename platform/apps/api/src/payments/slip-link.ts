import { createHmac, timingSafeEqual } from "crypto";

/**
 * Slips are financial records, so they are not served as public files.
 * The API hands out short-lived signed links instead: only someone the API
 * already showed the slip to (its owner, or an admin) gets a working link,
 * and it stops working after an hour. Pure — slip-link.spec.ts.
 */

const STORED = /^\/uploads\/slips\/([A-Za-z0-9-]+)\/([A-Za-z0-9][A-Za-z0-9.-]*\.(?:jpg|png|webp|heic))$/;
const FILE = /^[A-Za-z0-9-]+\/[A-Za-z0-9][A-Za-z0-9.-]*\.(?:jpg|png|webp|heic)$/;
export const SLIP_LINK_TTL_MS = 60 * 60_000;

function secret() {
  const s = process.env.SLIP_URL_SECRET || process.env.JWT_ACCESS_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SLIP_URL_SECRET (or JWT_ACCESS_SECRET) is not set");
  return "dev-only-slip-link-secret";
}

function sign(file: string, exp: number) {
  return createHmac("sha256", secret()).update(`${file}.${exp}`).digest("base64url");
}

/** the stored path (/uploads/slips/<order>/<name>) → a signed API link, or null */
export function signSlipUrl(stored: string | null | undefined, now = Date.now(), ttlMs = SLIP_LINK_TTL_MS): string | null {
  const m = stored ? STORED.exec(stored) : null;
  if (!m) return null;
  const file = `${m[1]}/${m[2]}`;
  const exp = Math.floor((now + ttlMs) / 1000);
  return `/api/v1/payments/slip?f=${encodeURIComponent(file)}&exp=${exp}&sig=${sign(file, exp)}`;
}

/** the file a link points to, when the link is genuine and still valid */
export function verifySlipLink(file: unknown, exp: unknown, sig: unknown, now = Date.now()): string | null {
  if (typeof file !== "string" || typeof sig !== "string" || !FILE.test(file)) return null;
  const e = Number(exp);
  if (!Number.isInteger(e) || e * 1000 < now) return null;
  const want = Buffer.from(sign(file, e));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return file;
}
