import { describe, it, expect, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { BibsController } from "./bibs.controller";

const kit = {
  kind: "kit-studio", kit: "bib", pattern: "chest", font: "block", trim: "full", name: "SORA", number: "23", logo: "axiom",
  colors: { body: "#ed1c24", trim: "#ffd200", stripe: "#ffd200", number: "#ffffff" },
};

describe("order sheet for the 3D studio's flat view", () => {
  it("draws a studio design as its orders print: its names, or the kit's own name and number in M", async () => {
    const sheet = vi.fn().mockResolvedValue({ svg: "<svg/>", size: "M", sizes: ["M"] });
    const c = new BibsController({ sheet } as any);
    await c.sheet({ kit });
    const [design, logoUrl] = sheet.mock.calls[0];
    expect(design.product).toBe("bib_n");
    expect(design.roster).toEqual([{ name: "SORA", number: "23", size: "M" }]);
    expect(design.sides[0]).toMatchObject({ body: "#ed1c24", pattern: "chest", patternColor: "#ffd200", ink: "#ffffff" });
    expect(logoUrl).toBeUndefined();

    await c.sheet({ kit: { ...kit, reversible: true }, rows: [{ name: "KAI", number: "7", size: "L" }], size: "L" });
    expect(sheet.mock.calls[1][0].product).toBe("bib_r");
    expect(sheet.mock.calls[1][0].roster).toEqual([{ name: "KAI", number: "7", size: "L" }]);
    expect(sheet.mock.calls[1][2]).toBe("L");
  });

  it("a kit that isn't cut on the bib has no flat view", async () => {
    const c = new BibsController({ sheet: vi.fn() } as any);
    expect(() => c.sheet({ kit: { ...kit, kit: "polo" } })).toThrow(BadRequestException);
  });
});
