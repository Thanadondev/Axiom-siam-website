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

export interface QtyTier {
  minQty: number;
  price: number;
}

export interface PricingConfig {
  /** matched top-down: first tier whose minQty <= qty wins */
  tiers: QtyTier[];
  fabric: Record<string, number>;
  trim: Record<string, number>;
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
}

export interface PriceBreakdown {
  totalQty: number;
  tierPrice: number;
  fabricSurcharge: number;
  trimSurcharge: number;
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
  { totalQty, fabric, trim, reversible = false }: PriceInput,
  cfg: PricingConfig = DEFAULT_PRICING,
): PriceBreakdown {
  const qty = Math.max(0, Math.trunc(totalQty));
  const tierPrice = tierFor(qty, cfg).price;
  const fabricSurcharge = cfg.fabric[fabric] ?? 0;
  const trimSurcharge = cfg.trim[trim] ?? 0;
  const reversibleSurcharge = reversible ? cfg.reversible : 0;

  const unitPrice = tierPrice + fabricSurcharge + trimSurcharge + reversibleSurcharge;
  const subtotal = unitPrice * qty;
  const shippingFee = subtotal === 0 || subtotal >= cfg.freeShippingOver ? 0 : cfg.shippingFlat;
  const total = subtotal + shippingFee;

  return {
    totalQty: qty,
    tierPrice,
    fabricSurcharge,
    trimSurcharge,
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
  return { ...cfg, tiers: [...cfg.tiers].sort((a, b) => a.minQty - b.minQty) };
}
// unit tests: pricing.spec.ts
