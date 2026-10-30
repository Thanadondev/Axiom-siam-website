import { z } from "zod";

const money = z.coerce.number().int().min(0).max(1_000_000);
/** a garment's price difference from a jersey: may be negative */
const delta = z.coerce.number().int().min(-1_000_000).max(1_000_000);

export const QtyTierSchema = z.object({
  minQty: z.coerce.number().int().min(1).max(100_000),
  price: money,
});

export const UpdatePricingSchema = z.object({
  tiers: z.array(QtyTierSchema).min(1).max(10).optional(),
  fabric: z.record(z.string(), money).optional(),
  trim: z.record(z.string(), money).optional(),
  garment: z.object({
    hoodie: delta.optional(), shorts: delta.optional(),
    piste: delta.optional(), piste_zip: delta.optional(), pants: delta.optional(),
  }).optional(),
  reversible: money.optional(),
  shippingFlat: money.optional(),
  freeShippingOver: money.optional(),
  minQty: z.coerce.number().int().min(1).max(1000).optional(),
  depositPct: z.coerce.number().int().min(1).max(100).optional(),
});
export type UpdatePricingDto = z.infer<typeof UpdatePricingSchema>;

export const UpdateMarketSchema = z.object({
  commissionPct: z.coerce.number().int().min(0).max(100).optional(),
  termsVersion: z.string().min(1).max(60).optional(),
});
export type UpdateMarketDto = z.infer<typeof UpdateMarketSchema>;
