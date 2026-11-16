/**
 * Garment options the marketplace offers — and the contract with the editor.
 *
 * These ids are sent to the designer iframe as `axiom-set-variant`, where they
 * are assigned straight to `curTrim` / `TPL_SIZE`. If an id here drifts from
 * the editor's <select> values the failure is silent and nasty: the button
 * highlights, the message posts, and the shirt simply never changes.
 *
 * garment-options.spec.ts parses the editor's own index.html and fails the
 * build if these lists stop matching, so the drift can't reach a customer.
 */

export const SIZES = ["S", "M", "L", "XL"] as const;
export type SizeId = (typeof SIZES)[number];

export const TRIMS = [
  { id: "none", label: "ไม่มีขลิบ" },
  { id: "neck", label: "ขลิบคอ" },
  { id: "neckarm", label: "ขลิบคอ + แขน" },
  { id: "full", label: "ขลิบคอ + แขน + ชาย" },
] as const;
export type TrimId = (typeof TRIMS)[number]["id"];

export const DEFAULT_BODY_COLOR = "#ffffff";
export const DEFAULT_TRIM_COLOR = "#e6ecf5";
export const DEFAULT_SIZE: SizeId = "M";
export const DEFAULT_TRIM: TrimId = "full";

export interface Variant {
  bodyColor: string;
  trimColor: string;
  size: string;
  trim: string;
}

/** the colourway a template was saved with, with sane fallbacks */
export function variantFromState(state: any): Variant {
  return {
    bodyColor: state?.bodyColor ?? DEFAULT_BODY_COLOR,
    trimColor: state?.trimColor ?? DEFAULT_TRIM_COLOR,
    size: state?.size ?? DEFAULT_SIZE,
    trim: normalizeTrim(state?.trim),
  };
}

/**
 * Old documents stored `trim` as a boolean (true = full, false = none) before
 * the four-level trim landed. openDoc() in the editor still handles that, so
 * anything reading a saved state must too.
 */
export function normalizeTrim(trim: unknown): TrimId {
  if (typeof trim === "boolean") return trim ? "full" : "none";
  if (typeof trim === "string" && TRIMS.some(t => t.id === trim)) return trim as TrimId;
  return DEFAULT_TRIM;
}

/** the chosen colourway as query params, so /design opens on the same shirt */
export function variantQuery(v: Variant | null | undefined): string {
  if (!v) return "";
  const p = new URLSearchParams({ body: v.bodyColor, trim: v.trimColor, size: v.size, trimLevel: v.trim });
  return "&" + p.toString();
}
