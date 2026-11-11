import { describe, expect, it } from "vitest";
import { kitLook } from "./kit-look";

describe("kitLook", () => {
  it("keeps the storefront kit fields", () => {
    const l = kitLook({ kind: "kit-studio", v: 1, kit: "striker", colors: { body: "#0054a6", trim: "#fff" }, pattern: "diagonal", number: "10", name: "SOMCHAI", roster: [{ a: 1 }] });
    expect(l).toEqual({ kit: "striker", colors: { body: "#0054a6" }, pattern: "diagonal", number: "10", name: "SOMCHAI", font: undefined, fabric: undefined, trim: undefined });
  });
  it("ignores designs from the full designer and junk", () => {
    expect(kitLook({ objects: [] })).toBeNull();
    expect(kitLook(null)).toBeNull();
    expect(kitLook("x")).toBeNull();
    expect(kitLook({ kind: "kit-studio", kit: 3 })).toBeNull();
  });
  it("caps long strings", () => {
    expect(kitLook({ kind: "kit-studio", kit: "bib", number: "123456" })?.number).toBe("1234");
  });
});
