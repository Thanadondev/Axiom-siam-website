import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

export const RegisterSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
  fullName: z.preprocess(emptyToUndef, z.string().min(1, "กรุณากรอกชื่อ-นามสกุล").max(120)),
  phone: z.preprocess(emptyToUndef, z.string().max(40).optional()),
  companyName: z.preprocess(emptyToUndef, z.string().max(160).optional()),
  // the language they signed up in: their emails and notifications come in it
  locale: z.enum(["th", "en", "ja"]).optional(),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // 6-digit TOTP or a XXXXX-XXXXX recovery code; only needed when 2FA is on
  totpCode: z.preprocess(emptyToUndef, z.string().max(20).optional()),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const TotpCodeSchema = z.object({
  code: z.string().min(6, "กรอกรหัส 6 หลัก").max(20),
});
export type TotpCodeDto = z.infer<typeof TotpCodeSchema>;

export const TotpDisableSchema = z.object({
  // optional: an account without a password has the code alone as proof
  password: z.string().optional().default(""),
  code: z.string().min(6).max(20),
});
export type TotpDisableDto = z.infer<typeof TotpDisableSchema>;

export const SetPasswordSchema = z.object({
  current: z.string().optional(), // required by the service only when a password exists
  newPassword: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร"),
});
export type SetPasswordDto = z.infer<typeof SetPasswordSchema>;

export const VerifyEmailSchema = z.object({ token: z.string().min(10) });

export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

// locale: the language of the page they asked from, so the email reads the same as the page
export const RequestResetSchema = z.object({ email: z.string().email(), locale: z.enum(["th", "en", "ja"]).optional() });
export type RequestResetDto = z.infer<typeof RequestResetSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(160).optional(),
  bio: z.string().max(500).optional(), // public blurb on the designer profile
  locale: z.enum(["th", "en", "ja"]).optional(), // the language of their notifications (and emails, later)
});
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const AddressSchema = z.object({
  label: z.preprocess(emptyToUndef, z.string().max(40).optional()),
  recipient: z.string().min(1, "กรุณากรอกชื่อผู้รับ").max(120),
  phone: z.string().min(1, "กรุณากรอกเบอร์โทร").max(40),
  line1: z.string().min(1, "กรุณากรอกที่อยู่").max(200),
  line2: z.preprocess(emptyToUndef, z.string().max(200).optional()),
  district: z.preprocess(emptyToUndef, z.string().max(80).optional()),
  province: z.preprocess(emptyToUndef, z.string().max(80).optional()),
  postalCode: z.string().min(1, "กรุณากรอกรหัสไปรษณีย์").max(20),
  country: z.preprocess(emptyToUndef, z.string().max(2).optional()),
  isDefault: z.boolean().optional(),
});
export type AddressDto = z.infer<typeof AddressSchema>;

export const AddressUpdateSchema = AddressSchema.partial();
export type AddressUpdateDto = z.infer<typeof AddressUpdateSchema>;
