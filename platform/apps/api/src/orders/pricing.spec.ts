import { describe, it, expect } from "vitest";
import { priceOrder, priceTable, tierFor, DEFAULT_PRICING, type PricingConfig } from "./pricing";

/** the config the business actually agreed on */
const cfg: PricingConfig = {
  tiers: [
    { minQty: 100, price: 290 },
    { minQty: 50, price: 295 },
    { minQty: 1, price: 300 },
  ],
  fabric: { mesh: 0, B1: 20, C1: 40 },
  trim: { none: 0, neck: 10, neckarm: 20, full: 30 },
  reversible: 60,
  shippingFlat: 80,
  freeShippingOver: 3500,
  minQty: 1,
  depositPct: 100,
};

describe("tierFor", () => {
  it("picks the tier by highest matching minQty", () => {
    expect(tierFor(1, cfg).price).toBe(300);
    expect(tierFor(49, cfg).price).toBe(300);
    expect(tierFor(50, cfg).price).toBe(295);
    expect(tierFor(99, cfg).price).toBe(295);
    expect(tierFor(100, cfg).price).toBe(290);
    expect(tierFor(5000, cfg).price).toBe(290);
  });

  it("is order-independent — tiers may come from the DB unsorted", () => {
    const shuffled: PricingConfig = { ...cfg, tiers: [{ minQty: 1, price: 300 }, { minQty: 100, price: 290 }, { minQty: 50, price: 295 }] };
    expect(tierFor(100, shuffled).price).toBe(290);
    expect(tierFor(60, shuffled).price).toBe(295);
    expect(tierFor(2, shuffled).price).toBe(300);
  });

  it("falls back to the lowest tier below the minimum", () => {
    expect(tierFor(0, cfg).price).toBe(300);
  });
});

describe("priceOrder — unit price", () => {
  it("adds fabric + trim surcharges to the tier price", () => {
    const p = priceOrder({ totalQty: 10, fabric: "B1", trim: "neck" }, cfg);
    expect(p.tierPrice).toBe(300);
    expect(p.fabricSurcharge).toBe(20);
    expect(p.trimSurcharge).toBe(10);
    expect(p.unitPrice).toBe(330);
  });

  it("adds the reversible surcharge only when asked", () => {
    expect(priceOrder({ totalQty: 10, fabric: "mesh", trim: "none" }, cfg).unitPrice).toBe(300);
    expect(priceOrder({ totalQty: 10, fabric: "mesh", trim: "none", reversible: true }, cfg).unitPrice).toBe(360);
  });

  it("treats unknown fabric/trim as zero surcharge rather than NaN", () => {
    const p = priceOrder({ totalQty: 10, fabric: "does-not-exist", trim: "nope" }, cfg);
    expect(p.unitPrice).toBe(300);
    expect(Number.isNaN(p.total)).toBe(false);
  });
});

describe("priceOrder — totals", () => {
  it("multiplies by quantity", () => {
    const p = priceOrder({ totalQty: 49, fabric: "B1", trim: "neck" }, cfg);
    expect(p.subtotal).toBe(330 * 49); // 16,170
  });

  it("charges flat shipping below the free-shipping threshold", () => {
    const p = priceOrder({ totalQty: 1, fabric: "mesh", trim: "none" }, cfg); // 300
    expect(p.shippingFee).toBe(80);
    expect(p.total).toBe(380);
  });

  it("gives free shipping exactly at the threshold", () => {
    // 3500 is the threshold; build a subtotal that lands on it
    const onThreshold: PricingConfig = { ...cfg, tiers: [{ minQty: 1, price: 350 }] };
    const p = priceOrder({ totalQty: 10, fabric: "mesh", trim: "none" }, onThreshold);
    expect(p.subtotal).toBe(3500);
    expect(p.shippingFee).toBe(0);
  });

  it("charges shipping one baht below the threshold", () => {
    const justUnder: PricingConfig = { ...cfg, tiers: [{ minQty: 1, price: 3499 }] };
    const p = priceOrder({ totalQty: 1, fabric: "mesh", trim: "none" }, justUnder);
    expect(p.subtotal).toBe(3499);
    expect(p.shippingFee).toBe(80);
    expect(p.total).toBe(3579);
  });

  it("never charges shipping on an empty order", () => {
    const p = priceOrder({ totalQty: 0, fabric: "mesh", trim: "none" }, cfg);
    expect(p.subtotal).toBe(0);
    expect(p.shippingFee).toBe(0);
    expect(p.total).toBe(0);
  });

  it("clamps and truncates a nonsense quantity", () => {
    expect(priceOrder({ totalQty: -5, fabric: "mesh", trim: "none" }, cfg).totalQty).toBe(0);
    expect(priceOrder({ totalQty: 10.9, fabric: "mesh", trim: "none" }, cfg).totalQty).toBe(10);
  });

  it("returns whole baht only — never fractions", () => {
    const p = priceOrder({ totalQty: 37, fabric: "C1", trim: "full", reversible: true }, cfg);
    for (const v of [p.unitPrice, p.subtotal, p.shippingFee, p.total, p.depositAmount]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("priceOrder — deposit", () => {
  it("bills the full total when depositPct is 100", () => {
    const p = priceOrder({ totalQty: 10, fabric: "mesh", trim: "none" }, cfg);
    expect(p.depositPct).toBe(100);
    expect(p.depositAmount).toBe(p.total);
  });

  it("bills a fraction when depositPct is lower", () => {
    const half: PricingConfig = { ...cfg, depositPct: 50 };
    const p = priceOrder({ totalQty: 10, fabric: "mesh", trim: "none" }, half); // 3000, free shipping? 3000<3500 so +80
    expect(p.total).toBe(3080);
    expect(p.depositAmount).toBe(1540);
  });
});

describe("real-world examples agreed with the owner", () => {
  const cases: [number, string, string, boolean, number, number][] = [
    // qty, fabric, trim, reversible, unitPrice, total
    [1, "mesh", "none", false, 300, 380],
    [49, "B1", "neck", false, 330, 16170],
    [50, "B1", "neck", false, 325, 16250],
    [99, "mesh", "none", false, 295, 29205],
    [100, "C1", "full", true, 420, 42000],
    [150, "mesh", "none", false, 290, 43500],
  ];
  it.each(cases)("%i ตัว %s %s rev=%s → ฿%i/ตัว, รวม ฿%i", (qty, fabric, trim, reversible, unit, total) => {
    const p = priceOrder({ totalQty: qty, fabric, trim, reversible }, cfg);
    expect(p.unitPrice).toBe(unit);
    expect(p.total).toBe(total);
  });
});

describe("priceTable", () => {
  it("returns tiers ascending for display", () => {
    const t = priceTable(cfg);
    expect(t.tiers.map(x => x.minQty)).toEqual([1, 50, 100]);
  });

  it("does not mutate the source config", () => {
    const before = cfg.tiers.map(t => t.minQty);
    priceTable(cfg);
    expect(cfg.tiers.map(t => t.minQty)).toEqual(before);
  });
});

describe("DEFAULT_PRICING", () => {
  it("matches the agreed numbers", () => {
    expect(tierFor(1, DEFAULT_PRICING).price).toBe(300);
    expect(tierFor(50, DEFAULT_PRICING).price).toBe(295);
    expect(tierFor(100, DEFAULT_PRICING).price).toBe(290);
    expect(DEFAULT_PRICING.freeShippingOver).toBe(3500);
    expect(DEFAULT_PRICING.depositPct).toBe(100);
  });
});
