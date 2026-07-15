/**
 * The rule that ties together password-based and Google-only accounts.
 * Pure so it can be unit-tested without a database.
 *
 * A Google-only account has `hasPassword === false`. It should never be forced
 * to type a password it doesn't have — for those flows a valid 2FA/recovery
 * code (or simply not requiring a current password when setting the first one)
 * is proof enough.
 */

/** does this action need the current password re-entered? */
export function requiresCurrentPassword(hasPassword: boolean): boolean {
  return hasPassword;
}

export type PwCheck = { ok: true } | { ok: false; reason: string };

/** gate for setting/changing a password */
export function canSetPassword(hasPassword: boolean, current: string | undefined, newPassword: string): PwCheck {
  if (!newPassword || newPassword.length < 8) return { ok: false, reason: "รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร" };
  if (hasPassword && !current) return { ok: false, reason: "ต้องกรอกรหัสผ่านปัจจุบัน" };
  return { ok: true };
}

/** gate for disabling 2FA */
export function canDisableTotp(hasPassword: boolean, passwordMatches: boolean, codeValid: boolean): PwCheck {
  if (hasPassword && !passwordMatches) return { ok: false, reason: "รหัสผ่านไม่ถูกต้อง" };
  if (!codeValid) return { ok: false, reason: "รหัสยืนยันไม่ถูกต้อง" };
  return { ok: true };
}
