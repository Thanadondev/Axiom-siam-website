import { describe, expect, it } from "vitest";
import { textShape } from "./text";

const box = (t: string) => textShape(t, "thai", {}, { x: 0, top: 0 }, 0)!.box;

describe("Thai text is laid out by the font's own rules", () => {
  it("a tone mark over an upper vowel is raised clear of it, not drawn inside it", () => {
    // drawn glyph by glyph, the mark of ที่ sat inside the vowel: no taller than ที
    for (const [plain, marked] of [["ที", "ที่"], ["พี", "พี่"], ["ญี", "ญี่"]]) {
      expect(box(marked).h).toBeGreaterThan(box(plain).h * 1.08);
    }
  });
  it("a letter's marks don't move the next letter", () => {
    expect(box("ที่นี่").w).toBeCloseTo(box("ทีนี").w, 0);
  });
});
