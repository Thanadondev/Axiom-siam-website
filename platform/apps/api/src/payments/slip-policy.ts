/**
 * Slip rules — the decisions, with no database and no HTTP in sight.
 *
 * Today a human reads the slip and clicks approve. Tomorrow an API (SlipOK /
 * EasySlip) may read it instead. Both paths land here, so the rules that decide
 * whether money is real live in one tested place, and swapping the reader never
 * changes what "acceptable" means.
 */

// ---------- what a slip reader gives us ----------
export interface SlipFacts {
  /** baht read off the slip */
  amount?: number | null;
  /** the bank's transaction reference — the anti-reuse key */
  ref?: string | null;
  /** when the transfer happened, per the slip */
  transferredAt?: Date | null;
  /** receiving account as printed — to catch transfers to someone else */
  receiverAccount?: string | null;
}

export interface SlipContext {
  /** what the order says is owed, in baht */
  expected: number;
  /** our account the money should have landed in (last 4 digits are enough) */
  ourAccountTail?: string | null;
  /** refs already used by other payments — a slip may only pay once */
  usedRefs?: Set<string>;
  /** sha256 of slips we've already seen — catches the same JPEG re-uploaded */
  usedHashes?: Set<string>;
  /** hash of the image being submitted */
  hash?: string | null;
  /** clock injection so tests aren't time-bombs */
  now?: Date;
}

export type SlipVerdict =
  | { decision: "accept"; reason?: string }
  | { decision: "reject"; reason: string }
  | { decision: "review"; reason: string };

// ---------- tunables ----------
/** banks round; we don't care about a stray satang */
export const AMOUNT_TOLERANCE_BAHT = 1;
/** a slip older than this is suspicious — probably a recycled transfer */
export const MAX_SLIP_AGE_DAYS = 7;
/** a slip dated in the future is either a wrong clock or a forgery */
export const MAX_CLOCK_SKEW_MINUTES = 10;

/**
 * Decide what to do with a slip.
 *
 * Bias: never auto-accept when unsure. "review" is the safe default because a
 * human approving a good slip costs a minute; auto-accepting a bad one costs
 * a production run.
 */
export function judgeSlip(facts: SlipFacts, ctx: SlipContext): SlipVerdict {
  const now = ctx.now ?? new Date();

  // ---- hard rejects: reuse ----
  // checked first — a duplicate is a duplicate no matter how right the amount is
  if (facts.ref && ctx.usedRefs?.has(facts.ref)) {
    return { decision: "reject", reason: "สลิปนี้ถูกใช้ไปแล้วกับออเดอร์อื่น (เลขอ้างอิงซ้ำ)" };
  }
  if (ctx.hash && ctx.usedHashes?.has(ctx.hash)) {
    return { decision: "reject", reason: "รูปสลิปนี้เคยถูกอัปโหลดมาแล้ว" };
  }

  // ---- couldn't read it: a human must look ----
  if (facts.amount == null) {
    return { decision: "review", reason: "อ่านยอดเงินจากสลิปไม่ได้ — ต้องให้แอดมินตรวจ" };
  }

  // ---- money ----
  const diff = facts.amount - ctx.expected;
  if (diff < -AMOUNT_TOLERANCE_BAHT) {
    return {
      decision: "reject",
      reason: `ยอดโอนน้อยกว่ายอดที่ต้องชำระ ฿${Math.abs(diff).toLocaleString()} (โอน ฿${facts.amount.toLocaleString()} / ต้องชำระ ฿${ctx.expected.toLocaleString()})`,
    };
  }
  if (diff > AMOUNT_TOLERANCE_BAHT) {
    // overpaid — never auto-accept, someone owes a refund
    return {
      decision: "review",
      reason: `ยอดโอนเกินไป ฿${diff.toLocaleString()} — ต้องตรวจสอบก่อนคืนเงินส่วนต่าง`,
    };
  }

  // ---- wrong account ----
  if (ctx.ourAccountTail && facts.receiverAccount) {
    const tail = facts.receiverAccount.replace(/\D/g, "").slice(-4);
    if (tail && tail !== ctx.ourAccountTail) {
      return { decision: "reject", reason: `โอนเข้าบัญชีอื่น (ลงท้าย ${tail}) ไม่ใช่บัญชีบริษัท` };
    }
  }

  // ---- time ----
  if (facts.transferredAt) {
    const ms = now.getTime() - facts.transferredAt.getTime();
    if (ms < -MAX_CLOCK_SKEW_MINUTES * 60_000) {
      return { decision: "review", reason: "วันที่บนสลิปเป็นอนาคต — ต้องตรวจสอบ" };
    }
    if (ms > MAX_SLIP_AGE_DAYS * 86_400_000) {
      const days = Math.floor(ms / 86_400_000);
      return { decision: "review", reason: `สลิปเก่ากว่า ${MAX_SLIP_AGE_DAYS} วัน (${days} วัน) — ต้องตรวจสอบ` };
    }
  }

  // ---- no ref means nothing stops a second upload of the same transfer ----
  if (!facts.ref) {
    return { decision: "review", reason: "สลิปไม่มีเลขอ้างอิง — กันใช้สลิปซ้ำไม่ได้ ต้องให้แอดมินตรวจ" };
  }

  return { decision: "accept" };
}

// ---------- the pluggable reader ----------
/**
 * Anything that can turn a slip image into facts.
 * Implement this to plug in SlipOK/EasySlip later — nothing else has to change.
 */
export interface SlipReader {
  readonly name: string;
  /** false when unconfigured — callers fall back to manual review */
  readonly enabled: boolean;
  read(image: Buffer, hints: { expected: number }): Promise<SlipFacts>;
}

/**
 * The reader we ship with: it reads nothing.
 *
 * Every slip goes to a human, which is exactly what we want on day one — no
 * API bill, no vendor account, no false confidence. The admin's own eyes fill
 * in SlipFacts when they approve.
 */
export class ManualSlipReader implements SlipReader {
  readonly name = "manual";
  readonly enabled = false;
  async read(): Promise<SlipFacts> {
    return {}; // no facts -> judgeSlip returns "review"
  }
}
