/**
 * The designer → checkout hand-off.
 *
 * When the user presses "🧵 สั่งผลิตเลย" in the designer, the iframe posts a
 * roster + spec to the React bridge, which stashes it in sessionStorage and
 * navigates to /order/new. This module owns the parsing/normalising of that
 * blob so the checkout page stays dumb — and so it can be unit-tested.
 */

export const SIZES = ["S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];

export const FABRICS = ["mesh", "B1", "C1"] as const;
export const TRIMS = ["none", "neck", "neckarm", "full"] as const;

export const DRAFT_KEY = "axiom-order-draft";

export interface RosterRow {
  playerName: string;
  number: string;
  size: Size;
}

export interface OrderDraft {
  fabric: string;
  trim: string;
  reversible: boolean;
  roster: RosterRow[];
  /** shirts per size, derived from the roster (1 player = 1 shirt) */
  qty: Record<Size, number>;
}

const isSize = (v: unknown): v is Size => (SIZES as readonly unknown[]).includes(v);

/** blank size / "xl" / junk all resolve to something orderable */
export function normaliseSize(raw: unknown, fallback: Size = "M"): Size {
  if (typeof raw !== "string") return fallback;
  const up = raw.trim().toUpperCase();
  return isSize(up) ? up : fallback;
}

export function emptyQty(): Record<Size, number> {
  return { S: 0, M: 0, L: 0, XL: 0 };
}

/** shirts per size from a roster — one shirt per named player */
export function qtyFromRoster(roster: RosterRow[]): Record<Size, number> {
  const q = emptyQty();
  for (const r of roster) q[r.size]++;
  return q;
}

/**
 * Parses whatever the designer stashed. Returns null when the draft is absent,
 * unparseable, or belongs to a *different* design — never throws, because a
 * bad draft must not block a manual order.
 */
export function parseOrderDraft(raw: string | null | undefined, designId: string): OrderDraft | null {
  if (!raw || !designId) return null;

  let d: any;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  if (d.designId !== designId) return null; // stale draft from another design

  const roster: RosterRow[] = (Array.isArray(d.roster) ? d.roster : [])
    .filter((r: any) => r && typeof r === "object")
    .map((r: any) => ({
      playerName: String(r.playerName ?? "").trim(),
      number: String(r.number ?? "").trim(),
      size: normaliseSize(r.size),
    }))
    // a row with neither a name nor a number is not a person
    .filter((r: RosterRow) => r.playerName !== "" || r.number !== "");

  const fabric = (FABRICS as readonly string[]).includes(d.fabric) ? d.fabric : "mesh";
  const trim = (TRIMS as readonly string[]).includes(d.trim) ? d.trim : "full";

  return {
    fabric,
    trim,
    reversible: !!d.reversible,
    roster,
    qty: qtyFromRoster(roster),
  };
}

/** the `lines` array the POST /orders endpoint expects */
export function linesFromQty(qty: Record<Size, number>) {
  return SIZES.filter(s => qty[s] > 0).map(s => ({ size: s, qty: qty[s] }));
}
