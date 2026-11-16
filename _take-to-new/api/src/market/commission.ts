import { createHash } from "node:crypto";

/** Marketplace revenue split. Pure — unit-tested in commission.spec.ts. */

export interface Split {
  price: number;
  commissionPct: number;
  platformFee: number;
  designerEarning: number;
}

/**
 * Splits a sale between the platform and the designer.
 * The fee is rounded to whole baht and the designer gets the remainder, so
 * platformFee + designerEarning === price exactly (no lost/created satang).
 */
export function splitPrice(price: number, commissionPct: number): Split {
  const p = Math.max(0, Math.trunc(price));
  const pct = Math.min(100, Math.max(0, commissionPct));
  const platformFee = Math.round((p * pct) / 100);
  return { price: p, commissionPct: pct, platformFee, designerEarning: p - platformFee };
}

/**
 * Fingerprints a preview image for exact-duplicate detection.
 *
 * Handles a `data:image/png;base64,...` URL (what the designer exports) by
 * hashing the decoded bytes, so the same picture always yields the same hash
 * regardless of MIME prefix or whitespace. Returns null when there is nothing
 * to hash.
 *
 * NOTE: this catches byte-identical re-uploads only. It will NOT catch a
 * resized, recoloured or re-encoded copy — that needs a perceptual hash
 * (pHash/dHash) over decoded pixels, which requires an image decoder.
 */
export function previewFingerprint(previewUrl?: string | null): string | null {
  if (!previewUrl) return null;
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(previewUrl.trim());
  if (!m) return null;

  const [, , isBase64, payload] = m;
  if (!payload) return null;

  const bytes = isBase64
    ? Buffer.from(payload.replace(/\s/g, ""), "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  if (bytes.length === 0) return null;
  return createHash("sha256").update(bytes).digest("hex");
}
