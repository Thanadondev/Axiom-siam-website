import { describe, it, expect } from "vitest";
import { isOpen } from "./launch";

describe("bibs-only launch", () => {
  it("keeps the bib pages and everything around an order open", () => {
    for (const p of ["/", "/order/bib", "/order/upload", "/shop/bib", "/shop/rim", "/checkout?design=x",
      "/orders/abc/invoice", "/account", "/login?next=/account", "/auth/magic", "/tracking", "/admin/production", "/coming-soon"]) {
      expect(isOpen(p), p).toBe(true);
    }
  });
  it("opens the rack of kits only on the bib kit", () => {
    expect(isOpen("/shop")).toBe(true);
    expect(isOpen("/shop?kit=bib")).toBe(true);
    expect(isOpen("/shop?kit=pacer")).toBe(false);
    expect(isOpen("/shop/pacer")).toBe(false);
  });
  it("closes the other products", () => {
    for (const p of ["/design", "/design?kit=bib", "/templates", "/templates/123", "/designers/1", "/showcase", "/order/new"]) {
      expect(isOpen(p), p).toBe(false);
    }
  });
  it("doesn't open a page that only starts with an open one's name", () => {
    expect(isOpen("/order/bibs-old")).toBe(false);
    expect(isOpen("/shop/bibx")).toBe(false);
  });
});
