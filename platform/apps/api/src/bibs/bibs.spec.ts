import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { parsePath, bounds, pathData } from "./path";
import { textShape } from "./text";
import { BibDesignSchema } from "./design";
import { drawPiece } from "./draw";
import { ink, naiveCmyk } from "./color";
import { piecesFor, hasRibs, ribsFor, layoutFor, deriveRibs, BIB_SIZES, TEMPLATE, RIB_BAND } from "./template";
import { buildBibJob } from "./job";

// colours off the factory's DTP chart
const PURPLE = "#662d91", YELLOW = "#fff200", BLACK = "#231f20", NAVY = "#2e3192";
const look = (body: string, rib = true) => ({
  body, pattern: "plain" as const, ink: YELLOW, inkOutline: NAVY,
  ...(rib ? { rib: { neck: BLACK, arm: BLACK, hem: BLACK } } : {}),
});
const design = (over: Record<string, unknown> = {}) => ({
  product: "bib_r", team: "SAGINUMA FC", font: "block",
  sides: [look(PURPLE), look("#ffffff", false)],
  roster: [{ name: "TAICHI", number: "48", size: "M" }, { name: "SORA", number: "2", size: "M" }, { name: "SHUN", number: "1", size: "XXL" }],
  ...over,
});
const art = { font: "block" as const, team: "", name: "", number: "", show: { frontNumber: true, frontLogo: true, frontTeam: true, backName: true, backNumber: true } };
const mm = (pt: number) => (pt * 25.4) / 72;

describe("bib template (CB-005)", () => {
  it("has every size, front and back, at the factory's sizes and places", () => {
    for (const z of BIB_SIZES) {
      const a = piecesFor(z, "A"), b = piecesFor(z, "B");
      expect(a.front.w).toBeGreaterThan(400);
      expect(b.back.w).toBeCloseTo(a.back.w, 0);
      expect(a.front.neckDepth).toBeGreaterThan(a.back.neckDepth); // the deep U is the front
      expect(a.back.x).toBeGreaterThan(a.front.x + a.front.w); // front left, back right
      expect(b.front.y - (a.front.y + a.front.h)).toBeGreaterThan(30); // the reverse under, clear of side A
    }
    expect(Math.round(TEMPLATE.sizes.M.A!.front.w)).toBe(519);
    expect(Math.round(TEMPLATE.sizes.XL.A!.front.h)).toBe(764);
    expect(hasRibs("M")).toBe(true);
    expect(hasRibs("XXL")).toBe(false);
  });

  it("rib bands: the template's own on S–XL; derived along the cut line elsewhere, the same four", () => {
    for (const z of BIB_SIZES) for (const part of ["front", "back"] as const) {
      expect(ribsFor(z, part).map(r => r.zone).sort()).toEqual(["arm", "arm", "hem", "neck"]);
    }
    // derived on a size that has its own: the same zones, as strokes twice the band wide
    const d = deriveRibs(piecesFor("M", "A").front, RIB_BAND.M);
    expect(d.map(r => r.zone).sort()).toEqual(["arm", "arm", "hem", "neck"]);
    expect(d.every(r => "line" in r && r.width === (r.zone === "hem" ? 40 : 33))).toBe(true);
  });

  it("one bib per page, laid out as the template", () => {
    const r = layoutFor("M", ["A", "B"]);
    expect(r.page.w).toBeCloseTo(TEMPLATE.sizes.M.page.w, 0);
    expect(r.page.h).toBeCloseTo(TEMPLATE.sizes.M.page.h, 0);
    expect(r.pieces.map(p => `${p.side}${p.part}`)).toEqual(["Afront", "Aback", "Bfront", "Bback"]);
    const n = layoutFor("M", ["A"]);
    expect(n.pieces).toHaveLength(2);
    expect(n.page.h).toBeLessThan(700);
    // a size the template draws in one row still makes a reversible bib
    expect(layoutFor("XXL", ["A", "B"]).pieces).toHaveLength(4);
  });
});

describe("paths and outlined text", () => {
  it("parses relative and quadratic commands into absolute cubics", () => {
    const s = parsePath("M10 10h20v5h-20Z M0 0 Q10 10 20 0");
    expect(pathData(s)).toBe("M10 10L30 10L30 15L10 15ZM0 0C6.67 6.67 13.33 6.67 20 0");
    expect(bounds(parsePath("M0 0L10 0L10 20Z"))).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });

  it("sizes text by its ink: an 85 mm number is 85 mm tall", () => {
    const t = textShape("48", "block", { h: 85 }, { cx: 100, top: 50 })!;
    const b = bounds(t.segs)!;
    expect(b.h).toBeCloseTo(85, 0);
    expect(b.y).toBeCloseTo(50, 0);
    expect(b.x + b.w / 2).toBeCloseTo(100, 0);
    expect(bounds(textShape("SAGINUMA FC", "block", { w: 320, h: 50 }, { cx: 0, cy: 0 })!.segs)!.w).toBeLessThanOrEqual(320.5);
    expect(textShape("ทีมไทย", "block", { h: 40 }, { x: 0, top: 0 })!.segs.length).toBeGreaterThan(10);
    expect(textShape("  ", "block", { h: 40 }, { x: 0 })).toBeNull();
  });
});

describe("colour", () => {
  it("takes the chart's own CMYK; converts and flags what's off it", () => {
    expect(ink(YELLOW)).toEqual({ hex: YELLOW, cmyk: [0, 0, 100, 0], onChart: true });
    expect(ink(BLACK).cmyk).toEqual([0, 0, 0, 100]);
    expect(ink("#ffffff")).toMatchObject({ cmyk: [0, 0, 0, 0], onChart: true });
    expect(ink("#123456").onChart).toBe(false);
    expect(naiveCmyk("#ff0000")).toEqual([0, 100, 100, 0]);
  });
});

describe("design", () => {
  it("a reversible bib needs two sides, a normal one one; bands are optional per side", () => {
    expect(BibDesignSchema.safeParse(design()).success).toBe(true);
    expect(BibDesignSchema.safeParse(design({ sides: [look(BLACK)] })).success).toBe(false);
    expect(BibDesignSchema.safeParse(design({ product: "bib_n", sides: [look(BLACK, false)] })).success).toBe(true);
    expect(BibDesignSchema.safeParse(design({ roster: [{ name: "X", number: "1234", size: "M" }] })).success).toBe(false);
  });

  it("draws the bands, clipped to the cut line, only on a side that has them", () => {
    const p = piecesFor("M", "A").front;
    const withRibs = drawPiece(p, "front", look("#ff0000"), art, { ribs: ribsFor("M", "front") });
    const ribs = withRibs.filter(s => s.kind === "path" && s.fill === BLACK);
    expect(ribs).toHaveLength(4);
    expect(ribs.every(s => s.kind === "path" && s.clip)).toBe(true);
    const none = drawPiece(p, "front", look("#ff0000", false), art, { ribs: ribsFor("M", "front") });
    expect(none.some(s => s.kind === "path" && (s.fill === BLACK || s.stroke === BLACK))).toBe(false);
    // derived bands are strokes
    const xxl = drawPiece(piecesFor("XXL", "A").front, "front", look("#ff0000"), art, { ribs: ribsFor("XXL", "front") });
    expect(xxl.filter(s => s.kind === "path" && s.stroke === BLACK && s.clip)).toHaveLength(4);
  });
});

describe("the job package", () => {
  it("one CMYK print file per bib, order sheet per size, name list, design", async () => {
    const job = await buildBibJob(design(), { ref: "AX-261111-T1", date: new Date(2026, 10, 11) });
    expect(job.name).toBe("AX-261111-T1 R-bib (M XXL) SAGINUMA FC");
    expect(job.counts).toEqual({ M: 2, XXL: 1 });
    expect(job.offChart).toEqual([]);
    const files = unzipSync(job.zip);
    const rel = Object.keys(files).map(p => p.slice(job.name.length + 1)).sort();
    expect(rel).toEqual([
      "M/01 No.2 SORA_ol.pdf", "M/02 No.48 TAICHI_ol.pdf", "XXL-3L/01 No.1 SHUN_ol.pdf",
      `${job.name}.xlsx`, `${job.name}_M.jpg`, `${job.name}_XXL-3L.jpg`, `${job.name}_design.json`,
    ].sort());
    expect([...job.preview.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

    // the M file: the template's page, one page
    const bytes = files[`${job.name}/M/02 No.48 TAICHI_ol.pdf`];
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(mm(width)).toBeCloseTo(TEMPLATE.sizes.M.page.w, 0);
    expect(mm(height)).toBeCloseTo(TEMPLATE.sizes.M.page.h, 0);
    // CMYK only
    expect(Buffer.from(bytes).includes("DeviceRGB")).toBe(false);

    const sheet = strFromU8(unzipSync(files[`${job.name}/${job.name}.xlsx`])["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("TAICHI");
    expect(sheet.indexOf(">SORA<")).toBeLessThan(sheet.indexOf(">TAICHI<")); // by number within a size
  }, 30_000);

  it("the logo goes in as a CMYK picture", async () => {
    // a 2×2 red PNG with one see-through pixel
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEIGBkZGBgYAEUUA/0nH5SQAAAAAElFTkSuQmCC", "base64");
    const job = await buildBibJob(design({ roster: [{ name: "A", number: "1", size: "S" }] }), { ref: "AX-T4", date: new Date(), logoPng: new Uint8Array(png) });
    const bytes = Buffer.from(Object.values(unzipSync(job.zip)).find((_, i, a) => Object.keys(unzipSync(job.zip))[i].endsWith("_ol.pdf"))!);
    expect(bytes.includes("DeviceCMYK")).toBe(true);
    expect(bytes.includes("DeviceRGB")).toBe(false);
  }, 30_000);

  it("a normal bib: front and back only; off-chart colours reported", async () => {
    const job = await buildBibJob(design({ product: "bib_n", sides: [look("#123456")] }), { ref: "AX-261111-T3", date: new Date() });
    const pdf = await PDFDocument.load(unzipSync(job.zip)[`${job.name}/M/01 No.2 SORA_ol.pdf`]);
    expect(mm(pdf.getPage(0).getSize().height)).toBeCloseTo(layoutFor("M", ["A"]).page.h, 0);
    expect(job.name).toContain("N-bib");
    expect(job.offChart).toEqual(["#123456 → C79.1 M39.5 Y0 K66.3"]);
  }, 30_000);
});
