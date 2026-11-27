import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

export const SIZES = ["S", "M", "L", "XL"] as const;
export const FABRICS = ["mesh", "B1", "C1"] as const;
export const TRIMS = ["none", "neck", "neckarm", "full"] as const;

/** one row of the size breakdown, e.g. { size: "L", qty: 12 } */
export const SizeLineSchema = z.object({
  size: z.enum(SIZES),
  qty: z.coerce.number().int().min(0).max(5000),
});

/** optional per-player roster row (name / number on the shirt) */
export const RosterRowSchema = z.object({
  playerName: z.preprocess(emptyToUndef, z.string().max(60).optional()),
  number: z.preprocess(emptyToUndef, z.string().max(6).optional()),
  size: z.enum(SIZES),
  qty: z.coerce.number().int().min(1).max(50).default(1),
});

export const PriceQuerySchema = z.object({
  totalQty: z.coerce.number().int().min(0).max(100_000),
  fabric: z.enum(FABRICS),
  trim: z.enum(TRIMS),
  reversible: z.preprocess(v => v === "true" || v === true, z.boolean()).optional(),
});
export type PriceQueryDto = z.infer<typeof PriceQuerySchema>;

export const CreateOrderSchema = z.object({
  designId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  designSnapshot: z.any().optional(), // frozen design state at order time
  previewUrl: z.preprocess(emptyToUndef, z.string().optional()),
  fabric: z.enum(FABRICS),
  trim: z.enum(TRIMS),
  reversible: z.boolean().optional(),
  lines: z.array(SizeLineSchema).min(1, "กรุณาระบุจำนวนอย่างน้อย 1 ไซส์"),
  roster: z.array(RosterRowSchema).max(500).optional(),
  shippingAddressId: z.string().uuid({ message: "กรุณาเลือกที่อยู่จัดส่ง" }),
  note: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
});
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const ORDER_STATUSES = [
  "pending", "paid", "approved", "in_production", "shipped", "delivered", "completed", "cancelled", "refunded",
] as const;

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.preprocess(emptyToUndef, z.string().max(500).optional()),
  // only used when moving to "shipped"
  courier: z.preprocess(emptyToUndef, z.string().max(60).optional()),
  trackingNo: z.preprocess(emptyToUndef, z.string().max(80).optional()),
});
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;

export const OrderListQuerySchema = z.object({
  status: z.preprocess(emptyToUndef, z.enum(ORDER_STATUSES).optional()),
  q: z.preprocess(emptyToUndef, z.string().max(80).optional()),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
export type OrderListQueryDto = z.infer<typeof OrderListQuerySchema>;
