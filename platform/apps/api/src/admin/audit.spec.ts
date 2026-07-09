import { describe, it, expect } from "vitest";
import { isAdminPath } from "./audit.interceptor";

describe("isAdminPath — decides what lands in the audit trail", () => {
  it("matches every admin controller we have today", () => {
    const paths = [
      "/api/v1/admin/users/abc",
      "/api/v1/admin/templates/abc",
      "/api/v1/admin/settings/pricing",
      "/api/v1/admin/payouts",
      "/api/v1/admin/orders/abc/status",   // AdminOrdersController — lives outside AdminModule
      "/api/v1/admin/catalog/fabrics/abc", // AdminCatalogController — ditto
    ];
    for (const p of paths) expect(isAdminPath(p), p).toBe(true);
  });

  it("matches the bare /admin root", () => {
    expect(isAdminPath("/api/v1/admin")).toBe(true);
  });

  it("ignores customer routes", () => {
    for (const p of ["/api/v1/orders", "/api/v1/orders/abc/cancel", "/api/v1/auth/login", "/api/v1/templates/abc/buy"]) {
      expect(isAdminPath(p), p).toBe(false);
    }
  });

  it("is not fooled by a lookalike segment", () => {
    // the classic substring bug: "administrator" must not count as "admin"
    expect(isAdminPath("/api/v1/administrator/x")).toBe(false);
    expect(isAdminPath("/api/v1/badmin/x")).toBe(false);
    expect(isAdminPath("/api/v1/adminx")).toBe(false);
  });

  it("ignores a query string that mentions admin", () => {
    expect(isAdminPath("/api/v1/orders?q=admin")).toBe(false);
    expect(isAdminPath("/api/v1/admin/users?q=x")).toBe(true);
  });

  it("survives empty/undefined input", () => {
    expect(isAdminPath("")).toBe(false);
    expect(isAdminPath(undefined as any)).toBe(false);
  });
});
