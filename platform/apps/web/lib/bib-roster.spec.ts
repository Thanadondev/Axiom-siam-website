import { describe, it, expect } from "vitest";
import { readRoster, readSize, numberedLines, countBySize, logoDpi } from "./bib-roster";

describe("bib name list", () => {
  it("reads name, number and size in any order, from Excel or typed", () => {
    const r = readRoster("Name\tNo\tSize\nTAICHI\t48\tM\n10, SORA, L\nXL 7 KAITO TANAKA\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { name: "TAICHI", number: "48", size: "M" },
      { name: "SORA", number: "10", size: "L" },
      { name: "KAITO TANAKA", number: "7", size: "XL" },
    ]);
  });

  it("knows the sizes as teams write them", () => {
    expect(readSize("2L")).toBe("XL");
    expect(readSize("XL-2L")).toBe("XL");
    expect(readSize("3L")).toBe("XXL");
    expect(readSize("ＸＬ")).toBe("XL"); // full-width
    expect(readSize("Special L")).toBe("SPL");
    expect(readSize("Ｍサイズ")).toBe("M");
    expect(readSize("XS")).toBeNull();
    expect(readRoster("鈴木\t１０\tSpecial M").rows).toEqual([{ name: "鈴木", number: "10", size: "SPM" }]);
    expect(readRoster("No.05 SP L").rows).toEqual([{ name: "", number: "5", size: "SPL" }]);
  });

  it("says which lines it couldn't read", () => {
    const r = readRoster("TAICHI\t48\nSORA\t10\tXS\nA VERY VERY LONG NAME INDEED\t1\tM\nOK\t1\tM");
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map(e => [e.line, e.why])).toEqual([[1, "size"], [2, "size"], [3, "name"]]);
  });

  it("numbers a run of bibs with no names", () => {
    const text = numberedLines("M", 3, 8);
    expect(text).toBe("8\tM\n9\tM\n10\tM");
    expect(countBySize(readRoster(text).rows)).toEqual({ M: 3 });
  });
});

describe("how sharp the logo prints", () => {
  it("at the largest size on the list, 85 mm tall on M and scaled with the piece", () => {
    expect(logoDpi(1000, 1000, ["M"])).toEqual({ dpi: 299, mm: 85, size: "M" });
    expect(logoDpi(1000, 1000, ["M", "XXL"]).size).toBe("XXL-3L");
    expect(logoDpi(1000, 1000, ["M", "XXL"]).dpi).toBe(203);
    // a wide logo is held to 110 mm across, so it prints lower and sharper
    expect(logoDpi(3000, 1000, ["M"])).toEqual({ dpi: 693, mm: 37, size: "M" });
    // the test logo cut from an order sheet: blurry
    expect(logoDpi(77, 80, ["M"]).dpi).toBeLessThan(30);
  });
});
