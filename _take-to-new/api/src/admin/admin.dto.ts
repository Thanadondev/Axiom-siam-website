import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

export const ListQuerySchema = z.object({
  q: z.preprocess(emptyToUndef, z.string().max(120).optional()),
  status: z.preprocess(emptyToUndef, z.string().max(30).optional()),
  role: z.preprocess(emptyToUndef, z.enum(["guest", "customer", "staff", "production", "admin"]).optional()),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
export type ListQueryDto = z.infer<typeof ListQuerySchema>;

export const UpdateUserSchema = z.object({
  role: z.enum(["guest", "customer", "staff", "production", "admin"]).optional(),
  suspended: z.boolean().optional(),
  suspendReason: z.preprocess(emptyToUndef, z.string().max(300).optional()),
});
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

export const AdminTemplateSchema = z.object({
  status: z.enum(["draft", "published", "unlisted"]).optional(),
  featured: z.boolean().optional(),
  takedown: z.boolean().optional(), // true = remove from sale (copyright etc.)
  takedownReason: z.preprocess(emptyToUndef, z.string().max(300).optional()),
  earningsFrozen: z.boolean().optional(), // withhold seller earnings
});
export type AdminTemplateDto = z.infer<typeof AdminTemplateSchema>;

export const UpdateReportSchema = z.object({
  status: z.enum(["open", "reviewing", "actioned", "dismissed"]),
  adminNote: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
});
export type UpdateReportDto = z.infer<typeof UpdateReportSchema>;

export const CreatePayoutSchema = z.object({
  designerId: z.string().uuid(),
  note: z.preprocess(emptyToUndef, z.string().max(300).optional()),
});
export type CreatePayoutDto = z.infer<typeof CreatePayoutSchema>;

export const UpdateQuoteSchema = z.object({
  status: z.enum(["new", "contacted", "closed"]).optional(),
  adminNote: z.preprocess(emptyToUndef, z.string().max(1000).optional()),
});
export type UpdateQuoteDto = z.infer<typeof UpdateQuoteSchema>;
