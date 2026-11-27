import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, "กรุณาตั้งชื่อเทมเพลต").max(160),
  description: z.preprocess(emptyToUndef, z.string().max(2000).optional()),
  category: z.preprocess(emptyToUndef, z.string().max(60).optional()),
  tags: z.array(z.string().max(40)).max(20).optional(),
  price: z.coerce.number().int().min(0).max(1_000_000),
  previewUrl: z.preprocess(emptyToUndef, z.string().optional()),
  stateJson: z.any(),
  status: z.enum(["draft", "published", "unlisted"]).optional(),
  agreedTerms: z.boolean().optional(), // must be true when publishing to the marketplace
});
export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  name: z.preprocess(emptyToUndef, z.string().min(1).max(160).optional()),
  description: z.preprocess(emptyToUndef, z.string().max(2000).optional()),
  category: z.preprocess(emptyToUndef, z.string().max(60).optional()),
  tags: z.array(z.string().max(40)).max(20).optional(),
  price: z.coerce.number().int().min(0).max(1_000_000).optional(),
  previewUrl: z.preprocess(emptyToUndef, z.string().optional()),
  stateJson: z.any().optional(),
  status: z.enum(["draft", "published", "unlisted"]).optional(),
});
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>;

export const BrowseQuerySchema = z.object({
  q: z.preprocess(emptyToUndef, z.string().max(80).optional()),
  category: z.preprocess(emptyToUndef, z.string().max(60).optional()),
  sort: z.enum(["newest", "popular", "price_asc", "price_desc"]).optional(),
  take: z.coerce.number().int().min(1).max(60).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
export type BrowseQueryDto = z.infer<typeof BrowseQuerySchema>;

export const ReportTemplateSchema = z.object({
  reason: z.enum(["copyright", "trademark", "illegal", "other"]),
  detail: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
});
export type ReportTemplateDto = z.infer<typeof ReportTemplateSchema>;
