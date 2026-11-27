import { describe, it, expect } from "vitest";
import { isUnverified, waitMinutes } from "./verify-email";

describe("an order refused for an unconfirmed email", () => {
  it("is told apart by the API's code", () => {
    expect(isUnverified({ status: 403, body: { code: "email_unverified", message: "กรุณายืนยันอีเมลก่อนสั่งผลิต" } })).toBe(true);
    expect(isUnverified({ status: 403, body: { message: "Forbidden" } })).toBe(false);
    expect(isUnverified({ status: 400, body: { code: "address_missing" } })).toBe(false);
    expect(isUnverified(new Error("network"))).toBe(false);
    expect(isUnverified(null)).toBe(false);
    expect(isUnverified(undefined)).toBe(false);
  });
});

describe("the confirm link sent too often: minutes to wait", () => {
  const tooMany = (secs: number) => ({ status: 429, message: `พยายามหลายครั้งเกินไป กรุณารออีก ${secs} วินาที` });

  it("rounds the API's seconds up to whole minutes", () => {
    expect(waitMinutes(tooMany(3050))).toBe(51);
    expect(waitMinutes(tooMany(3600))).toBe(60);
    expect(waitMinutes(tooMany(61))).toBe(2);
    expect(waitMinutes(tooMany(60))).toBe(1);
  });

  it("never says 0 minutes while it's still refused", () => {
    expect(waitMinutes(tooMany(1))).toBe(1);
    expect(waitMinutes(tooMany(0))).toBe(1);
  });

  it("0 (the plain 'couldn't send') for anything else", () => {
    expect(waitMinutes({ status: 429, message: "Too Many Requests" })).toBe(0);
    expect(waitMinutes({ status: 500, message: "เกิดข้อผิดพลาด (500)" })).toBe(0);
    expect(waitMinutes(new Error("Failed to fetch"))).toBe(0);
    expect(waitMinutes(null)).toBe(0);
  });
});
