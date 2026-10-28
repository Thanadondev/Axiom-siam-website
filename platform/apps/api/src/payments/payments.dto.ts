import { z } from "zod";
import { StorageService } from "./storage.service";

/**
 * Slip upload. The image is a base64 data-URL from the browser's FileReader.
 *
 * The length cap is a cheap first gate: base64 inflates by ~4/3, so this
 * rejects an oversized body before we ever allocate a Buffer for it. The real
 * check (magic bytes, decoded size) happens in StorageService.validate.
 */
export const SubmitSlipSchema = z.object({
  image: z
    .string()
    .min(100, "ไฟล์รูปไม่ถูกต้อง")
    .max(Math.ceil(StorageService.MAX_BYTES * 1.4), "ไฟล์ใหญ่เกินไป")
    .refine(
      s => /^data:image\/(jpeg|jpg|png|webp|heic);base64,/.test(s) || /^[A-Za-z0-9+/=\s]+$/.test(s),
      "รองรับเฉพาะรูปภาพ JPG / PNG / WEBP / HEIC เท่านั้น",
    ),
});
export type SubmitSlipDto = z.infer<typeof SubmitSlipSchema>;

/** admin approve — the numbers a human read off the slip */
export const ApproveSlipSchema = z.object({
  amount: z.coerce.number().int().positive().optional(),
  ref: z.string().trim().max(64).optional(),
  transferredAt: z.coerce.date().optional(),
});
export type ApproveSlipDto = z.infer<typeof ApproveSlipSchema>;

/** admin records money received outside the slip flow (cash, cheque, a transfer without a slip) */
export const RecordPaymentSchema = z.object({
  amount: z.coerce.number().int().positive("ยอดเงินต้องมากกว่า 0").max(10_000_000),
  method: z.enum(["cash", "transfer", "cheque", "other"]),
  ref: z.string().trim().max(64).optional(),
  note: z.string().trim().min(3, "กรุณาระบุหมายเหตุ (ใครรับเงิน / รับเมื่อไหร่)").max(300),
});
export type RecordPaymentDto = z.infer<typeof RecordPaymentSchema>;

/** admin reject — the customer sees this reason, so it must not be empty */
export const RejectSlipSchema = z.object({
  reason: z.string().trim().min(3, "กรุณาระบุเหตุผล").max(300),
});
export type RejectSlipDto = z.infer<typeof RejectSlipSchema>;

/** admin edits the company bank account */
export const BankConfigSchema = z.object({
  bankName: z.string().trim().max(80).optional(),
  accountNo: z.string().trim().max(40).optional(),
  accountName: z.string().trim().max(120).optional(),
  promptpayId: z.string().trim().max(40).optional(),
  promptpayType: z.enum(["phone", "natid", "ewallet"]).optional(),
  note: z.string().trim().max(300).optional(),
  enabled: z.boolean().optional(),
});
export type BankConfigDto = z.infer<typeof BankConfigSchema>;
