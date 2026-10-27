import { describe, it, expect } from "vitest";
import { safePath } from "./next-path";

describe("safePath", () => {
  it("allows same-site paths", () => {
    expect(safePath("/shop/striker")).toBe("/shop/striker");
    expect(safePath("/order/new?design=1")).toBe("/order/new?design=1");
  });
  it("refuses anything that could leave the site", () => {
    for (const bad of ["//evil.com", "https://evil.com", "evil.com", "/\\evil.com", "", null, undefined]) {
      expect(safePath(bad as any)).toBeNull();
    }
  });
});
