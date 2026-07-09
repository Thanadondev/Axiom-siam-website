import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP / RFC 4226 HOTP — implemented with node:crypto only.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 *
 * Pure and dependency-free so it can be unit-tested against the RFC vectors.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error("invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP */
export function hotp(secret: Buffer, counter: number, digits = 6, algo: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const buf = Buffer.alloc(8);
  // counter is 64-bit big-endian; JS ints are safe below 2^53 which is plenty
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac(algo, secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const TOTP_STEP = 30;

/** RFC 6238 TOTP for a given unix time (seconds) */
export function totp(secretB32: string, atSeconds = Math.floor(Date.now() / 1000), step = TOTP_STEP, digits = 6): string {
  return hotp(base32Decode(secretB32), Math.floor(atSeconds / step), digits);
}

/**
 * Verifies a user-supplied code, tolerating `window` steps of clock drift
 * on either side (default ±1 step = ±30s). Compares in constant time.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  { atSeconds = Math.floor(Date.now() / 1000), window = 1, step = TOTP_STEP, digits = 6 } = {},
): boolean {
  const supplied = String(code ?? "").replace(/\s/g, "");
  if (!/^\d+$/.test(supplied) || supplied.length !== digits) return false;

  for (let w = -window; w <= window; w++) {
    const expected = totp(secretB32, atSeconds + w * step, step, digits);
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** 160-bit secret, the size Google Authenticator expects */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** otpauth:// URI — feed this into a QR code */
export function otpauthUrl(secretB32: string, account: string, issuer = "Axiom Siam"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: "6", period: String(TOTP_STEP) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------- recovery codes ----------

/** stored hashed; shown to the user exactly once */
export function generateRecoveryCodes(count = 8): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"), // XXXXX-XXXXX
  );
  return { plain, hashed: plain.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** returns the remaining hashes if the code matched (single-use), else null */
export function consumeRecoveryCode(code: string, hashed: string[]): string[] | null {
  const h = hashRecoveryCode(code);
  const idx = hashed.indexOf(h);
  if (idx === -1) return null;
  return hashed.filter((_, i) => i !== idx);
}
