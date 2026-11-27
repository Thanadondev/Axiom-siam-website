import { Resvg } from "@resvg/resvg-js";
import * as jpeg from "jpeg-js";
import { drawPiece, frontNumber, moveShapes, sponsorBoxes, teamCy, type Art, type Shape } from "./draw";
import { frontLayout, LAYOUT, type BibDesign, type SideLook } from "./design";
import { parsePath, pathData, type Seg } from "./path";
import { BASE_WIDTH, piecesFor, ribsFor, SIZE_NAME, TEMPLATE, type BibSize, type Part } from "./template";
import { cmykText, ink, inkText, tintPng } from "./color";
import { textShape } from "./text";

/**
 * The order sheet the graphics team sends with every job: the bib front and
 * back (and the reverse), the size of each print, the rib colours, how many
 * and of what — laid out like theirs, so the factory reads it the same way.
 * Drawn from the very shapes that go into the print file.
 */

const RED = "#e60012";
const INK = "#231f20";
const GREEN = "#1a9a4a";
const MUTE = "#6d6e71";

export interface SheetMeta {
  /** the job reference in the title and footer (web order number) */
  ref: string;
  date: Date;
  brand?: string;
  fabric?: string;
  /** for the graphics team, above the footer (e.g. a team font that couldn't be read) */
  notes?: string[];
}

export function svgShapes(shapes: Shape[], ids: { n: number }): { defs: string; body: string } {
  let defs = "", body = "";
  const clipOf = (segs?: Seg[]) => {
    if (!segs) return "";
    const id = `c${ids.n++}`;
    defs += `<clipPath id="${id}"><path d="${pathData(segs)}"/></clipPath>`;
    return ` clip-path="url(#${id})"`;
  };
  for (const s of shapes) {
    if (s.kind === "image") {
      const href = `data:image/png;base64,${Buffer.from(s.tint ? tintPng(s.png, s.tint) : s.png).toString("base64")}`;
      const img = s.m
        ? `<image x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${s.m.join(" ")})" href="${href}"/>`
        : `<image x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" preserveAspectRatio="none" href="${href}"/>`;
      const seen0 = s.opacity !== undefined && s.opacity < 1 ? `<g opacity="${s.opacity}">${img}</g>` : img;
      const seen = s.blend ? `<g style="mix-blend-mode:${s.blend}">${seen0}</g>` : seen0;
      const inner = s.artClip ? `<g${clipOf(s.artClip)}>${seen}</g>` : seen;
      body += s.clip ? `<g${clipOf(s.clip)}>${inner}</g>` : inner;
      continue;
    }
    const clip = clipOf(s.clip);
    const gradRef = (g: NonNullable<typeof s.grad>) => {
      const id = `g${ids.n++}`, c = g.coords;
      const stops = [...g.stops].sort((a, b) => a.o - b.o).map(t => `<stop offset="${t.o}" stop-color="${t.c}"/>`).join("");
      defs += g.type === "linear"
        ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${c[0]}" y1="${c[1]}" x2="${c[2]}" y2="${c[3]}" gradientTransform="matrix(${g.m.join(" ")})">${stops}</linearGradient>`
        : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fx="${c[3]}" fy="${c[4]}" gradientTransform="matrix(${g.m.join(" ")})">${stops}</radialGradient>`;
      return `url(#${id})`;
    };
    const fillRef = s.grad && s.fill ? gradRef(s.grad) : s.fill ?? "none";
    const strokeRef = s.strokeGrad && s.stroke ? gradRef(s.strokeGrad) : s.stroke;
    const see = s.opacity !== undefined && s.opacity < 1 ? ` opacity="${s.opacity}"` : "";
    const paint = `fill="${fillRef}"${see}` + (s.evenOdd ? ` fill-rule="evenodd"` : "") + (s.stroke ? ` stroke="${strokeRef}" stroke-width="${s.width ?? 0.35}" stroke-linejoin="${s.join ?? "round"}"${s.join === "miter" ? ` stroke-miterlimit="${s.miter ?? 4}"` : ""}` : "");
    const dash = s.stroke && s.dash?.length ? ` stroke-dasharray="${s.dash.join(" ")}"` : "";
    const path = `<path d="${pathData(s.segs)}" ${paint}${dash}${s.artClip ? clipOf(s.artClip) : ""}/>`;
    const mixed = s.blend ? `<g style="mix-blend-mode:${s.blend}">${path}</g>` : path;
    body += clip ? `<g${clip}>${mixed}</g>` : mixed;
  }
  return { defs, body };
}

export const label = (text: string, h: number, at: Parameters<typeof textShape>[3], fill: string, out: Shape[]) => {
  const t = textShape(text, "label", { h }, at, 1);
  if (t) out.push({ kind: "path", segs: t.segs, fill });
  return t?.box;
};
const line = (x0: number, y0: number, x1: number, y1: number): Seg[] => [{ op: "M", x: x0, y: y0 }, { op: "L", x: x1, y: y1 }];
export const box = (x: number, y: number, w: number, h: number): Seg[] => [
  { op: "M", x, y }, { op: "L", x: x + w, y }, { op: "L", x: x + w, y: y + h }, { op: "L", x, y: y + h }, { op: "Z" },
];

/** a dimension note beside the piece: "H85mm" with a leader to the print */
function callout(out: Shape[], text: string, from: { x: number; y: number }, to: { x: number; y: number }) {
  out.push({ kind: "path", segs: line(from.x, from.y, to.x, from.y), stroke: GREEN, width: 2 });
  if (to.y !== from.y) out.push({ kind: "path", segs: line(to.x, from.y, to.x, to.y), stroke: GREEN, width: 2 });
  const leftward = to.x < from.x;
  label(text, 15, leftward ? { right: to.x - 8, cy: to.y } : { x: to.x + 8, cy: to.y }, GREEN, out);
}

export function orderSheetSvg(d: BibDesign, art: Art, size: BibSize, counts: Partial<Record<BibSize, number>>, meta: SheetMeta): { svg: string; width: number; height: number } {
  const reversible = d.product === "bib_r";
  const sides = reversible ? (["A", "B"] as const) : (["A"] as const);
  const W = 2400;
  // the back piece ends at 2060 at most, clear of the rib colour box at W - 305 (it used to run 50 px under it);
  // 150 on the left leaves room for the front's print-size notes
  const colW = 860, gapX = 190, left = 150;
  const pA = piecesFor(size, "A");
  const s = Math.min(colW / Math.max(pA.front.w, pA.back.w), 1.6); // px per mm
  const pieceH = Math.max(pA.front.h, pA.back.h) * s;
  const top = 230, rowH = pieceH + 140;
  const H = top + rowH * sides.length + 260;
  const out: Shape[] = [];

  // ---- header
  out.push({ kind: "path", segs: box(0, 0, W, 92), fill: RED });
  const product = d.kit ? `${d.kit.name} ${d.kit.code}` : reversible ? "Reversible Bibs" : "Normal Bibs";
  label(`${meta.ref} ${d.team || ""} ${product} ${SIZE_NAME[size]} size`.replace(/\s+/g, " "), 34, { x: 28, cy: 46 }, "#ffffff", out);
  label(`${meta.date.getFullYear()}.${meta.date.getMonth() + 1}.${meta.date.getDate()}`, 34, { right: W - 28, cy: 46 }, "#ffffff", out);
  label("Colours on screen may differ slightly from the printed bib.", 18, { x: 28, cy: 122 }, INK, out);

  // ---- the pieces
  const k = pA.front.w / BASE_WIDTH;
  sides.forEach((side, row) => {
    const look: SideLook = d.sides[row];
    const pcs = piecesFor(size, side);
    (["front", "back"] as Part[]).forEach((part, col) => {
      const p = pcs[part];
      const x0 = left + col * (colW + gapX), y0 = top + row * rowH;
      const shapes = drawPiece(p, part, look, art, { ribs: ribsFor(size, part) });
      // a fine outline, so a white side still shows its shape on the white sheet
      shapes.push({ kind: "path", segs: parsePath(p.cut), stroke: "#bcbec0", width: 1.5 / s });
      out.push(...moveShapes(shapes, x0, y0, s));
      const name = `${row ? "Reversible " : ""}${part === "front" ? "Front" : "Back"}`;
      label(name, 30, { cx: x0 + (p.w * s) / 2, top: y0 + p.h * s + 40 }, INK, out);
      if (row > 0) return;
      // the print sizes, as on the team's sheets
      const R = x0 + p.w * s + 24;
      if (part === "front") {
        const F = frontLayout(!!art.logoLeft);
        // the note of whatever is on the viewer's left sits left of the piece, as on the team's sheets; the other's right
        const note = (text: string, it: { cx: number; top: number }, reach: number, left = it.cx < 0.5) => {
          const y = y0 + (it.top * p.h + 42 * k) * s;
          const onLeft = left;
          callout(out, text, { x: x0 + (it.cx * p.w + (onLeft ? -reach : reach) * k) * s, y }, { x: onLeft ? x0 - 24 : R, y });
        };
        // the number as drawn: a wide one sits further in and may be smaller (draw.ts frontNumber)
        const fn = art.show.frontNumber && art.number ? frontNumber(p, art) : null;
        // a number in the middle points out on the side away from the logo
        if (fn) note(`H${Math.round(fn.box.h)}mm`, { cx: (fn.box.x + fn.box.w / 2) / p.w, top: art.numberCenter ? fn.box.y / p.h : F.number.top },
          art.numberCenter ? fn.box.w / 2 / k + 6 : art.logoLeft ? 45 : 30, art.numberCenter ? !art.logoLeft : undefined);
        if (art.show.frontLogo && art.logo) note(`H${Math.round(F.logo.h * k * (art.logo.scale ?? 1))}mm`, F.logo, art.logoLeft ? 30 : 45);
        // the sponsors: their printed size, out to their own side of the piece
        for (const sb of sponsorBoxes(p, art)) {
          const y = y0 + (sb.y + sb.h / 2) * s;
          callout(out, `${Math.round(sb.w)}x${Math.round(sb.h)}mm`, { x: x0 + (sb.side === "left" ? sb.x : sb.x + sb.w) * s, y }, { x: sb.side === "left" ? x0 - 24 : R, y });
        }
        const tcy = teamCy(p, art);
        if (art.show.frontTeam && d.team) callout(out, `W${Math.round(F.team.w * k)}mm`, { x: x0 + (0.5 * p.w + 165 * k) * s, y: y0 + tcy * s }, { x: R + 30, y: y0 + tcy * s + 50 * k * s });
      } else {
        const B = LAYOUT.back;
        if (art.show.backName && art.name) callout(out, `H${Math.round(B.name.h * k)}mm`, { x: x0 + (0.5 * p.w + 120 * k) * s, y: y0 + (B.name.top * p.h + 17 * k) * s }, { x: R, y: y0 + (B.name.top * p.h + 17 * k) * s });
        if (art.show.backNumber && art.number) callout(out, `H${Math.round(B.number.h * k)}mm`, { x: x0 + (0.5 * p.w + 120 * k) * s, y: y0 + (B.number.top * p.h + 100 * k) * s }, { x: R, y: y0 + (B.number.top * p.h + 100 * k) * s });
      }
    });
  });

  // ---- rib colours per side, right of its row (under side A's print-size notes), in the CMYK that prints
  sides.forEach((side, row) => {
    const look = d.sides[row];
    const rx = W - 305, ry = top + row * rowH + (row ? pieceH * 0.1 : pieceH * 0.62);
    const title = reversible ? `RIB COLOUR (${row ? "REVERSE" : "FRONT SIDE"})` : "RIB COLOUR";
    if (!look.rib) {
      out.push({ kind: "path", segs: box(rx, ry, 290, 84), stroke: RED, width: 3, fill: "#ffffff" });
      out.push({ kind: "path", segs: box(rx, ry, 290, 36), fill: RED });
      label(title, 16, { cx: rx + 145, cy: ry + 18 }, "#ffffff", out);
      label("No rib bands", 18, { x: rx + 18, cy: ry + 60 }, INK, out);
      return;
    }
    const rib = look.rib;
    out.push({ kind: "path", segs: box(rx, ry, 290, 230), stroke: RED, width: 3, fill: "#ffffff" });
    out.push({ kind: "path", segs: box(rx, ry, 290, 36), fill: RED });
    label(title, 16, { cx: rx + 145, cy: ry + 18 }, "#ffffff", out);
    (["neck", "arm", "hem"] as const).forEach((z, i) => {
      const y = ry + 56 + i * 58;
      out.push({ kind: "path", segs: box(rx + 18, y, 44, 44), fill: rib[z], stroke: "#bcbec0", width: 2 });
      label(z === "neck" ? "Neck" : z === "arm" ? "Sleeves" : "Hem", 18, { x: rx + 76, top: y + 2 }, INK, out);
      label(rib[z] === look.body ? "Same as body" : inkText(rib[z]), 13, { x: rx + 72, top: y + 26 }, MUTE, out);
    });
  });

  // ---- footer
  const fy = H - 230;
  // colours off the factory chart, as converted, so the team can check them
  const off = [...new Set(d.sides.flatMap(sd => [sd.body, sd.patternColor, sd.ink, sd.inkOutline, sd.rib?.neck, sd.rib?.arm, sd.rib?.hem]))]
    .filter((h): h is string => !!h).map(h => ink(h)).filter(i => !i.onChart);
  const notes = [...(meta.notes ?? [])];
  if (off.length) notes.push(`Off-chart colours, converted: ${off.map(i => `${i.hex.toUpperCase()} → ${cmykText(i.cmyk)}`).join("   ")}`);
  notes.reverse().forEach((n, i) => label(n, 18, { x: 28, bottom: fy - 16 - i * 28 }, RED, out));
  out.push({ kind: "path", segs: box(0, fy, W, 86), fill: RED });
  label(`Order Sheet ${meta.ref}`, 48, { cx: W / 2, cy: fy + 43 }, "#ffffff", out);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const bySize = (Object.keys(counts) as BibSize[]).map(z => `${SIZE_NAME[z]} ${counts[z]}`).join(" · ");
  label(`${product} x ${total} pcs  (${bySize})`, 36, { cx: W / 2, top: fy + 112 }, RED, out);
  label(`Fabric : ${meta.fabric ?? (d.kit?.fabric ? `${d.kit.fabric === "mesh" ? "Mesh" : d.kit.fabric} full sublimation` : "Mesh full sublimation")}      Brand : ${meta.brand ?? "OEM"}      Pattern : ${TEMPLATE.code}`, 30, { cx: W / 2, top: fy + 172 }, RED, out);

  const ids = { n: 0 };
  const { defs, body } = svgShapes(out, ids);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><defs>${defs}</defs>${body}</svg>`;
  return { svg, width: W, height: H };
}

/** the sheet as a JPEG, as the team sends theirs */
export function orderSheetJpeg(svg: string, quality = 88): Uint8Array {
  const r = new Resvg(svg, { background: "#ffffff", font: { loadSystemFonts: false } }).render();
  const out = jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, quality);
  return new Uint8Array(out.data);
}
