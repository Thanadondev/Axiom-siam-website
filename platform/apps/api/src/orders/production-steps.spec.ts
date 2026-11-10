import { describe, expect, it } from "vitest";
import { PRODUCTION_STEPS, SHIP_STEP, planStep, stepForStatus, stepName } from "./production-steps";

describe("production steps", () => {
  it("has the ten steps of the line, shipping last", () => {
    expect(PRODUCTION_STEPS).toHaveLength(10);
    expect(stepName(1)).toBe("ทำไฟล์");
    expect(stepName(SHIP_STEP)).toBe("จัดส่ง");
    expect(stepName(0)).toBe("");
  });

  it("the first step starts production for a paid or approved order", () => {
    expect(planStep("paid", 0, 1)).toEqual({ ok: true, status: "in_production", step: 1 });
    expect(planStep("approved", 0, 3)).toEqual({ ok: true, status: "in_production", step: 3 });
  });

  it("moves along the floor, and back when the factory corrects it", () => {
    expect(planStep("in_production", 4, 5)).toEqual({ ok: true, status: "in_production", step: 5 });
    expect(planStep("in_production", 6, 4)).toEqual({ ok: true, status: "in_production", step: 4 });
  });

  it("won't set shipping (that needs the tracking number) or a step out of range", () => {
    expect(planStep("in_production", 9, 10).ok).toBe(false);
    expect(planStep("in_production", 2, 0).ok).toBe(false);
    expect(planStep("in_production", 2, 2.5).ok).toBe(false);
  });

  it("won't start an unpaid, closed or shipped order, or repeat a step", () => {
    expect(planStep("pending", 0, 1)).toMatchObject({ ok: false, error: expect.stringContaining("ยังไม่ชำระ") });
    expect(planStep("cancelled", 0, 1).ok).toBe(false);
    expect(planStep("refunded", 3, 4).ok).toBe(false);
    expect(planStep("shipped", 10, 9).ok).toBe(false);
    expect(planStep("in_production", 4, 4)).toMatchObject({ ok: false, error: expect.stringContaining("อยู่แล้ว") });
  });

  it("status changes made elsewhere carry the step along", () => {
    expect(stepForStatus("in_production", 0)).toBe(1);
    expect(stepForStatus("in_production", 5)).toBe(5);
    expect(stepForStatus("shipped", 7)).toBe(SHIP_STEP);
    expect(stepForStatus("delivered", 10)).toBe(SHIP_STEP);
    expect(stepForStatus("approved", 0)).toBe(0);
  });
});
