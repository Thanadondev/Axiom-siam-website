/** the API refused an order because the account's email isn't confirmed yet */
export const isUnverified = (e: unknown) => (e as { body?: { code?: string } })?.body?.code === "email_unverified";

/**
 * The confirm link was asked for too often (3 an hour): about how many minutes until it can be
 * asked for again, read from the API's "… กรุณารออีก 3050 วินาที". 0 when it's some other error.
 */
export function waitMinutes(e: unknown): number {
  const err = e as { status?: number; message?: string } | null;
  if (err?.status !== 429) return 0;
  const secs = Number(/(\d+)/.exec(String(err.message))?.[1]);
  return Number.isFinite(secs) ? Math.max(1, Math.ceil(secs / 60)) : 0;
}
