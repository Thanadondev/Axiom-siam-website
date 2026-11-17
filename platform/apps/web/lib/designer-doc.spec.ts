import { describe, it, expect } from "vitest";
import { designerBib, designerDoc } from "./designer-doc";

describe("advanced designer documents", () => {
  it("reads N-bib / R-bib as the API does (pricing.ts fromDesigner)", () => {
    expect(designerBib({ app: "axiom-roster", style: 1, template: { style: 1 } })).toBe("bib_n");
    expect(designerBib({ app: "axiom-roster", style: 2 })).toBe("bib_r");
    expect(designerBib({ app: "axiom-roster", template: { style: 2 } })).toBe("bib_r");
    expect(designerBib({ app: "axiom-designer", style: 2 })).toBe("bib_r");
  });
  it("is nothing for a kit from the 3D studio, or no design", () => {
    expect(designerBib({ kind: "kit-studio", kit: "bib" })).toBeNull();
    expect(designerBib(null)).toBeNull();
    expect(designerDoc({ app: "axiom-roster", printId: "x" })?.printId).toBe("x");
  });
});
