import { describe, it, expect } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { parsePath, bounds, pathData } from "./path";
import { textShape, FONT_IDS } from "./text";
import { BibDesignSchema, LAYOUT } from "./design";
import { drawPiece, frontNumber, edgeX, logoBox, sponsorBoxes, teamCy, FRONT_NUMBER_CLEAR } from "./draw";
import { factoryCmyk, ink } from "./color";
import { piecesFor, hasRibs, ribsFor, layoutFor, deriveRibs, BIB_SIZES, TEMPLATE, RIB_BAND, HEM_BAND } from "./template";
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

  it("every font draws numbers, Latin and Thai names (a Thai name in a Latin face falls back to a Thai one)", () => {
    for (const f of FONT_IDS) {
      for (const text of ["48", "TAICHI", "สมชาย", "ปู่"]) {
        const t = textShape(text, f, { h: 85 }, { cx: 0, top: 0 });
        expect(t, `${f} ${text}`).not.toBeNull();
        expect(t!.box.h, `${f} ${text}`).toBeCloseTo(85, 0);
        expect(t!.segs.length, `${f} ${text}`).toBeGreaterThan(8);
      }
    }
    // the new faces really are their own shapes, not the fallback
    const shape = (f: (typeof FONT_IDS)[number]) => { const t = textShape("88", f, { h: 85 }, { x: 0, top: 0 })!; return `${t.box.w.toFixed(1)}:${t.segs.length}`; };
    expect(new Set(FONT_IDS.map(shape)).size).toBe(FONT_IDS.length);
  });

  it("the front number keeps clear of the armhole, however many digits and whatever the font", () => {
    for (const size of BIB_SIZES) {
      const p = piecesFor(size, "A").front!, k = p.w / TEMPLATE.sizes.M.A!.front.w, cut = parsePath(p.cut);
      for (const font of ["block", "classic", "thai"] as const) for (const logoLeft of [false, true]) {
        const one = frontNumber(p, { ...art, font, logoLeft, number: "8" })!;
        for (const number of ["88", "188"]) {
          const t = frontNumber(p, { ...art, font, logoLeft, number })!;
          const b = bounds(t.segs)!;
          const e = edgeX(cut, b.y, b.y + b.h, logoLeft ? "right" : "left", p.w / 2);
          const gap = logoLeft ? e - (b.x + b.w) : b.x - e;
          expect(gap, `${size} ${font} ${number}${logoLeft ? " logoLeft" : ""}`).toBeGreaterThanOrEqual(FRONT_NUMBER_CLEAR.edge * k - 0.5);
          // grows toward the middle, never past it
          if (logoLeft) expect(b.x).toBeGreaterThanOrEqual(p.w / 2 + FRONT_NUMBER_CLEAR.centre * k - 0.5);
          else expect(b.x + b.w).toBeLessThanOrEqual(p.w / 2 - FRONT_NUMBER_CLEAR.centre * k + 0.5);
          expect(b.h).toBeLessThanOrEqual(one.box.h + 0.5);
        }
      }
    }
    // a one-digit number in the block font is where the team's sheets put it, at full height
    const m = piecesFor("M", "A").front!;
    const t = frontNumber(m, { ...art, number: "7" })!;
    expect(t.box.h).toBeCloseTo(85, 0);
    expect(t.box.x + t.box.w / 2).toBeCloseTo(0.264 * m.w, 0);
    // two digits in the block font still fit at full height: they move in, not shrink
    expect(frontNumber(m, { ...art, number: "88" })!.box.h).toBeCloseTo(85, 0);
  });

  it("a front number in the middle sits in the middle of the piece, clear of the armholes, the logo and the team name", () => {
    // a wide logo (110 mm across at M), the hardest case for the room beside it
    const logo = { png: new Uint8Array(0), w: 1300, h: 1000 };
    for (const size of BIB_SIZES) {
      const p = piecesFor(size, "A").front!, k = p.w / TEMPLATE.sizes.M.A!.front.w, cut = parsePath(p.cut);
      for (const font of ["block", "classic", "thai"] as const) for (const logoLeft of [false, true]) for (const number of ["7", "88", "188"]) {
        const a = { ...art, font, logoLeft, numberCenter: true, number, logo };
        const b = bounds(frontNumber(p, a)!.segs)!, at = `${size} ${font} ${number}${logoLeft ? " logoLeft" : ""}`;
        expect(b.x + b.w / 2, at).toBeCloseTo(p.w / 2, 0);
        expect(b.y + b.h / 2, at).toBeCloseTo(p.h / 2, 0);
        expect(b.x - edgeX(cut, b.y, b.y + b.h, "left", p.w / 2), at).toBeGreaterThanOrEqual(FRONT_NUMBER_CLEAR.edge * k - 0.5);
        expect(edgeX(cut, b.y, b.y + b.h, "right", p.w / 2) - (b.x + b.w), at).toBeGreaterThanOrEqual(FRONT_NUMBER_CLEAR.edge * k - 0.5);
        // the logo: above it, or beside it with room to spare
        const l = logoBox(p, a)!;
        const below = b.y - (l.y + l.h), gap = logoLeft ? b.x - (l.x + l.w) : l.x - (b.x + b.w);
        expect(below >= 0 || gap >= FRONT_NUMBER_CLEAR.logo * k - 0.5, `${at}: below ${below.toFixed(1)}, gap ${gap.toFixed(1)}`).toBe(true);
        // the team name moves under it
        const team = bounds(textShape("SAGINUMA FC", font, { w: 320 * k, h: 50 * k }, { cx: p.w / 2, cy: teamCy(p, a) })!.segs)!;
        expect(team.y - (b.y + b.h), at).toBeGreaterThanOrEqual(10 * k);
        expect(team.y + team.h, at).toBeLessThan(p.h - 30 * k);
      }
    }
    // two digits in the block font keep their full 85 mm beside a square logo
    const m = piecesFor("M", "A").front!;
    expect(frontNumber(m, { ...art, numberCenter: true, number: "88", logo: { png: new Uint8Array(0), w: 1000, h: 1000 } })!.box.h).toBeCloseTo(85, 0);
  });

  it("a logo in the middle: a number beside it keeps clear of it; a number in the middle stays there, the team name above it and the logo below it, bigger", () => {
    const wide = { png: new Uint8Array(0), w: 1300, h: 1000 }, square = { png: new Uint8Array(0), w: 1000, h: 1000 };
    for (const size of BIB_SIZES) {
      const p = piecesFor(size, "A").front!, k = p.w / TEMPLATE.sizes.M.A!.front.w, cut = parsePath(p.cut);
      for (const logo of [wide, square]) for (const font of ["block", "classic", "thai"] as const) for (const number of ["7", "88", "188"]) for (const numberCenter of [false, true]) {
        const a = { ...art, font, number, logo, logoCenter: true, numberCenter, team: "SAGINUMA FC", sponsors: { left: { png: new Uint8Array(0), w: 600, h: 1000 } } };
        const l = logoBox(p, a)!, at = `${size} ${font} ${number} ${logo.w}${numberCenter ? " numberCenter" : ""}`;
        expect(l.x + l.w / 2, at).toBeCloseTo(p.w / 2, 3);
        const b = bounds(frontNumber(p, a)!.segs)!;
        if (numberCenter) {
          // the number in the middle of the piece, the team name above it, the logo below it
          expect(b.x + b.w / 2, at).toBeCloseTo(p.w / 2, 0);
          expect(b.y + b.h / 2, at).toBeCloseTo(p.h / 2, 0);
          const team = bounds(textShape("SAGINUMA FC", font, { w: 320 * k, h: 50 * k }, { cx: p.w / 2, cy: teamCy(p, a) })!.segs)!;
          expect(b.y - (team.y + team.h), at).toBeGreaterThanOrEqual(10 * k);
          expect(team.y - p.neckDepth, at).toBeGreaterThanOrEqual(5 * k);
          expect(team.x - edgeX(cut, team.y, team.y + team.h, "left", p.w / 2), at).toBeGreaterThanOrEqual(20 * k);
          expect(l.y - (b.y + b.h), at).toBeGreaterThanOrEqual(10 * k);
          expect(p.h - (l.y + l.h), at).toBeGreaterThanOrEqual(40 * k - 0.01);
          // clear of the sponsors in the bottom corners: beside them or above them
          for (const sb of sponsorBoxes(p, a)) {
            const apart = Math.max(sb.x - (l.x + l.w), l.x - (sb.x + sb.w), sb.y - (l.y + l.h));
            expect(apart, at).toBeGreaterThanOrEqual(10 * k - 0.01);
          }
          // with no sponsors, bigger than on the chest: the full 170 mm box on M
          if (logo === square) expect(logoBox(p, { ...a, sponsors: undefined })!.h, at).toBeCloseTo(170 * k, 3);
        } else {
          // on the left, clear of the logo and the armhole
          expect(l.x - (b.x + b.w), at).toBeGreaterThanOrEqual(FRONT_NUMBER_CLEAR.logo * k - 0.5);
          expect(b.x - edgeX(cut, b.y, b.y + b.h, "left", p.w / 2), at).toBeGreaterThanOrEqual(FRONT_NUMBER_CLEAR.edge * k - 0.5);
          if (number.length < 3) expect(b.h, at).toBeGreaterThan(40 * k); // three digits beside a wide logo get small: the page says so
        }
      }
    }
  });

  it("sponsors sit in the front's bottom corners: inside the piece, clear of the hem band and the team name", () => {
    const wide = { png: new Uint8Array(0), w: 3000, h: 1000 }, tall = { png: new Uint8Array(0), w: 600, h: 1000 };
    for (const size of BIB_SIZES) {
      const p = piecesFor(size, "A").front!, k = p.w / TEMPLATE.sizes.M.A!.front.w, cut = parsePath(p.cut);
      for (const [left, right] of [[wide, tall], [tall, wide]]) for (const numberCenter of [false, true]) {
        const a = { ...art, number: "188", numberCenter, sponsors: { left, right } };
        const boxes = sponsorBoxes(p, a), at = `${size}${numberCenter ? " numberCenter" : ""}`;
        expect(boxes.map(b => b.slot)).toEqual(["left", "right"]);
        const team = bounds(textShape("SAGINUMA FC", "block", { w: 320 * k, h: 50 * k }, { cx: p.w / 2, cy: teamCy(p, a) })!.segs)!;
        for (const b of boxes) {
          expect(b.w, at).toBeLessThanOrEqual(LAYOUT.front.sponsor.maxW * k + 0.01);
          expect(b.h, at).toBeLessThanOrEqual(LAYOUT.front.sponsor.h * k + 0.01);
          expect(b.slot === "left" ? b.x + b.w < p.w / 2 : b.x > p.w / 2, at).toBe(true);
          expect(b.x - edgeX(cut, b.y, b.y + b.h, "left", p.w / 2), at).toBeGreaterThanOrEqual(30 * k);
          expect(edgeX(cut, b.y, b.y + b.h, "right", p.w / 2) - (b.x + b.w), at).toBeGreaterThanOrEqual(30 * k);
          expect(p.h - (b.y + b.h), at).toBeGreaterThanOrEqual(HEM_BAND + 10);
          expect(b.y - (team.y + team.h), at).toBeGreaterThanOrEqual(10 * k);
        }
      }
      // drawn as pictures on the front only, and only the ones given
      const one = { ...art, sponsors: { right: wide } };
      expect(drawPiece(p, "front", look("#ffffff"), one).filter(s => s.kind === "image")).toHaveLength(1);
      expect(drawPiece(piecesFor(size, "A").back!, "back", look("#ffffff"), one).filter(s => s.kind === "image")).toHaveLength(0);
    }
  });

  it("sponsors on the back sit in a row under the number: inside the piece, apart, clear of the number and the hem band", () => {
    const wide = { png: new Uint8Array(0), w: 3000, h: 1000 }, square = { png: new Uint8Array(0), w: 1000, h: 1000 };
    for (const size of BIB_SIZES) {
      const p = piecesFor(size, "A").back!, k = p.w / TEMPLATE.sizes.M.A!.front.w, cut = parsePath(p.cut), B = LAYOUT.back;
      const num = bounds(drawPiece(p, "back", look("#ffffff", false), { ...art, number: "88" }).filter(s => s.kind === "path" && s.fill === YELLOW).flatMap(s => s.kind === "path" ? s.segs : []))!;
      for (const logos of [[wide, wide, wide], [square, wide, square], [wide, square, wide]]) {
        const a = { ...art, number: "88", sponsors: { backLeft: logos[0], backCenter: logos[1], backRight: logos[2] } };
        const boxes = sponsorBoxes(p, a, "back"), at = `${size} ${logos.map(l => l.w).join("/")}`;
        expect(boxes.map(b => b.slot)).toEqual(["backLeft", "backCenter", "backRight"]);
        expect(boxes[1].x + boxes[1].w / 2, at).toBeCloseTo(p.w / 2, 3);
        for (const [i, b] of boxes.entries()) {
          expect(b.w, at).toBeLessThanOrEqual(B.sponsor.maxW * k + 0.01);
          expect(b.h, at).toBeLessThanOrEqual(B.sponsor.h * k + 0.01);
          expect(b.y - (num.y + num.h), at).toBeGreaterThanOrEqual(15 * k);
          expect(p.h - (b.y + b.h), at).toBeGreaterThanOrEqual(HEM_BAND + 10);
          expect(b.x - edgeX(cut, b.y, b.y + b.h, "left", p.w / 2), at).toBeGreaterThanOrEqual(30 * k);
          expect(edgeX(cut, b.y, b.y + b.h, "right", p.w / 2) - (b.x + b.w), at).toBeGreaterThanOrEqual(30 * k);
          if (i) expect(b.x - (boxes[i - 1].x + boxes[i - 1].w), at).toBeGreaterThanOrEqual(10 * k);
        }
      }
      // the back's sponsors are drawn on the back only
      const one = { ...art, sponsors: { backCenter: wide } };
      expect(drawPiece(p, "back", look("#ffffff"), one).filter(s => s.kind === "image")).toHaveLength(1);
      expect(drawPiece(piecesFor(size, "A").front!, "front", look("#ffffff"), one).filter(s => s.kind === "image")).toHaveLength(0);
    }
  });

  it("draws Japanese names in kanji and kana, not empty boxes", () => {
    // an empty box ("tofu") is two rectangles: ~10 segments a character, and every character the same
    const one = (ch: string) => pathData(textShape(ch, "block", { h: 35 }, { x: 0, top: 0 })!.segs);
    for (const ch of ["鈴", "木", "タ", "ろ", "ー"]) expect(one(ch)).not.toBe(one("\u{E000}"));
    expect(one("鈴")).not.toBe(one("木"));
    expect(textShape("鈴木", "block", { h: 35 }, { x: 0, top: 0 })!.segs.length).toBeGreaterThan(60);
    // Latin in a Japanese name stays in the team's face; the order sheet's labels read Japanese too
    expect(textShape("TANAKA 太郎", "classic", { h: 35, maxW: 380 }, { cx: 0, top: 0 })!.box.w).toBeLessThanOrEqual(380.5);
    expect(textShape("背番号", "label", { h: 4 }, { x: 0, top: 0 })!.segs.length).toBeGreaterThan(30);
  });
});

describe("colour", () => {
  it("takes the chart's own CMYK; converts and flags what's off it", () => {
    expect(ink(YELLOW)).toEqual({ hex: YELLOW, cmyk: [0, 0, 100, 0], onChart: true });
    expect(ink(BLACK).cmyk).toEqual([0, 0, 0, 100]);
    expect(ink("#ffffff")).toMatchObject({ cmyk: [0, 0, 0, 0], onChart: true });
    expect(ink("#123456").onChart).toBe(false);
    expect(ink("#123456").cmyk).toEqual(factoryCmyk("#123456"));
  });

  it("converts an off-chart colour as the factory's Illustrator does; a grey in black only, like the chart's", () => {
    // values Illustrator gives with the factory's colour settings
    expect(factoryCmyk("#ff0000")).toEqual([0, 99, 100, 0]);
    expect(factoryCmyk("#255934")).toEqual([83, 40, 90, 37]); // not the muddy C58 M0 Y42 K65 of the plain formula
    // the chart's own colours come out within a few points of the chart
    for (const [hex, cmyk] of [["#f26522", [0, 75, 100, 0]], ["#ffcc4e", [0, 20, 80, 0]]] as const)
      factoryCmyk(hex).forEach((v, i) => expect(Math.abs(v - cmyk[i])).toBeLessThanOrEqual(3));
    expect(factoryCmyk("#000000")).toEqual([0, 0, 0, 100]);
    expect(factoryCmyk("#939598")).toEqual([0, 0, 0, 50]); // a chart grey
    expect(factoryCmyk("#7f7f7f")[3]).toBeGreaterThan(55);
    expect(factoryCmyk("#7f7f7f").slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("prints the CMYK written under each swatch on the factory's chart (DTP-28color-cs4.svg), by its number", async () => {
    const { chartNumber, inkText } = await import("./color");
    // rows a former copy of the chart had wrong: orange, crimson, violet
    expect(ink("#f26522").cmyk).toEqual([0, 75, 100, 0]);
    expect(ink("#ed145b").cmyk).toEqual([0, 100, 50, 0]);
    expect(ink("#2e3192").cmyk).toEqual([100, 100, 0, 0]);
    expect(ink("#feecdf").cmyk).toEqual([0, 7.5, 10, 0]);
    expect(chartNumber("#F26522")).toBe("0031");
    expect(chartNumber("#fff200")).toBe("0001");
    expect(inkText("#f26522")).toBe("0031  C0 M75 Y100 K0");
    expect(inkText("#123456")).toMatch(/^C/); // off the chart: no number
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

/** a PDF's page content, decoded */
async function pageContent(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.context.enumerateIndirectObjects().map(([, o]) => o).filter((o): o is PDFRawStream => o instanceof PDFRawStream)
    .map(s => { try { return new TextDecoder("latin1").decode(decodePDFRawStream(s).decode()); } catch { return ""; } }).join("\n");
}

describe("the job package", () => {
  it("no job label on the page (order no, team, name, 1/6): only each piece's size mark is in the cut line's grey", async () => {
    const job = await buildBibJob(design(), { ref: "AX-261116-0T82", date: new Date(2026, 10, 16) });
    const files = unzipSync(job.zip);
    const content = await pageContent(files[`${job.name}/M/02 No.48 TAICHI_ol.pdf`]);
    // the grey (K50) as a fill: the size mark in each of the 4 pieces, nothing else (the label made it 5)
    expect(content.match(/\n0 0 0 0\.5 k\n/g)?.length).toBe(4);
  });

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

  it("the logo goes in as an RGB picture, for Illustrator to make CMYK with the factory's settings", async () => {
    // a 2×2 red PNG with one see-through pixel
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEIGBkZGBgYAEUUA/0nH5SQAAAAAElFTkSuQmCC", "base64");
    const job = await buildBibJob(design({ roster: [{ name: "A", number: "1", size: "S" }] }), { ref: "AX-T4", date: new Date(), logoPng: new Uint8Array(png) });
    const bytes = Buffer.from(Object.values(unzipSync(job.zip)).find((_, i, a) => Object.keys(unzipSync(job.zip))[i].endsWith("_ol.pdf"))!);
    expect(bytes.includes("/ColorSpace /DeviceRGB")).toBe(true);
  }, 30_000);

  it("sponsors' logos go in each bib's print file", async () => {
    const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEIGBkZGBgYAEUUA/0nH5SQAAAAAElFTkSuQmCC", "base64"));
    const images = async (sponsorPngs?: { left?: Uint8Array; right?: Uint8Array }) => {
      const job = await buildBibJob(design({ product: "bib_n", sides: [look("#ffffff")], roster: [{ name: "A", number: "1", size: "S" }] }), { ref: "AX-T5", date: new Date(), ...(sponsorPngs ? { sponsorPngs } : {}) });
      const files = unzipSync(job.zip), pdf = Object.keys(files).find(f => f.endsWith("_ol.pdf"))!;
      return (Buffer.from(files[pdf]).toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
    };
    const none = await images();
    expect(await images({ left: png })).toBeGreaterThan(none);
    expect(await images({ left: png, right: new Uint8Array(png) })).toBeGreaterThan(await images({ left: png }));
  }, 30_000);

  it("a normal bib: front and back only; off-chart colours reported", async () => {
    const job = await buildBibJob(design({ product: "bib_n", sides: [look("#123456")] }), { ref: "AX-261111-T3", date: new Date() });
    const pdf = await PDFDocument.load(unzipSync(job.zip)[`${job.name}/M/01 No.2 SORA_ol.pdf`]);
    expect(mm(pdf.getPage(0).getSize().height)).toBeCloseTo(layoutFor("M", ["A"]).page.h, 0);
    expect(job.name).toContain("N-bib");
    expect(job.offChart).toEqual(["#123456 → C98 M80 Y41 K34"]);
  }, 30_000);
});

describe("the kit studio's basketball singlet, on the bib template", async () => {
  const { kitBibDesign, kitRoster, kitOnBib } = await import("./kit");
  const snap = (over: Record<string, unknown> = {}) => ({
    kind: "kit-studio" as const, kit: "bib",
    colors: { body: "#ed1c24", sleeve: "#ed1c24", trim: "#ffc20e", stripe: "#ffc20e", number: "#ffffff" },
    pattern: "diagonal", font: "classic", fabric: "B1", trim: "neckarm", name: "SOMCHAI", number: "23", logo: "axiom", logoTint: false,
    ...over,
  });

  it("is a one-sided bib in the kit's colours, trim where the trim level puts it", () => {
    expect(kitOnBib(snap())).toBe(true);
    expect(kitOnBib(snap({ kit: "striker" }))).toBe(false);
    const d = BibDesignSchema.parse(kitBibDesign(snap(), [{ name: "TANAKA", number: "7", size: "M" }]));
    expect(d).toMatchObject({ product: "bib_n", font: "classic", logoLeft: true, axiomMark: true, kit: { id: "bib", code: "BK-03", fabric: "B1" } });
    expect(d.sides[0]).toEqual({ body: "#ed1c24", pattern: "diagonal", patternColor: "#ffc20e", ink: "#ffffff", rib: { neck: "#ffc20e", arm: "#ffc20e", hem: "#ed1c24" } });
    expect(d.show).toMatchObject({ frontTeam: false, frontLogo: true });
    const plain = kitBibDesign(snap({ trim: "none", pattern: "hoops" }), []).sides[0];
    expect(plain.pattern).toBe("rings");
    expect(plain.rib).toBeUndefined();
    expect(kitBibDesign(snap({ logo: "none" }), []).show.frontLogo).toBe(false);
  });

  it("made reversible: an R-bib, side B in its own colours and pattern, the trim levels shared", async () => {
    const b = { colors: { body: "#ffffff", trim: "#1d4ed8", stripe: "#93c5fd", number: "#1d4ed8" }, pattern: "side" };
    const d = BibDesignSchema.parse(kitBibDesign(snap({ reversible: true, sideB: b }), [{ name: "TANAKA", number: "7", size: "M" }]));
    expect(d.product).toBe("bib_r");
    expect(d.sides).toHaveLength(2);
    expect(d.sides[0]).toMatchObject({ body: "#ed1c24", pattern: "diagonal" });
    expect(d.sides[1]).toEqual({ body: "#ffffff", pattern: "side", patternColor: "#93c5fd", ink: "#1d4ed8", rib: { neck: "#1d4ed8", arm: "#1d4ed8", hem: "#ffffff" } });
    // never saved side B: white in side A's colours, plain; junk colours fall back the same way
    const fb = kitBibDesign(snap({ reversible: true, sideB: { colors: { body: "red" } } }), []).sides[1];
    expect(fb).toMatchObject({ body: "#ffffff", pattern: "plain", ink: "#ed1c24", patternColor: "#ed1c24" });
    expect(kitBibDesign(snap({ sideB: b }), []).product).toBe("bib_n"); // side B only counts when made reversible
    const job = await buildBibJob(d, { ref: "AX-261116-R1", date: new Date(2026, 10, 16) });
    const z = unzipSync(job.zip);
    expect(Object.keys(z).filter(k => k.endsWith("_ol.pdf"))).toHaveLength(1);
    expect(JSON.parse(strFromU8(z[`${job.name}/${job.name}_design.json`])).design.product).toBe("bib_r");
  }, 30_000);

  it("one piece per shirt ordered: the names given, else the design's own name and number", () => {
    const items = [{ size: "M", qty: 2, roster: [{ playerName: "TANAKA", number: "7", qty: 1 }] }, { size: "L", qty: 1, roster: [] }];
    expect(kitRoster(snap(), items)).toEqual([{ name: "TANAKA", number: "7", size: "M" }, { name: "", number: "", size: "M" }, { name: "", number: "", size: "L" }]);
    expect(kitRoster(snap(), [{ size: "XL", qty: 2, roster: [] }])).toEqual([{ name: "SOMCHAI", number: "23", size: "XL" }, { name: "SOMCHAI", number: "23", size: "XL" }]);
  });

  it("draws the kit's pattern as the 3D singlet does, the back mirrored; the logo left, the number right", () => {
    const d = BibDesignSchema.parse(kitBibDesign(snap(), [{ name: "A", number: "7", size: "M" }]));
    const p = piecesFor("M", "A");
    const stripe = (part: "front" | "back") => drawPiece(p[part], part, d.sides[0], art).find(s => s.kind === "path" && s.fill === "#ffc20e" && s.clip)!;
    // the sash's top edge, as [y at its left end, y at its right end]
    const sash = (part: "front" | "back") => { const [a, b] = (stripe(part) as any).segs.slice(0, 2).sort((u: any, v: any) => u.x - v.x); return [a.y, b.y]; };
    const [fl, fr] = sash("front"), [bl, br] = sash("back");
    expect(fl).toBeLessThan(fr); // the front's sash falls to the viewer's right
    expect(bl).toBeGreaterThan(br); // the back's the other way
    const shapes = drawPiece(p.front, "front", d.sides[0], { ...art, number: "7", logoLeft: true, logo: { png: new Uint8Array(8), w: 100, h: 100, tint: true } });
    const logo = shapes.find(s => s.kind === "image") as any;
    expect(logo.tint).toBe("#ffffff");
    expect(logo.x + logo.w / 2).toBeLessThan(p.front.w / 2);
  });

  it("builds the job: Axiom mark in one colour, named by the kit", async () => {
    const job = await buildBibJob(kitBibDesign(snap(), [{ name: "TANAKA", number: "7", size: "M" }]), { ref: "AX-261111-K1", date: new Date(2026, 10, 11) });
    expect(job.name).toBe("AX-261111-K1 BK-03 (M)");
    const z = unzipSync(job.zip);
    const pdf = await PDFDocument.load(z[`${job.name}/M/01 No.7 TANAKA_ol.pdf`]);
    expect(pdf.getPageCount()).toBe(1);
    expect(job.offChart).toEqual([]);
    const json = JSON.parse(strFromU8(z[`${job.name}/${job.name}_design.json`]));
    expect(json.design.kit).toMatchObject({ id: "bib", code: "BK-03" });
  }, 30_000);
});
