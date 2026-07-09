import { describe, it, expect } from "vitest";
import { canTransition, requiresTracking, NEXT_STATUS, ORDER_FLOW, TERMINAL_STATUSES, STATUS_TH } from "./status";

describe("canTransition", () => {
  it("allows the happy path end to end", () => {
    for (let i = 0; i < ORDER_FLOW.length - 1; i++) {
      expect(canTransition(ORDER_FLOW[i], ORDER_FLOW[i + 1])).toBe(true);
    }
  });

  it("refuses to go backwards", () => {
    expect(canTransition("shipped", "pending")).toBe(false);
    expect(canTransition("delivered", "in_production")).toBe(false);
    expect(canTransition("paid", "pending")).toBe(false);
  });

  it("refuses to skip ahead", () => {
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("pending", "completed")).toBe(false);
  });

  it("allows cancelling only before it ships", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(true);
    expect(canTransition("in_production", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
  });

  it("allows refunds only after money changed hands", () => {
    expect(canTransition("pending", "refunded")).toBe(false);
    expect(canTransition("paid", "refunded")).toBe(true);
    expect(canTransition("approved", "refunded")).toBe(true);
  });

  it("treats terminal statuses as dead ends", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(NEXT_STATUS[s]).toEqual([]);
      expect(canTransition(s, "paid")).toBe(false);
    }
  });

  it("rejects unknown statuses instead of throwing", () => {
    expect(canTransition("banana", "paid")).toBe(false);
    expect(canTransition("pending", "banana")).toBe(false);
  });

  it("never allows a no-op transition to itself", () => {
    for (const s of Object.keys(NEXT_STATUS)) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

describe("requiresTracking", () => {
  it("demands a tracking number only when shipping", () => {
    expect(requiresTracking("shipped")).toBe(true);
    expect(requiresTracking("paid")).toBe(false);
    expect(requiresTracking("delivered")).toBe(false);
  });
});

describe("status labels", () => {
  it("has a Thai label for every status in the graph", () => {
    for (const s of Object.keys(NEXT_STATUS)) {
      expect(STATUS_TH[s], `missing label for ${s}`).toBeTruthy();
    }
  });

  it("every reachable target is itself a known status", () => {
    for (const [from, targets] of Object.entries(NEXT_STATUS)) {
      for (const t of targets) {
        expect(NEXT_STATUS[t], `${from} → ${t} leads nowhere`).toBeDefined();
      }
    }
  });
});
