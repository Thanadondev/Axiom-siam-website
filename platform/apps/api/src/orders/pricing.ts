/**
 * Axiom Siam pricing engine — sportswear OEM.
 *
 * Model chosen by the business owner:
 *   unit price = qty-tier base price  +  fabric surcharge  +  trim surcharge
 *   payment    = 100% up-front, before production
 *
 * All amounts are whole Thai baht (satang are never used).
 *
 * The numbers below are only *defaults*. At runtime the values come from the
 * `settings` table (editable in the admin console) and fall back to these.
 * Env vars seed the defaults so a fresh install can be tuned without a UI.
 */

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
/** like num(), but a garment can cost less than a jersey */
const signed = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : fallback;
};

/**
 * what is being made: a jersey (the base price), a hoodie, shorts, or the warm-up suit —
 * a raglan top (crew neck, or zip-up) and track pants
 */
export const GARMENTS = ["jersey", "hoodie", "shorts", "piste", "piste_zip", "pants", "bib_n", "bib_r"] as const;
export type Garment = (typeof GARMENTS)[number];
export const GARMENT_LABEL: Record<Garment, string> = {
  jersey: "เสื้อ", hoodie: "เสื้อฮู้ด", shorts: "กางเกง", piste: "เสื้อวอร์ม", piste_zip: "เสื้อวอร์มซิป", pants: "กางเกงวอร์ม",
  bib_n: "N-bib", bib_r: "R-bib (2 ด้าน)",
};

/**
 * Bibs come as the customer's own print files (a .zip of Illustrator artwork), at one
 * price a piece: no quantity tiers, and no fabric, trim or reversible surcharge.
 */
export const FILE_PRODUCTS = ["bib_n", "bib_r"] as const;
export type FileProduct = (typeof FILE_PRODUCTS)[number];

/** the storefront kits that aren't jerseys (apps/web/lib/kits.ts) */
const KIT_GARMENT: Record<string, Garment> = { warmup: "hoodie", stride: "shorts", tempo: "piste", tempozip: "piste_zip", track: "pants" };

/** the garment a design snapshot is for: the kit it was made from, else a jersey */
export function garmentOf(snap: unknown): Garment {
  if (!snap || typeof snap !== "object") return "jersey";
  const s = snap as Record<string, unknown>;
  return s.kind === "kit-studio" && typeof s.kit === "string" ? KIT_GARMENT[s.kit.toLowerCase()] ?? "jersey" : "jersey";
}

export interface QtyTier {
  minQty: number;
  price: number;
}

export interface PricingConfig {
  /** matched top-down: first tier whose minQty <= qty wins */
  tiers: QtyTier[];
  fabric: Record<string, number>;
  trim: Record<string, number>;
  /** added to (or, below zero, taken off) the jersey price per piece */
  garment: Record<string, number>;
  /** a set price a piece, in place of tier + surcharges (the bibs) */
  flat?: Record<string, number>;
  reversible: number;
  shippingFlat: number;
  freeShippingOver: number;
  minQty: number;
  /** 100 = full payment before production */
  depositPct: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  // 1–49 → ฿300 · 50–99 → ฿295 · 100+ → ฿290
  tiers: [
    { minQty: 100, price: num(process.env.PRICE_TIER_100, 290) },
    { minQty: 50, price: num(process.env.PRICE_TIER_50, 295) },
    { minQty: 1, price: num(process.env.PRICE_TIER_1, 300) },
  ],
  fabric: {
    mesh: num(process.env.PRICE_FABRIC_MESH, 0),
    B1: num(process.env.PRICE_FABRIC_B1, 20),
    C1: num(process.env.PRICE_FABRIC_C1, 40),
  },
  trim: {
    none: num(process.env.PRICE_TRIM_NONE, 0),
    neck: num(process.env.PRICE_TRIM_NECK, 10),
    neckarm: num(process.env.PRICE_TRIM_NECKARM, 20),
    full: num(process.env.PRICE_TRIM_FULL, 30),
  },
  garment: {
    jersey: 0,
    hoodie: signed(process.env.PRICE_GARMENT_HOODIE, 250),
    shorts: signed(process.env.PRICE_GARMENT_SHORTS, -80),
    piste: signed(process.env.PRICE_GARMENT_PISTE, 200),
    piste_zip: signed(process.env.PRICE_GARMENT_PISTE_ZIP, 280),
    pants: signed(process.env.PRICE_GARMENT_PANTS, 150),
  },
  flat: {
    bib_n: num(process.env.PRICE_BIB_N, 252),
    bib_r: num(process.env.PRICE_BIB_R, 245),
  },
  reversible: num(process.env.PRICE_REVERSIBLE, 60),
  shippingFlat: num(process.env.PRICE_SHIPPING, 80),
  freeShippingOver: num(process.env.PRICE_FREE_SHIPPING_OVER, 3500),
  minQty: num(process.env.ORDER_MIN_QTY, 1),
  depositPct: Math.min(100, num(process.env.ORDER_DEPOSIT_PCT, 100)),
};

export interface PriceInput {
  totalQty: number;
  fabric: string;
  trim: string;
  reversible?: boolean;
  garment?: Garment;
  /** a set shipping fee for this order (the agent in Japan), in place of the flat-or-free rule */
  shippingFee?: number;
}

export interface PriceBreakdown {
  totalQty: number;
  tierPrice: number;
  fabricSurcharge: number;
  trimSurcharge: number;
  garment: Garment;
  garmentSurcharge: number;
  reversibleSurcharge: number;
  unitPrice: number;
  subtotal: number;
  shippingFee: number;
  total: number;
  depositAmount: number;
  depositPct: number;
  freeShippingOver: number;
}

/** tiers may arrive from the DB in any order — always match highest minQty first */
export function tierFor(qty: number, cfg: PricingConfig): QtyTier {
  const sorted = [...cfg.tiers].sort((a, b) => b.minQty - a.minQty);
  return sorted.find(t => qty >= t.minQty) ?? sorted[sorted.length - 1] ?? { minQty: 1, price: 0 };
}

export function priceOrder(
  { totalQty, fabric, trim, reversible = false, garment = "jersey", shippingFee: setShipping }: PriceInput,
  cfg: PricingConfig = DEFAULT_PRICING,
): PriceBreakdown {
  const qty = Math.max(0, Math.trunc(totalQty));
  // a config saved before the bibs existed has no flat table: the defaults fill in
  const flat = cfg.flat?.[garment] ?? DEFAULT_PRICING.flat?.[garment];
  const tierPrice = flat ?? tierFor(qty, cfg).price;
  const fabricSurcharge = flat !== undefined ? 0 : cfg.fabric[fabric] ?? 0;
  const trimSurcharge = flat !== undefined ? 0 : cfg.trim[trim] ?? 0;
  const reversibleSurcharge = flat === undefined && reversible ? cfg.reversible : 0;
  // a config saved before garments existed has no garment table
  const garmentSurcharge = flat !== undefined || garment === "jersey" ? 0 : cfg.garment?.[garment] ?? DEFAULT_PRICING.garment[garment] ?? 0;

  const unitPrice = Math.max(0, tierPrice + fabricSurcharge + trimSurcharge + garmentSurcharge + reversibleSurcharge);
  const subtotal = unitPrice * qty;
  const shippingFee = subtotal === 0 ? 0
    : setShipping !== undefined ? Math.max(0, Math.round(setShipping))
    : subtotal >= cfg.freeShippingOver ? 0 : cfg.shippingFlat;
  const total = subtotal + shippingFee;

  return {
    totalQty: qty,
    tierPrice,
    fabricSurcharge,
    trimSurcharge,
    garment,
    garmentSurcharge,
    reversibleSurcharge,
    unitPrice,
    subtotal,
    shippingFee,
    total,
    depositAmount: Math.round((total * cfg.depositPct) / 100),
    depositPct: cfg.depositPct,
    freeShippingOver: cfg.freeShippingOver,
  };
}

/**
 * Public price table, for showing "50+ ตัว ลดเหลือ ฿295" on the checkout page.
 * Returns tiers ascending; never mutates the caller's config.
 */
export function priceTable(cfg: PricingConfig = DEFAULT_PRICING) {
  return { ...cfg, tiers: [...cfg.tiers].sort((a, b) => a.minQty - b.minQty), flat: { ...DEFAULT_PRICING.flat, ...cfg.flat } };
}
// unit tests: pricing.spec.ts
