import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KITS, QUICK_SWATCHES, kitById, restoreConfig, defaultConfig, parseRoster, cleanName, cleanNumber, trimEdges, kitFabrics, kitTrims, kitParts, isBottom } from "./kits";
import { FABRICS, SIZES } from "./order-draft";
import { TRIMS } from "./garment-options";

// the factory's printable colours, as the designer loads them
const palette: string[] = (() => {
  const src = readFileSync(join(__dirname, "../public/designer/palette.js"), "utf8");
  return JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1)).map((s: { c: string }) => s.c.toLowerCase());
})();
const printable = (hex: string) => hex === "#ffffff" || palette.includes(hex.toLowerCase());

describe("kit catalogue", () => {
  it("has unique, url-safe ids", () => {
    const ids = KITS.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("only offers fabrics and trims the order system can price", () => {
    for (const k of KITS) {
      expect(FABRICS).toContain(k.defaults.fabric);
      expect(TRIMS.map(t => t.id)).toContain(k.defaults.trim);
    }
  });

  it("uses colours from the factory chart (white = unprinted fabric)", () => {
    for (const k of KITS) for (const hex of Object.values(k.defaults.colors)) expect(printable(hex), `${k.id} ${hex}`).toBe(true);
    for (const s of QUICK_SWATCHES) expect(printable(s.hex), s.hex).toBe(true);
  });

  it("finds kits case-insensitively and rejects unknown ids", () => {
    expect(kitById("STRIKER")?.code).toBe("FB-01");
    expect(kitById("nope")).toBeUndefined();
    expect(kitById(null)).toBeUndefined();
  });
});

describe("restoreConfig", () => {
  const kit = KITS[0];

  it("falls back to defaults for missing or broken data", () => {
    for (const junk of [null, undefined, "x", 3, []]) expect(restoreConfig(kit, junk)).toEqual(defaultConfig(kit));
  });

  it("keeps good fields and drops bad ones one by one", () => {
    const c = restoreConfig(kit, {
      colors: { body: "#ED1C24", sleeve: "red", trim: 5 },
      pattern: "hoops", font: "comic", fabric: "silk", trim: "full",
      name: "  somchai   jaidee ", number: "1a23",
    });
    expect(c.colors.body).toBe("#ed1c24");
    expect(c.colors.sleeve).toBe(kit.defaults.colors.sleeve);
    expect(c.colors.trim).toBe(kit.defaults.colors.trim);
    expect(c.pattern).toBe("hoops");
    expect(c.font).toBe("block");
    expect(c.fabric).toBe(kit.defaults.fabric);
    expect(c.trim).toBe("full");
    expect(c.name).toBe("SOMCHAI JAIDEE"); // 14-character cap cuts the trailing space
    expect(c.number).toBe("12");
  });
});

describe("name / number cleaning", () => {
  it("caps names at 14 characters in capitals", () => {
    expect(cleanName("abcdefghijklmnopq")).toBe("ABCDEFGHIJKLMN");
  });
  it("drops a leading space but lets one trail while typing", () => {
    expect(cleanName("  ab  ")).toBe("AB ");
  });
  it("keeps leading zeros, two digits max", () => {
    expect(cleanNumber("007")).toBe("00");
    expect(cleanNumber("07")).toBe("07");
    expect(cleanNumber("#9")).toBe("9");
  });
});

describe("trimEdges", () => {
  it("matches the four production trim levels", () => {
    expect(trimEdges("none")).toEqual({ neck: false, arm: false, hem: false });
    expect(trimEdges("neck")).toEqual({ neck: true, arm: false, hem: false });
    expect(trimEdges("neckarm")).toEqual({ neck: true, arm: true, hem: false });
    expect(trimEdges("full")).toEqual({ neck: true, arm: true, hem: true });
  });
});

describe("parseRoster", () => {
  it("reads rows pasted from Excel (tabs) and typed with commas", () => {
    expect(parseRoster("สมชาย\t10\tL\nsomying, 7, m")).toEqual([
      { playerName: "สมชาย", number: "10", size: "L" },
      { playerName: "SOMYING", number: "7", size: "M" },
    ]);
  });

  it("skips a header row, blank lines and empty players", () => {
    expect(parseRoster("ชื่อ\tเบอร์\tไซซ์\n\n \t \t\nA\t1\tXL")).toEqual([{ playerName: "A", number: "1", size: "XL" }]);
  });

  it("sends unknown sizes to M so the order can still be priced", () => {
    expect(parseRoster("A,1,XXL")[0].size).toBe("M");
    expect(SIZES).toContain(parseRoster("A,1,xl")[0].size);
  });

  it("keeps a number-only player (unnamed shirt)", () => {
    expect(parseRoster("\t23\tS")).toEqual([{ playerName: "", number: "23", size: "S" }]);
  });
});

describe("garments", () => {
  const hoodie = kitById("warmup")!;
  const shorts = kitById("stride")!;

  it("offers only the fabrics and trims a garment is made with", () => {
    expect(kitFabrics(hoodie)).toEqual(["C1", "B1"]);
    expect(kitFabrics(shorts)).toEqual([...FABRICS]);
    expect(kitTrims(shorts).map(t => t.id)).toEqual(["none", "neck", "full"]);
    for (const k of KITS) {
      expect(kitFabrics(k)).toContain(k.defaults.fabric);
      expect(kitTrims(k).map(t => t.id)).toContain(k.defaults.trim);
    }
  });

  it("drops a saved fabric or trim the garment doesn't come in", () => {
    const c = restoreConfig(hoodie, { fabric: "mesh" });
    expect(c.fabric).toBe("C1");
    expect(restoreConfig(shorts, { trim: "neckarm" }).trim).toBe(shorts.defaults.trim);
  });

  it("names the parts in the garment's own words, with no sleeves on shorts", () => {
    const parts = kitParts(shorts);
    expect(parts.map(p => p.id)).not.toContain("sleeve");
    expect(parts.find(p => p.id === "body")?.label).toBe("ตัวกางเกง");
    expect(kitParts(hoodie).map(p => p.id)).toContain("sleeve");
  });
});

describe("the warm-up suit", () => {
  const crew = kitById("tempo")!;
  const zip = kitById("tempozip")!;
  const pants = kitById("track")!;

  it("has a crew-neck top, a full-zip top and track pants", () => {
    expect(crew.garment).toBe("piste");
    expect(crew.cut).toMatchObject({ sleeves: "long", neck: "crew" });
    expect(zip.garment).toBe("piste_zip");
    expect(zip.cut).toMatchObject({ sleeves: "long", neck: "zip" });
    expect(pants.garment).toBe("pants");
    expect(pants.cut.sleeves).toBe("none");
  });

  it("treats shorts and track pants as bottoms, and nothing else", () => {
    expect(KITS.filter(isBottom).map(k => k.id).sort()).toEqual(["stride", "track"]);
  });

  it("names the parts for each piece", () => {
    expect(kitParts(pants).map(p => p.id)).not.toContain("sleeve");
    expect(kitParts(pants).find(p => p.id === "trim")?.hint).toContain("ปลายขา");
    expect(kitParts(crew).find(p => p.id === "sleeve")?.hint).toContain("รากลัน");
    expect(kitParts(zip).find(p => p.id === "trim")?.label).toContain("คอตั้ง");
  });
});
