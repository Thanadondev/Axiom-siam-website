import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  SIZES, TRIMS, normalizeTrim, variantFromState, variantQuery,
  DEFAULT_BODY_COLOR, DEFAULT_TRIM_COLOR,
} from "./garment-options";

/** the editor is plain HTML/JS, so read it and check the real <select> values */
const editorHtml = readFileSync(resolve(__dirname, "../public/designer/index.html"), "utf8").replace(/\0/g, "");

function optionValues(selectId: string): string[] {
  const block = new RegExp(`id="${selectId}"[^>]*>([\\s\\S]*?)</select>`).exec(editorHtml);
  if (!block) throw new Error(`#${selectId} not found in the editor`);
  const out: string[] = [];
  // <option value="x">label</option>  or  <option>X</option> (value = text)
  const re = /<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1]))) out.push((m[1] ?? m[2]).trim());
  return out;
}

describe("contract with the designer iframe", () => {
  it("every trim id we send exists in the editor's #trimSel", () => {
    const editorTrims = optionValues("trimSel");
    for (const t of TRIMS) expect(editorTrims, `trim "${t.id}" is not an editor option`).toContain(t.id);
  });

  it("offers every trim level the editor supports — no silently missing option", () => {
    const editorTrims = optionValues("trimSel");
    const ours = TRIMS.map(t => t.id);
    for (const e of editorTrims) expect(ours, `editor has trim "${e}" but the marketplace hides it`).toContain(e);
  });

  it("every size we send exists in the editor's #sizeSel", () => {
    const editorSizes = optionValues("sizeSel");
    for (const s of SIZES) expect(editorSizes, `size "${s}" is not an editor option`).toContain(s);
  });

  it("offers every size the editor supports", () => {
    const editorSizes = optionValues("sizeSel");
    for (const e of editorSizes) expect(SIZES as readonly string[], `editor has size "${e}" but the marketplace hides it`).toContain(e);
  });

  it("catches the underscore bug that shipped once (neck_arm vs neckarm)", () => {
    expect(TRIMS.map(t => t.id)).toContain("neckarm");
    expect(TRIMS.map(t => t.id)).not.toContain("neck_arm");
  });
});

describe("normalizeTrim", () => {
  it("upgrades the legacy boolean shape", () => {
    // docs saved before the 4-level trim stored true/false
    expect(normalizeTrim(true)).toBe("full");
    expect(normalizeTrim(false)).toBe("none");
  });

  it("passes a valid id through", () => {
    expect(normalizeTrim("neck")).toBe("neck");
    expect(normalizeTrim("neckarm")).toBe("neckarm");
  });

  it("falls back rather than sending the editor a value it can't use", () => {
    expect(normalizeTrim("neck_arm")).toBe("full");
    expect(normalizeTrim(undefined)).toBe("full");
    expect(normalizeTrim(null)).toBe("full");
    expect(normalizeTrim(42)).toBe("full");
  });
});

describe("variantFromState", () => {
  it("reads a saved colourway", () => {
    expect(variantFromState({ bodyColor: "#ff0000", trimColor: "#000000", size: "L", trim: "neck" }))
      .toEqual({ bodyColor: "#ff0000", trimColor: "#000000", size: "L", trim: "neck" });
  });

  it("fills gaps with the editor's own defaults", () => {
    expect(variantFromState({})).toEqual({
      bodyColor: DEFAULT_BODY_COLOR, trimColor: DEFAULT_TRIM_COLOR, size: "M", trim: "full",
    });
    expect(variantFromState(null).size).toBe("M");
  });

  it("normalizes a legacy boolean trim on the way out", () => {
    expect(variantFromState({ trim: false }).trim).toBe("none");
  });
});

describe("variantQuery", () => {
  it("round-trips through URLSearchParams", () => {
    const q = variantQuery({ bodyColor: "#ec008c", trimColor: "#231f20", size: "XL", trim: "neck" });
    const p = new URLSearchParams(q.slice(1));
    expect(p.get("body")).toBe("#ec008c");
    expect(p.get("trim")).toBe("#231f20");
    expect(p.get("size")).toBe("XL");
    expect(p.get("trimLevel")).toBe("neck");
  });

  it("escapes the # so it isn't read as a URL fragment", () => {
    // "&body=#fff" would truncate the query at the hash — this is the bug
    // that silently drops every colour
    expect(variantQuery({ bodyColor: "#fff000", trimColor: "#fff", size: "M", trim: "full" })).toContain("%23");
    expect(variantQuery({ bodyColor: "#fff000", trimColor: "#fff", size: "M", trim: "full" })).not.toContain("=#");
  });

  it("returns nothing when there is no variant", () => {
    expect(variantQuery(null)).toBe("");
    expect(variantQuery(undefined)).toBe("");
  });
});
