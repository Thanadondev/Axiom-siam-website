import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsService, DEFAULT_MARKET } from "./settings.service";
import { DEFAULT_PRICING } from "../orders/pricing";

/** minimal in-memory stand-in for PrismaService.setting */
function fakePrisma(rows: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(rows));
  return {
    store,
    setting: {
      findUnique: vi.fn(async ({ where }: any) =>
        store.has(where.key) ? { key: where.key, valueJson: store.get(where.key) } : null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        store.set(where.key, (update?.valueJson ?? create?.valueJson));
        return { key: where.key, valueJson: store.get(where.key) };
      }),
    },
  };
}

const make = (p: any) => new SettingsService(p as any);

describe("SettingsService — reading", () => {
  it("falls back to code defaults when the table is empty", async () => {
    const s = make(fakePrisma());
    await expect(s.pricing()).resolves.toEqual(DEFAULT_PRICING);
    await expect(s.market()).resolves.toEqual(DEFAULT_MARKET);
  });

  it("survives the settings table not existing at all", async () => {
    const broken = { setting: { findUnique: vi.fn(async () => { throw new Error("relation does not exist"); }) } };
    const s = make(broken);
    await expect(s.pricing()).resolves.toEqual(DEFAULT_PRICING);
  });

  it("merges a partial DB row over the defaults", async () => {
    // only freeShippingOver was ever saved
    const s = make(fakePrisma({ pricing: { freeShippingOver: 9999 } }));
    const cfg = await s.pricing();
    expect(cfg.freeShippingOver).toBe(9999);
    expect(cfg.shippingFlat).toBe(DEFAULT_PRICING.shippingFlat); // untouched
    expect(cfg.tiers).toEqual(DEFAULT_PRICING.tiers);
  });

  it("lets the DB fully override tiers", async () => {
    const s = make(fakePrisma({ pricing: { tiers: [{ minQty: 1, price: 111 }] } }));
    const cfg = await s.pricing();
    expect(cfg.tiers).toEqual([{ minQty: 1, price: 111 }]);
  });

  it("reads the commission rate from the DB", async () => {
    const s = make(fakePrisma({ market: { commissionPct: 15 } }));
    const m = await s.market();
    expect(m.commissionPct).toBe(15);
    expect(m.termsVersion).toBe(DEFAULT_MARKET.termsVersion);
  });
});

describe("SettingsService — caching", () => {
  it("does not hit the DB twice inside the TTL", async () => {
    const p = fakePrisma({ market: { commissionPct: 20 } });
    const s = make(p);
    await s.market();
    await s.market();
    await s.market();
    expect(p.setting.findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-reads after invalidate()", async () => {
    const p = fakePrisma({ market: { commissionPct: 20 } });
    const s = make(p);
    await s.market();
    s.invalidate();
    await s.market();
    expect(p.setting.findUnique).toHaveBeenCalledTimes(2);
  });

  it("serves fresh data immediately after a write", async () => {
    const p = fakePrisma();
    const s = make(p);
    await s.market(); // warm the cache with defaults
    await s.saveMarket({ commissionPct: 42 }, "admin-1");
    const m = await s.market();
    expect(m.commissionPct).toBe(42); // cache was busted by the write
  });
});

describe("SettingsService — writing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges the patch onto current values instead of replacing the row", async () => {
    const p = fakePrisma({ pricing: { shippingFlat: 55 } });
    const s = make(p);
    const saved = await s.savePricing({ freeShippingOver: 1234 }, "admin-1");
    expect(saved.shippingFlat).toBe(55);        // preserved
    expect(saved.freeShippingOver).toBe(1234);  // updated
    expect(saved.depositPct).toBe(DEFAULT_PRICING.depositPct); // filled from defaults
  });

  it("stamps who changed it", async () => {
    const p = fakePrisma();
    const s = make(p);
    await s.saveMarket({ commissionPct: 25 }, "admin-9");
    const call = p.setting.upsert.mock.calls[0][0];
    expect(call.create.updatedBy).toBe("admin-9");
    expect(call.update.updatedBy).toBe("admin-9");
  });

  it("all() returns both sections", async () => {
    const s = make(fakePrisma({ market: { commissionPct: 12 } }));
    const all = await s.all();
    expect(all.market.commissionPct).toBe(12);
    expect(all.pricing.tiers.length).toBeGreaterThan(0);
  });
});
