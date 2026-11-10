import { describe, it, expect } from "vitest";
import { parseOrderDraft, qtyFromRoster, qtyFromRaw, linesFromQty, normaliseSize, emptyQty, DRAFT_KEY } from "./order-draft";

const DESIGN_ID = "11111111-2222-4333-8444-555555555555";

/** exactly what editor.js posts for `payload` on "🧵 สั่งผลิตเลย" */
const designerDraft = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    designId: DESIGN_ID,
    fabric: "B1",
    trim: "neck",
    reversible: false,
    roster: [
      { playerName: "สมชาย", number: "10", size: "L" },
      { playerName: "สมหญิง", number: "7", size: "M" },
      { playerName: "อาทิตย์", number: "23", size: "XL" },
    ],
    ...over,
  });

describe("parseOrderDraft — the happy hand-off", () => {
  it("reads the roster the designer sent", () => {
    const d = parseOrderDraft(designerDraft(), DESIGN_ID)!;
    expect(d.roster).toHaveLength(3);
    expect(d.roster[0]).toEqual({ playerName: "สมชาย", number: "10", size: "L" });
  });

  it("carries the spec across", () => {
    const d = parseOrderDraft(designerDraft(), DESIGN_ID)!;
    expect(d.fabric).toBe("B1");
    expect(d.trim).toBe("neck");
    expect(d.reversible).toBe(false);
  });

  it("derives the size breakdown — one shirt per player", () => {
    const d = parseOrderDraft(designerDraft(), DESIGN_ID)!;
    expect(d.qty).toEqual({ S: 0, M: 1, L: 1, XL: 1 });
  });

  it("marks a style-2 design as reversible", () => {
    const d = parseOrderDraft(designerDraft({ reversible: true }), DESIGN_ID)!;
    expect(d.reversible).toBe(true);
  });
});

describe("parseOrderDraft — refuses bad input instead of exploding", () => {
  it("returns null with no draft", () => {
    expect(parseOrderDraft(null, DESIGN_ID)).toBeNull();
    expect(parseOrderDraft(undefined, DESIGN_ID)).toBeNull();
    expect(parseOrderDraft("", DESIGN_ID)).toBeNull();
  });

  it("returns null on unparseable JSON rather than throwing", () => {
    expect(parseOrderDraft("{not json", DESIGN_ID)).toBeNull();
    expect(parseOrderDraft("null", DESIGN_ID)).toBeNull();
    expect(parseOrderDraft('"a string"', DESIGN_ID)).toBeNull();
  });

  it("ignores a draft left over from a DIFFERENT design", () => {
    // the classic stale-sessionStorage bug: order design A, go back, order design B
    expect(parseOrderDraft(designerDraft(), "99999999-9999-4999-8999-999999999999")).toBeNull();
  });

  it("ignores a draft when no design is being ordered", () => {
    expect(parseOrderDraft(designerDraft(), "")).toBeNull();
  });

  it("survives a missing roster", () => {
    const d = parseOrderDraft(designerDraft({ roster: undefined }), DESIGN_ID)!;
    expect(d.roster).toEqual([]);
    expect(d.qty).toEqual(emptyQty());
  });

  it("survives a roster that is not an array", () => {
    const d = parseOrderDraft(designerDraft({ roster: "สมชาย" }), DESIGN_ID)!;
    expect(d.roster).toEqual([]);
  });

  it("drops null/garbage roster rows", () => {
    const d = parseOrderDraft(designerDraft({ roster: [null, 5, { playerName: "ก" }] }), DESIGN_ID)!;
    expect(d.roster).toHaveLength(1);
    expect(d.roster[0].playerName).toBe("ก");
  });
});

describe("parseOrderDraft — normalisation", () => {
  it("sends a blank size to M so the order is still placeable", () => {
    const d = parseOrderDraft(designerDraft({ roster: [{ playerName: "ก", number: "1", size: "" }] }), DESIGN_ID)!;
    expect(d.roster[0].size).toBe("M");
    expect(d.qty.M).toBe(1);
  });

  it("uppercases a lowercase size typed in Excel", () => {
    const d = parseOrderDraft(designerDraft({ roster: [{ playerName: "ก", number: "1", size: " xl " }] }), DESIGN_ID)!;
    expect(d.roster[0].size).toBe("XL");
  });

  it("sends an unsupported size (XXL) to M rather than to the API", () => {
    const d = parseOrderDraft(designerDraft({ roster: [{ playerName: "ก", number: "1", size: "XXL" }] }), DESIGN_ID)!;
    expect(d.roster[0].size).toBe("M");
  });

  it("coerces a numeric jersey number to a string", () => {
    const d = parseOrderDraft(designerDraft({ roster: [{ playerName: "ก", number: 10, size: "L" }] }), DESIGN_ID)!;
    expect(d.roster[0].number).toBe("10");
  });

  it("drops a row with neither name nor number", () => {
    const d = parseOrderDraft(designerDraft({ roster: [{ playerName: "  ", number: "", size: "L" }] }), DESIGN_ID)!;
    expect(d.roster).toEqual([]);
  });

  it("keeps a number-only player (no name on the back)", () => {
    const d = parseOrderDraft(designerDraft({ roster: [{ number: "9", size: "S" }] }), DESIGN_ID)!;
    expect(d.roster).toHaveLength(1);
    expect(d.qty.S).toBe(1);
  });

  it("falls back to safe defaults for an unknown fabric/trim", () => {
    const d = parseOrderDraft(designerDraft({ fabric: "silk", trim: "half" }), DESIGN_ID)!;
    expect(d.fabric).toBe("mesh");
    expect(d.trim).toBe("full");
  });
});

describe("qtyFromRoster / linesFromQty — what the API receives", () => {
  it("counts duplicates of the same size", () => {
    const q = qtyFromRoster([
      { playerName: "a", number: "1", size: "L" },
      { playerName: "b", number: "2", size: "L" },
      { playerName: "c", number: "3", size: "S" },
    ]);
    expect(q).toEqual({ S: 1, M: 0, L: 2, XL: 0 });
  });

  it("emits only sizes with a quantity — zero-qty lines never reach the API", () => {
    expect(linesFromQty({ S: 0, M: 3, L: 0, XL: 1 })).toEqual([
      { size: "M", qty: 3 },
      { size: "XL", qty: 1 },
    ]);
  });

  it("keeps size order S,M,L,XL", () => {
    expect(linesFromQty({ S: 1, M: 1, L: 1, XL: 1 }).map(l => l.size)).toEqual(["S", "M", "L", "XL"]);
  });

  it("returns [] for an empty order (checkout must block before submitting)", () => {
    expect(linesFromQty(emptyQty())).toEqual([]);
  });

  it("total shirts always equals the roster length", () => {
    const d = parseOrderDraft(designerDraft(), DESIGN_ID)!;
    const total = linesFromQty(d.qty).reduce((s, l) => s + l.qty, 0);
    expect(total).toBe(d.roster.length);
  });

  it("a 40-player roster survives the round-trip", () => {
    const roster = Array.from({ length: 40 }, (_, i) => ({
      playerName: `ผู้เล่น ${i + 1}`, number: String(i + 1), size: ["S", "M", "L", "XL"][i % 4],
    }));
    const d = parseOrderDraft(designerDraft({ roster }), DESIGN_ID)!;
    expect(d.roster).toHaveLength(40);
    expect(linesFromQty(d.qty).reduce((s, l) => s + l.qty, 0)).toBe(40);
    expect(d.qty).toEqual({ S: 10, M: 10, L: 10, XL: 10 });
  });
});

describe("normaliseSize", () => {
  it.each([["S", "S"], ["m", "M"], [" l ", "L"], ["XL", "XL"]])("%s → %s", (a, b) => {
    expect(normaliseSize(a)).toBe(b);
  });

  it("falls back for junk", () => {
    for (const junk of ["", "  ", "XXL", "42", null, undefined, {}, 7]) {
      expect(normaliseSize(junk)).toBe("M");
    }
  });

  it("honours a custom fallback", () => {
    expect(normaliseSize("nope", "L")).toBe("L");
  });
});

describe("DRAFT_KEY", () => {
  it("is the key the designer bridge writes to", () => {
    expect(DRAFT_KEY).toBe("axiom-order-draft");
  });
});

describe("parseOrderDraft — counts without a roster (/shop customizer)", () => {
  it("takes per-size counts when no player is named", () => {
    const d = parseOrderDraft(designerDraft({ roster: [], qty: { S: 2, M: 5, L: 0, XL: 1 } }), DESIGN_ID);
    expect(d!.roster).toEqual([]);
    expect(d!.qty).toEqual({ S: 2, M: 5, L: 0, XL: 1 });
  });

  it("lets a roster win over counts", () => {
    const d = parseOrderDraft(designerDraft({ qty: { S: 40, M: 40, L: 40, XL: 40 } }), DESIGN_ID);
    expect(d!.qty).toEqual({ S: 0, M: 1, L: 1, XL: 1 });
  });

  it("is all zeros when neither is sent (old designer drafts)", () => {
    const d = parseOrderDraft(designerDraft({ roster: [] }), DESIGN_ID);
    expect(d!.qty).toEqual(emptyQty());
  });
});

describe("qtyFromRaw", () => {
  it("clamps and truncates", () => {
    expect(qtyFromRaw({ S: -3, M: 2.9, L: 99999, XL: "4" })).toEqual({ S: 0, M: 2, L: 5000, XL: 4 });
  });

  it("turns junk into zeros", () => {
    for (const junk of [null, undefined, "x", 7, [], { S: "abc", M: NaN }]) {
      expect(qtyFromRaw(junk)).toEqual(emptyQty());
    }
  });
});
