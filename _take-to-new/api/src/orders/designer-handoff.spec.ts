import { describe, it, expect } from "vitest";
import { CreateOrderSchema } from "./orders.dto";
import { priceOrder, DEFAULT_PRICING } from "./pricing";

/**
 * Contract test for the designer → checkout → API path.
 *
 * The designer (editor.js) builds a roster; the checkout page turns it into a
 * POST /orders body. If either side drifts, this fails. It exercises the SAME
 * normalisation rules the web `lib/order-draft.ts` applies, so the two stay
 * in lockstep without importing across workspaces.
 */

const SIZES = ["S", "M", "L", "XL"] as const;
const ADDRESS_ID = "11111111-2222-4333-8444-555555555555";
const DESIGN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** mirrors lib/order-draft.ts */
const normaliseSize = (s: unknown) => {
  const up = typeof s === "string" ? s.trim().toUpperCase() : "";
  return (SIZES as readonly string[]).includes(up) ? up : "M";
};

/** what editor.js posts */
const designerRoster = [
  { playerName: "สมชาย", number: "10", size: "L" },
  { playerName: "สมหญิง", number: "7", size: "M" },
  { playerName: "อาทิตย์", number: "23", size: "XL" },
  { playerName: "ก้อง", number: "5", size: "L" },
  { playerName: "ไม่ระบุไซส์", number: "99", size: "" }, // → M
];

/** what the checkout page builds from it */
function buildOrderBody(roster: typeof designerRoster, spec: { fabric: string; trim: string; reversible: boolean }) {
  const rows = roster.map(r => ({ ...r, size: normaliseSize(r.size), qty: 1 }));
  const counts: Record<string, number> = { S: 0, M: 0, L: 0, XL: 0 };
  for (const r of rows) counts[r.size]++;
  return {
    designId: DESIGN_ID,
    fabric: spec.fabric,
    trim: spec.trim,
    reversible: spec.reversible,
    lines: SIZES.filter(s => counts[s] > 0).map(s => ({ size: s, qty: counts[s] })),
    roster: rows,
    shippingAddressId: ADDRESS_ID,
  };
}

describe("designer → API contract", () => {
  const body = buildOrderBody(designerRoster, { fabric: "B1", trim: "neck", reversible: false });

  it("the checkout body passes the API's validation", () => {
    const r = CreateOrderSchema.safeParse(body);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it("every shirt in the roster is paid for — lines total === roster size", () => {
    const lineTotal = body.lines.reduce((s, l) => s + l.qty, 0);
    expect(lineTotal).toBe(designerRoster.length);
  });

  it("the blank-size player is billed as M, not dropped", () => {
    const m = body.lines.find(l => l.size === "M")!;
    expect(m.qty).toBe(2); // สมหญิง + ไม่ระบุไซส์
  });

  it("duplicate sizes are merged into one line", () => {
    expect(body.lines.filter(l => l.size === "L")).toHaveLength(1);
    expect(body.lines.find(l => l.size === "L")!.qty).toBe(2);
  });

  it("prices the resulting order at the 1–49 tier", () => {
    const totalQty = body.lines.reduce((s, l) => s + l.qty, 0);
    const p = priceOrder({ totalQty, fabric: body.fabric, trim: body.trim }, DEFAULT_PRICING);
    expect(totalQty).toBe(5);
    expect(p.tierPrice).toBe(300);
    expect(p.unitPrice).toBe(330); // 300 + B1(20) + neck(10)
    expect(p.subtotal).toBe(1650);
    expect(p.shippingFee).toBe(80); // under the ฿3,500 free-shipping line
    expect(p.total).toBe(1730);
  });

  it("a reversible (style-2) design carries its surcharge through", () => {
    const rev = buildOrderBody(designerRoster, { fabric: "mesh", trim: "full", reversible: true });
    expect(CreateOrderSchema.safeParse(rev).success).toBe(true);
    const p = priceOrder({ totalQty: 5, fabric: "mesh", trim: "full", reversible: true }, DEFAULT_PRICING);
    expect(p.unitPrice).toBe(390); // 300 + mesh(0) + full(30) + reversible(60)
  });

  it("a 60-player roster crosses into the ฿295 tier and ships free", () => {
    const big = Array.from({ length: 60 }, (_, i) => ({
      playerName: `ผู้เล่น ${i + 1}`, number: String(i + 1), size: SIZES[i % 4],
    }));
    const b = buildOrderBody(big as any, { fabric: "mesh", trim: "none", reversible: false });
    expect(CreateOrderSchema.safeParse(b).success).toBe(true);

    const totalQty = b.lines.reduce((s, l) => s + l.qty, 0);
    const p = priceOrder({ totalQty, fabric: "mesh", trim: "none" }, DEFAULT_PRICING);
    expect(totalQty).toBe(60);
    expect(p.tierPrice).toBe(295);
    expect(p.subtotal).toBe(17_700);
    expect(p.shippingFee).toBe(0);
  });

  it("rejects a body whose roster size the designer failed to normalise", () => {
    const bad = { ...body, roster: [{ playerName: "ก", number: "1", size: "XXL", qty: 1 }] };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an order with no size lines at all", () => {
    expect(CreateOrderSchema.safeParse({ ...body, lines: [] }).success).toBe(false);
  });

  it("rejects an order with no shipping address", () => {
    const { shippingAddressId, ...noAddr } = body;
    expect(CreateOrderSchema.safeParse(noAddr).success).toBe(false);
  });

  it("an order placed without a design (blank order) still validates", () => {
    const { designId, ...noDesign } = body;
    expect(CreateOrderSchema.safeParse(noDesign).success).toBe(true);
  });
});
