import { describe, it, expect } from "vitest";
import { contrast, inkClashes } from "./ink-contrast";

describe("readable names and numbers", () => {
  it("measures contrast as WCAG does", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#2e3192", "#2e3192")).toBe(1);
  });

  it("flags a number the colour of the stripes it crosses (the A02 / A09 designs)", () => {
    expect(inkClashes({ body: "#ffffff", pattern: "stripes", patternColor: "#2e3192", ink: "#2e3192" })).toEqual(["pattern"]);
    expect(inkClashes({ body: "#ffffff", pattern: "rings", patternColor: "#ec008c", ink: "#ec008c" })).toEqual(["pattern"]);
  });

  it("flags a number the colour of the body", () => {
    expect(inkClashes({ body: "#231f20", pattern: "plain", ink: "#2e3192" })).toEqual(["body"]);
  });

  it("a keyline that stands out keeps it readable; a plain bib ignores the unused pattern colour", () => {
    expect(inkClashes({ body: "#ffffff", pattern: "stripes", patternColor: "#2e3192", ink: "#2e3192", inkOutline: "#ffffff" })).toEqual([]);
    expect(inkClashes({ body: "#ed1c24", pattern: "plain", patternColor: "#ffffff", ink: "#ffffff" })).toEqual([]);
    // white on a yellow-green: still enough to read? no — flagged
    expect(inkClashes({ body: "#fff200", pattern: "plain", ink: "#ffffff" })).toEqual(["body"]);
  });
});

describe("the shop's own starting colours", () => {
  it("never open on a warning", async () => {
    const { KITS } = await import("./kits");
    for (const k of KITS) {
      const c = k.defaults.colors;
      expect(inkClashes({ body: c.body, pattern: k.defaults.pattern, patternColor: c.stripe, ink: c.number }), k.id).toEqual([]);
    }
  });
});
