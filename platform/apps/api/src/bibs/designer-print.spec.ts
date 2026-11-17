import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildDesignerJob, compose, designerFacts, designerPiece, designerRows, DesignerPrintSchema, FIT_MARGIN_MM, fitInPiece, fitToSize, patternBox, pictures, transformPath, type DesignerPrint } from "./designer-print";
import { piecesFor } from "./template";
import { parsePath } from "./path";

// an 8×8 red PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAAA1BMVEXmABL5rOCAAAAAC0lEQVR4nGNgQAUAABAAATm9j2UAAAAASUVORK5CYII=";

const square = (x: number, y: number, s: number) => `M${x} ${y}L${x + s} ${y}L${x + s} ${y + s}L${x} ${y + s}Z`;

/** a design as the designer sends it: drawn on M, a logo and a stripe on every bib, a number per player */
function spec(over: Partial<DesignerPrint> = {}): unknown {
  const M = piecesFor("M", "A");
  return {
    app: "axiom-print", v: 1, size: "M", reversible: false, team: "Test FC",
    body: "#1D4ED8", trimColor: "#ffffff", trim: "full",
    images: [PNG],
    panels: [
      { side: "A", part: "front", objs: [
        // a stripe right across: a background, stretched with the piece
        { c: [M.front.w / 2, 400], w: M.front.w, h: 40, items: [{ d: `M0 380H${M.front.w}V420H0Z`, m: [1, 0, 0, 1, 0, 0], fill: "#FACC15" }] },
        // the logo, 60 mm, turned a quarter
        { c: [150, 200], w: 60, h: 60, items: [{ img: 0, m: [0, 60, -60, 0, 180, 170] }] },
      ] },
      { side: "A", part: "back", objs: [] },
    ],
    players: [
      { name: "SOMCHAI", number: "10", size: "M", objs: [
        // the number, drawn in its own units (×2) and placed by its matrix
        { panel: 1, c: [M.back.w / 2, 300], w: 100, h: 100, items: [{ d: square(0, 0, 50), m: [2, 0, 0, 2, M.back.w / 2 - 50, 250], fill: "#ffffff", stroke: "#000000", sw: 1 }] },
      ] },
      { name: "", number: "7", size: "XL", objs: [
        { panel: 1, c: [M.back.w / 2, 300], w: 100, h: 100, items: [{ d: square(0, 0, 100), m: [1, 0, 0, 1, M.back.w / 2 - 50, 250], fill: "#ffffff" }] },
      ] },
    ],
    ...over,
  };
}

describe("advanced designer print data", () => {
  it("is checked before anything is drawn", () => {
    expect(DesignerPrintSchema.safeParse(spec()).success).toBe(true);
    expect(DesignerPrintSchema.safeParse(spec({ size: "XXXL" as never })).success).toBe(false);
    expect(DesignerPrintSchema.safeParse({ ...(spec() as object), app: "axiom-roster" }).success).toBe(false);
    expect(DesignerPrintSchema.safeParse(spec({ panels: [] })).success).toBe(false);
  });

  it("composes matrices B first, then A", () => {
    const m = compose([2, 0, 0, 2, 10, 0], [1, 0, 0, 1, 5, 5]); // move by 5, then double and shift 10
    expect(transformPath(parsePath("M0 0L1 1"), m)).toEqual([{ op: "M", x: 20, y: 10 }, { op: "L", x: 22, y: 12 }]);
  });

  it("carries a shape to a bigger size: in place across and down, growing with the width; a background stretches", () => {
    const from = { w: 500, h: 600 }, to = { w: 600, h: 660 };
    // a number centred, 100 mm, a third of the way down
    const n = fitToSize({ c: [250, 200], w: 100, h: 100 }, from, to);
    expect(n[0]).toBeCloseTo(1.2); expect(n[3]).toBeCloseTo(1.2);
    expect(n[0] * 250 + n[4]).toBeCloseTo(300); // still centred
    expect(n[3] * 200 + n[5]).toBeCloseTo(220); // a third of the way down
    // a band across the piece
    const b = fitToSize({ c: [250, 400], w: 500, h: 40 }, from, to);
    expect(b[0]).toBeCloseTo(1.2); expect(b[3]).toBeCloseTo(1.1);
    // on its own size it doesn't move
    expect(fitToSize({ c: [120, 80], w: 30, h: 30 }, from, from)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("draws a piece: the body, the art over it clipped to the cut line, the trim over that", () => {
    const d = DesignerPrintSchema.parse(spec());
    const pics = pictures(d);
    const front = designerPiece(d, pics, "M", "A", "front", piecesFor("M", "A").front, null);
    expect(front[0]).toMatchObject({ kind: "path", fill: "#1d4ed8" });
    const stripe = front.find(s => s.kind === "path" && s.fill === "#facc15")!;
    expect(stripe.kind === "path" && stripe.clip).toBeTruthy();
    const logo = front.find(s => s.kind === "image")!;
    expect(logo.kind === "image" && logo.m).toEqual([0, 60, -60, 0, 180, 170]);
    // trim "full": neck, both armholes and the hem, after the art
    const trims = front.filter(s => s.kind === "path" && s.fill !== "#facc15" && (s.fill === "#ffffff" || s.stroke === "#ffffff"));
    expect(trims.length).toBeGreaterThanOrEqual(3);
    expect(front.indexOf(trims[0])).toBeGreaterThan(front.indexOf(logo));
    // the number's stroke scales with its matrix: 1 unit × 2
    const back = designerPiece(d, pics, "M", "A", "back", piecesFor("M", "A").back, d.players[0]);
    expect(back.find(s => s.kind === "path" && s.stroke === "#000000")).toMatchObject({ width: 2 });
    // no trim, no bands
    const bare = DesignerPrintSchema.parse(spec({ trim: "none" }));
    expect(designerPiece(bare, pics, "M", "A", "front", piecesFor("M", "A").front, null).filter(s => s.kind === "path" && (s.fill === "#ffffff" || s.stroke === "#ffffff"))).toHaveLength(0);
  });

  it("lays the pattern picture as the designer does: over its 400 × 470 frame, the same size in cm on every size", () => {
    const d = DesignerPrintSchema.parse(spec({ pattern: 0 }));
    const pics = pictures(d);
    const imgOn = (size: "S" | "XL" | "XXL") => {
      const p = piecesFor(size, "A").front;
      const im = designerPiece(d, pics, size, "A", "front", p, null).find(s => s.kind === "image")!;
      return { im: im as Extract<typeof im, { kind: "image" }>, p };
    };
    const s = imgOn("S"), xl = imgOn("XL");
    // the 8×8 test picture is square: it covers the frame's height (470 units), centred on the piece
    expect(s.im.h).toBeCloseTo(470 * 1.86347, 1);
    expect(xl.im.w).toBeCloseTo(s.im.w, 6); // not stretched to the bigger piece
    expect(s.im.x + s.im.w / 2).toBeCloseTo(s.p.w / 2, 6);
    // XXL with its cut line is wider than the frame: the picture covers that
    const xxl = imgOn("XXL");
    expect(xxl.im.w).toBeGreaterThanOrEqual(patternBox(xxl.p).w - 1e-6);
    expect(patternBox(xxl.p).w).toBeGreaterThan(400 * 1.86347);
  });

  it("keeps a long name inside each size's piece, clear of the trim; a short one keeps its size", () => {
    const back = piecesFor("XXL", "A").back;
    // a 470 mm name across the shoulders of an XXL back: the armholes are closer there than the piece is wide
    expect(fitInPiece(back, [back.w / 2, 160], 470, 70)).toBeLessThan(0.95);
    expect(fitInPiece(back, [back.w / 2, 160], 200, 70)).toBe(1);
    // the fitted name leaves the margin on both sides
    const k = fitInPiece(back, [back.w / 2, 160], 470, 70);
    expect(470 * k).toBeLessThan(back.w - 2 * FIT_MARGIN_MM);
  });

  it("matches the order's names to the players drawn; spares get the shared art; an unknown name is refused", () => {
    const d = DesignerPrintSchema.parse(spec());
    const rows = designerRows(d, [
      { size: "M", qty: 2, roster: [{ playerName: "Somchai", number: "10", qty: 1 }] },
      { size: "XL", qty: 1, roster: [{ playerName: null, number: "7", qty: 1 }] },
    ]);
    expect(rows.map(r => [r.size, r.number, r.player?.number ?? null])).toEqual([["M", "10", "10"], ["M", "", null], ["XL", "7", "7"]]);
    expect(() => designerRows(d, [{ size: "M", qty: 1, roster: [{ playerName: "Nobody", number: "99", qty: 1 }] }])).toThrow(/No.99 Nobody/);
  });

  it("builds the job as a web bib's: a print file per bib, a sheet per size, the list and the design", async () => {
    const d = DesignerPrintSchema.parse(spec());
    const rows = designerRows(d, [
      { size: "M", qty: 2, roster: [{ playerName: "SOMCHAI", number: "10", qty: 1 }] },
      { size: "XL", qty: 1, roster: [{ playerName: "", number: "7", qty: 1 }] },
    ]);
    const job = await buildDesignerJob(d, rows, { ref: "AX-T9", date: new Date(2026, 10, 17) });
    expect(job.name).toBe("AX-T9 N-bib (M XL) Test FC");
    const files = unzipSync(job.zip);
    const names = Object.keys(files).map(n => n.slice(job.name.length + 1)).sort();
    expect(names).toEqual([
      "M/01 No.10 SOMCHAI_ol.pdf", "M/02_ol.pdf", "XL-2L/01 No.7_ol.pdf",
      `${job.name}.xlsx`, `${job.name}_M.jpg`, `${job.name}_XL-2L.jpg`, `${job.name}_design.json`,
    ].sort());
    expect(strFromU8(files[`${job.name}/M/01 No.10 SOMCHAI_ol.pdf`].slice(0, 5))).toBe("%PDF-");
    const meta = JSON.parse(strFromU8(files[`${job.name}/${job.name}_design.json`]));
    expect(meta).toMatchObject({ template: "CB-005", source: "advanced designer", images: 1 });
    expect(meta.notes.join(" ")).toMatch(/Drawn on M/);
    expect(job.counts).toEqual({ M: 2, XL: 1 });
  });

  it("tells the print manager what a web bib's design.json does: the product, each side's trim colours, the fabric", async () => {
    const r = DesignerPrintSchema.parse(spec({ reversible: true, trim: "neck", trimColor: "#fff200" }));
    expect(designerFacts(r, "B1")).toEqual({
      product: "bib_r",
      sides: [{ body: "#1d4ed8", rib: { neck: "#fff200", arm: "#1d4ed8", hem: "#1d4ed8" } }, { body: "#1d4ed8", rib: { neck: "#fff200", arm: "#1d4ed8", hem: "#1d4ed8" } }],
      kit: { id: "advanced", code: "ADV", name: "Advanced designer", fabric: "B1" },
    });
    // no trim: no bands; one side: an N-bib
    expect(designerFacts(DesignerPrintSchema.parse(spec({ trim: "none" })))).toMatchObject({ product: "bib_n", sides: [{ body: "#1d4ed8" }] });
    const job = await buildDesignerJob(r, [{ name: "", number: "", size: "M", player: null }], { ref: "AX-T11", date: new Date(), fabricId: "B1" });
    const files = unzipSync(job.zip);
    const dj = JSON.parse(strFromU8(files[Object.keys(files).find(f => f.endsWith("_design.json"))!]));
    expect(dj.design).toMatchObject({ product: "bib_r", kit: { fabric: "B1" }, reversible: true });
  });

  it("an R-bib has side B's pieces too", async () => {
    const d = DesignerPrintSchema.parse(spec({ reversible: true, panels: [
      { side: "A", part: "front", objs: [] }, { side: "A", part: "back", objs: [] },
      { side: "B", part: "front", objs: [] }, { side: "B", part: "back", objs: [] },
    ] }));
    const job = await buildDesignerJob(d, [{ name: "", number: "", size: "S", player: null }], { ref: "AX-T10", date: new Date() });
    expect(job.name).toMatch(/R-bib/);
  });
});
