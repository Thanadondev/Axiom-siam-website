import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_PRICING, type PricingConfig } from "../orders/pricing";

/** DB keys */
export const KEY_PRICING = "pricing";
export const KEY_MARKET = "market";

export interface MarketConfig {
  commissionPct: number;
  termsVersion: string;
}

export const DEFAULT_MARKET: MarketConfig = {
  commissionPct: Math.min(100, Math.max(0, Number(process.env.MARKET_COMMISSION_PCT ?? 30))),
  termsVersion: process.env.MARKET_TERMS_VERSION ?? "1.0 (2026-07-08)",
};

/**
 * Reads editable config from the `settings` table with an in-memory cache.
 * Any missing key falls back to the env/code default, so the app works
 * even before an admin has ever saved settings (or if the table is empty).
 */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();
  private readonly ttlMs = 30_000;

  constructor(private prisma: PrismaService) {}

  private async read<T>(key: string, fallback: T): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T;
    let value = fallback;
    try {
      const row = await this.prisma.setting.findUnique({ where: { key } });
      if (row?.valueJson) value = { ...fallback, ...(row.valueJson as object) } as T;
    } catch {
      /* table may not exist yet — use defaults */
    }
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  private async write<T extends object>(key: string, patch: Partial<T>, fallback: T, adminId?: string): Promise<T> {
    const current = await this.read<T>(key, fallback);
    const merged = { ...current, ...patch };
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, valueJson: merged as any, updatedBy: adminId },
      update: { valueJson: merged as any, updatedBy: adminId },
    });
    this.cache.delete(key);
    return merged;
  }

  // ---------- pricing ----------
  pricing() {
    return this.read<PricingConfig>(KEY_PRICING, DEFAULT_PRICING);
  }
  savePricing(patch: Partial<PricingConfig>, adminId?: string) {
    return this.write<PricingConfig>(KEY_PRICING, patch, DEFAULT_PRICING, adminId);
  }

  // ---------- marketplace ----------
  market() {
    return this.read<MarketConfig>(KEY_MARKET, DEFAULT_MARKET);
  }
  saveMarket(patch: Partial<MarketConfig>, adminId?: string) {
    return this.write<MarketConfig>(KEY_MARKET, patch, DEFAULT_MARKET, adminId);
  }

  async all() {
    const [pricing, market] = await Promise.all([this.pricing(), this.market()]);
    return { pricing, market };
  }

  /** call after a write from elsewhere */
  invalidate() {
    this.cache.clear();
  }
}
