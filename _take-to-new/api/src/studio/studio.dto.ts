import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

export const CreateDesignSchema = z.object({
  name: z.preprocess(emptyToUndef, z.string().max(160).optional()),
  mode: z.enum(["single", "reversible"]).optional(),
  stateJson: z.any(),
  previewUrl: z.preprocess(emptyToUndef, z.string().optional()),
});
export type CreateDesignDto = z.infer<typeof CreateDesignSchema>;

export const UpdateDesignSchema = z.object({
  name: z.preprocess(emptyToUndef, z.string().max(160).optional()),
  stateJson: z.any().optional(),
  previewUrl: z.preprocess(emptyToUndef, z.string().optional()),
});
export type UpdateDesignDto = z.infer<typeof UpdateDesignSchema>;

export const CreateQuoteSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ").max(160),
  email: z.preprocess(emptyToUndef, z.string().email().optional()),
  phone: z.preprocess(emptyToUndef, z.string().max(40).optional()),
  message: z.preprocess(emptyToUndef, z.string().max(2000).optional()),
  designId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
});
export type CreateQuoteDto = z.infer<typeof CreateQuoteSchema>;
