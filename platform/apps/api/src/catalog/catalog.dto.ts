import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

export const FabricSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(80),
  priceAdj: z.coerce.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
});
export type FabricDto = z.infer<typeof FabricSchema>;
export const FabricPatchSchema = FabricSchema.partial();
export type FabricPatchDto = z.infer<typeof FabricPatchSchema>;

export const SizeSchema = z.object({
  code: z.string().min(1).max(10),
  label: z.string().min(1).max(40),
  widthCm: z.coerce.number().min(0).max(300).optional(),
  heightCm: z.coerce.number().min(0).max(300).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});
export type SizeDto = z.infer<typeof SizeSchema>;
export const SizePatchSchema = SizeSchema.partial();
export type SizePatchDto = z.infer<typeof SizePatchSchema>;

export const ColorSchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "ต้องเป็นรหัสสีแบบ #RRGGBB"),
  cmyk: z.string().min(1).max(40),
  name: z.preprocess(emptyToUndef, z.string().max(60).optional()),
  colorGroup: z.preprocess(emptyToUndef, z.string().max(40).optional()),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});
export type ColorDto = z.infer<typeof ColorSchema>;
export const ColorPatchSchema = ColorSchema.partial();
export type ColorPatchDto = z.infer<typeof ColorPatchSchema>;
