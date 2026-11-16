import { describe, it, expect } from "vitest";
import { launchBlock, bibsOnly, designerBlock } from "./launch";
import { garmentOf, fromDesigner } from "./pricing";

describe("bibs-only launch", () => {
  it("takes bib orders: web-designed, the team's zip, the bib kit from the studio", () => {
    expect(launchBlock("bib_n", {})).toBeNull();
    expect(launchBlock("bib_r", {})).toBeNull();
    expect(launchBlock(garmentOf({ kind: "kit-studio", kit: "bib" }), {})).toBeNull();
    expect(launchBlock(garmentOf({ kind: "kit-studio", kit: "rim" }), {})).toBeNull(); // the old address of /shop/bib
  });
  it("the bib kit made reversible is an R-bib; reversible means nothing on another kit", () => {
    expect(garmentOf({ kind: "kit-studio", kit: "bib" })).toBe("bib_n");
    expect(garmentOf({ kind: "kit-studio", kit: "bib", reversible: true })).toBe("bib_r");
    expect(garmentOf({ kind: "kit-studio", kit: "bib", reversible: "yes" })).toBe("bib_n");
    expect(garmentOf({ kind: "kit-studio", kit: "warmup", reversible: true })).toBe("hoodie");
  });
  it("refuses everything else", () => {
    expect(launchBlock("jersey", {})).toMatch(/เฉพาะเอี๊ยม/);
    expect(launchBlock(garmentOf({ kind: "kit-studio", kit: "pacer" }), {})).toMatch(/เฉพาะเอี๊ยม/);
    expect(launchBlock(garmentOf({}), {})).toMatch(/เฉพาะเอี๊ยม/); // the advanced designer's jerseys
    expect(launchBlock("hoodie", {})).toMatch(/เฉพาะเอี๊ยม/);
  });
  it("the advanced designer draws on the bib pattern: N-bib or R-bib by its style, closed until everything opens", () => {
    const order = (style: number) => ({ app: "axiom-roster", version: 1, style, roster: [], template: { app: "axiom-designer", style } });
    expect(garmentOf(order(1))).toBe("bib_n");
    expect(garmentOf(order(2))).toBe("bib_r");
    expect(garmentOf({ app: "axiom-designer", style: 2 })).toBe("bib_r"); // a saved design, not an order
    expect(garmentOf({ app: "axiom-roster", template: { style: 2 } })).toBe("bib_r");
    expect(fromDesigner({ kind: "kit-studio", kit: "bib" })).toBeNull();
    expect(designerBlock(true, {})).toMatch(/ยังไม่เปิดสั่งผลิต/);
    expect(designerBlock(false, {})).toBeNull();
    expect(designerBlock(true, { OPEN_ALL: "1" })).toBeNull();
  });
  it("opens every product with OPEN_ALL=1 or the web's NEXT_PUBLIC_OPEN_ALL=1", () => {
    expect(bibsOnly({})).toBe(true);
    expect(launchBlock("jersey", { OPEN_ALL: "1" })).toBeNull();
    expect(launchBlock("jersey", { NEXT_PUBLIC_OPEN_ALL: "1" })).toBeNull();
  });
});
