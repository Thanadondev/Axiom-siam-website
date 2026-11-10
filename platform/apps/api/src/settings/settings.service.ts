import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_PRICING, type PricingConfig } from "../orders/pricing";

/** DB keys */
export const KEY_PRICING = "pricing";
export const KEY_MARKET = "market";
export const KEY_BANK = "payments.bank";

export interface MarketConfig {
  commissionPct: number;
  termsVersion: string;
}

export const DEFAULT_MARKET: MarketConfig = {
  commissionPct: Math.min(100, Math.max(0, Number(process.env.MARKET_COMMISSION_PCT ?? 30))),
  termsVersion: process.env.MARKET_TERMS_VERSION ?? "1.0 (2026-07-08)",
};

/**
 * Where customers send money. Editable in /admin — changing a bank account
 * must never need a deploy, and env vars are only the first-run seed.
 */
export interface BankConfig {
  /** shown on the order page */
  bankName: string;
  accountNo: string;
  accountName: string;
  /** PromptPay target the QR is generated from — blank disables the QR */
  promptpayId: string;
  promptpayType: "phone" | "natid" | "ewallet";
  /** free-text instructions under the QR */
  note: string;
  /** false = ordering still works, but the pay panel says "ยังไม่เปิดรับชำระ" */
  enabled: boolean;
}

export const DEFAULT_BANK: BankConfig = {
  bankName: process.env.BANK_NAME ?? "",
  accountNo: process.env.BANK_ACCOUNT_NO ?? "",
  accountName: process.env.BANK_ACCOUNT_NAME ?? "",
  promptpayId: process.env.PROMPTPAY_ID ?? "",
  promptpayType: (process.env.PROMPTPAY_TYPE as BankConfig["promptpayType"]) ?? "phone",
  note: process.env.BANK_NOTE ?? "โอนแล้วแนบสลิปในหน้านี้ ทีมงานตรวจสอบภายใน 1 วันทำการ",
  // only "on" once someone has actually filled in an account
  enabled: Boolean(process.env.PROMPTPAY_ID || process.env.BANK_ACCOUNT_NO),
};

/**
 * Consolidated shipping to the agent / warehouse in Japan: teams ordering bibs by
 * zip pick it instead of an address. Off until an admin fills in the agent; its
 * fee is per order, set by the admin (not the domestic flat-or-free rule).
 */
export interface DeliveryConfig {
  agentEnabled: boolean;
  /** shown to the customer, e.g. "Axiom Japan (Osaka warehouse)" */
  agentName: string;
  /** printed on the job sheet and the order; not shown before ordering */
  agentAddress: string;
  agentPhone: string;
  /** baht per order */
  agentFee: number;
}
export const KEY_DELIVERY = "delivery";
export const DEFAULT_DELIVERY: DeliveryConfig = { agentEnabled: false, agentName: "", agentAddress: "", agentPhone: "", agentFee: 0 };

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

  // ---------- bank / payments ----------
  bank() {
    return this.read<BankConfig>(KEY_BANK, DEFAULT_BANK);
  }
  saveBank(patch: Partial<BankConfig>, adminId?: string) {
    return this.write<BankConfig>(KEY_BANK, patch, DEFAULT_BANK, adminId);
  }

  // ---------- delivery (the agent in Japan) ----------
  delivery() {
    return this.read<DeliveryConfig>(KEY_DELIVERY, DEFAULT_DELIVERY);
  }
  saveDelivery(patch: Partial<DeliveryConfig>, adminId?: string) {
    return this.write<DeliveryConfig>(KEY_DELIVERY, patch, DEFAULT_DELIVERY, adminId);
  }

  async all() {
    const [pricing, market, bank, delivery] = await Promise.all([this.pricing(), this.market(), this.bank(), this.delivery()]);
    return { pricing, market, bank, delivery };
  }

  /** call after a write from elsewhere */
  invalidate() {
    this.cache.clear();
  }
}
