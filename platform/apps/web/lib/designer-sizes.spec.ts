import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIZES } from "./order-draft";

// the advanced designer's pieces (public/designer/sizes.js), as the browser loads them
const sizes: Record<string, any> = (() => {
  const src = readFileSync(join(__dirname, "../public/designer/sizes.js"), "utf8");
  return JSON.parse(src.slice(src.indexOf("{", src.indexOf("AXIOM_SIZES")), src.lastIndexOf("}") + 1));
})();
// the factory's bib template the print files are built on
const cb005 = JSON.parse(readFileSync(join(__dirname, "../../api/src/bibs/cb-005.json"), "utf8"));

describe("advanced designer sizes", () => {
  it("offers every size a bib is sold in, XXL (3L) included", () => {
    expect(Object.keys(sizes)).toEqual([...SIZES]);
  });

  it("draws each piece at the size of the CB-005 template (cm)", () => {
    for (const s of SIZES) for (const part of ["front", "back"] as const) {
      const p = cb005.sizes[s].A[part];
      const [w, h] = sizes[s].dims[part];
      expect(Math.abs(w - p.w / 10), `${s} ${part} width`).toBeLessThan(0.1);
      expect(Math.abs(h - p.h / 10), `${s} ${part} height`).toBeLessThan(0.1);
    }
  });

  it("XXL's trim comes as strokes along the cut line: the neck and both armholes, on both pieces", () => {
    for (const k of ["trimFront", "trimBack"]) {
      const t = sizes.XXL[k];
      expect(Array.isArray(t)).toBe(true);
      expect(t.map((x: any) => x.zone).sort()).toEqual(["arm", "arm", "neck"]);
      for (const x of t) { expect(x.d).toMatch(/^M /); expect(x.w).toBeGreaterThan(20); }
    }
  });
});
