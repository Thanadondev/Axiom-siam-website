/**
 * PromptPay QR payload builder — EMVCo "Merchant Presented QR" spec as adopted
 * by the Bank of Thailand.
 *
 * No dependency: the format is a plain TLV string plus a CRC, and every QR
 * library for this is a thin wrapper around the same 60 lines. Owning it means
 * no supply-chain risk on the one string that decides where money lands.
 *
 * The QR only encodes *who to pay and how much*. It is not a payment
 * confirmation — the money is only real once the slip is verified.
 */

// ---------- TLV ----------
/** every field is: 2-digit id + 2-digit length + value */
export function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** parse a payload back into fields — used by the tests, and handy for debugging */
export function parseTlv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

// ---------- CRC ----------
/**
 * CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, no reflection, no final xor.
 * Standard check value: crc16("123456789") === 0x29B1 (asserted in the tests).
 */
export function crc16(input: string): number {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc >>> 0;
}

// ---------- target normalisation ----------
export type PromptPayType = "phone" | "natid" | "ewallet";

/**
 * PromptPay targets are fixed-width and country-coded:
 *   phone   0812345678      -> 0066812345678   (13, tag 01)
 *   nat id  1234567890123   -> as-is           (13, tag 02)
 *   ewallet 123456789012345 -> as-is           (15, tag 03)
 */
export function normalizeTarget(raw: string, type: PromptPayType): { tag: string; value: string } {
  const digits = (raw ?? "").replace(/\D/g, "");

  if (type === "phone") {
    // accept 0812345678 / 66812345678 / +66812345678 / 0066812345678
    let local = digits;
    if (local.startsWith("0066")) local = local.slice(4);
    else if (local.startsWith("66")) local = local.slice(2);
    else if (local.startsWith("0")) local = local.slice(1);
    if (local.length !== 9) throw new Error(`เบอร์พร้อมเพย์ไม่ถูกต้อง: ${raw}`);
    return { tag: "01", value: `0066${local}` };
  }

  if (type === "natid") {
    if (digits.length !== 13) throw new Error(`เลขบัตรประชาชนต้องมี 13 หลัก: ${raw}`);
    return { tag: "02", value: digits };
  }

  if (digits.length !== 15) throw new Error(`เลข e-wallet ต้องมี 15 หลัก: ${raw}`);
  return { tag: "03", value: digits };
}

// ---------- amount ----------
/** THB, always 2 decimals. Rejects anything a bank would refuse. */
export function formatAmount(baht: number): string {
  if (!Number.isFinite(baht) || baht <= 0) throw new Error(`ยอดเงินไม่ถูกต้อง: ${baht}`);
  if (baht > 9_999_999.99) throw new Error(`ยอดเงินเกินที่พร้อมเพย์รองรับ: ${baht}`);
  return baht.toFixed(2);
}

// ---------- payload ----------
const AID = "A000000677010111"; // PromptPay application id

export interface PromptPayOptions {
  /** phone / national id / e-wallet id of the receiving account */
  target: string;
  type?: PromptPayType;
  /** omit for a static QR the payer types the amount into */
  amount?: number;
}

/**
 * Build the string that goes inside the QR image.
 * With an amount the QR is marked "dynamic" (one-time) so wallets don't cache it.
 */
export function buildPromptPayPayload({ target, type = "phone", amount }: PromptPayOptions): string {
  const { tag, value } = normalizeTarget(target, type);

  const merchant = tlv("00", AID) + tlv(tag, value);

  const body =
    tlv("00", "01") +                                  // payload format indicator
    tlv("01", amount != null ? "12" : "11") +          // 12 = single use (has amount), 11 = reusable
    tlv("29", merchant) +                              // PromptPay account
    tlv("53", "764") +                                 // currency THB
    (amount != null ? tlv("54", formatAmount(amount)) : "") +
    tlv("58", "TH");                                   // country

  // the CRC covers everything including its own id+length ("6304")
  const withCrcHeader = `${body}6304`;
  const crc = crc16(withCrcHeader).toString(16).toUpperCase().padStart(4, "0");
  return withCrcHeader + crc;
}

/** true when a payload's trailing CRC matches its body — used to sanity-check ours */
export function verifyPayload(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  const given = payload.slice(-4).toUpperCase();
  return crc16(body).toString(16).toUpperCase().padStart(4, "0") === given;
}
