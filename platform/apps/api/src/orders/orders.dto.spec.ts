import { describe, it, expect } from "vitest";
import { CreateOrderSchema, PriceQuerySchema, UpdateOrderStatusSchema } from "./orders.dto";

const uuid = "11111111-2222-4333-8444-555555555555";
const valid = {
  fabric: "mesh",
  trim: "full",
  lines: [{ size: "L", qty: 10 }],
  shippingAddressId: uuid,
};

describe("CreateOrderSchema", () => {
  it("accepts a minimal valid order", () => {
    expect(CreateOrderSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown fabric", () => {
    expect(CreateOrderSchema.safeParse({ ...valid, fabric: "silk" }).success).toBe(false);
  });

  it("rejects an unknown trim level", () => {
    expect(CreateOrderSchema.safeParse({ ...valid, trim: "half" }).success).toBe(false);
  });

  it("rejects an unknown size", () => {
    expect(CreateOrderSchema.safeParse({ ...valid, lines: [{ size: "XXXL", qty: 1 }] }).success).toBe(false);
  });

  it("rejects an empty size breakdown", () => {
    expect(CreateOrderSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    expect(CreateOrderSchema.safeParse({ ...valid, lines: [{ size: "L", qty: -1 }] }).success).toBe(false);
  });

  it("coerces a numeric string quantity", () => {
    const r = CreateOrderSchema.safeParse({ ...valid, lines: [{ size: "L", qty: "12" }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lines[0].qty).toBe(12);
  });

  it("requires a real uuid for the shipping address", () => {
    expect(CreateOrderSchema.safeParse({ ...valid, shippingAddressId: "not-a-uuid" }).success).toBe(false);
    expect(CreateOrderSchema.safeParse({ ...valid, shippingAddressId: undefined }).success).toBe(false);
  });

  it("accepts an optional roster and defaults qty to 1", () => {
    const r = CreateOrderSchema.safeParse({
      ...valid,
      roster: [{ playerName: "สมชาย", number: "10", size: "L" }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.roster![0].qty).toBe(1);
  });

  it("caps the roster length", () => {
    const roster = Array.from({ length: 501 }, () => ({ size: "M" as const, qty: 1 }));
    expect(CreateOrderSchema.safeParse({ ...valid, roster }).success).toBe(false);
  });

  it("turns an empty note into undefined rather than an empty string", () => {
    const r = CreateOrderSchema.safeParse({ ...valid, note: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.note).toBeUndefined();
  });
});

describe("PriceQuerySchema", () => {
  it("coerces query-string numbers and booleans", () => {
    const r = PriceQuerySchema.safeParse({ totalQty: "50", fabric: "B1", trim: "neck", reversible: "true" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.totalQty).toBe(50);
      expect(r.data.reversible).toBe(true);
    }
  });

  it("treats any non-'true' string as false", () => {
    const r = PriceQuerySchema.safeParse({ totalQty: "1", fabric: "mesh", trim: "none", reversible: "false" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reversible).toBe(false);
  });

  it("rejects a negative quantity", () => {
    expect(PriceQuerySchema.safeParse({ totalQty: "-1", fabric: "mesh", trim: "none" }).success).toBe(false);
  });
});

describe("UpdateOrderStatusSchema", () => {
  it("accepts a known status", () => {
    expect(UpdateOrderStatusSchema.safeParse({ status: "in_production" }).success).toBe(true);
  });

  it("rejects an invented status", () => {
    expect(UpdateOrderStatusSchema.safeParse({ status: "lost_in_post" }).success).toBe(false);
  });

  it("carries courier + tracking through for shipping", () => {
    const r = UpdateOrderStatusSchema.safeParse({ status: "shipped", courier: "Flash", trackingNo: "TH123" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.trackingNo).toBe("TH123");
  });

  it("normalises an empty tracking number to undefined so the service can reject it", () => {
    const r = UpdateOrderStatusSchema.safeParse({ status: "shipped", trackingNo: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.trackingNo).toBeUndefined();
  });
});
