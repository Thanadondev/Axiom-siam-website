/**
 * The pattern sheet that travels down the production line on /process:
 * one football shirt (front, back, two sleeves, collar) laid out on a print
 * sheet of 1000 × 600 px, which is 1.8 × 1.08 m of fabric (0.0018 m/px).
 *
 * The same outlines are drawn on the designer's screen, printed (mirrored)
 * on the sublimation paper, transferred to the fabric, cut by the laser and
 * checked at QC, so every station shows the same job.
 */

export const SHEET_W = 1000;
export const SHEET_H = 600;
export const M_PER_PX = 0.0018;

export type Pt = [number, number];
export interface Piece {
  id: "front" | "back" | "sleeveL" | "sleeveR" | "collar";
  /** closed outline in sheet px, y down */
  pts: Pt[];
  /** centre in sheet px */
  c: Pt;
}

export interface PrintColors { body: string; sleeve: string; trim: string; stripe: string; number: string }

const quad = (a: Pt, ctl: Pt, b: Pt, n = 14): Pt[] => {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * ctl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctl[1] + t * t * b[1]]);
  }
  return out;
};

function body(x0: number, y0: number, vneck: boolean): Pt[] {
  const P = (x: number, y: number): Pt => [x0 + x, y0 + y];
  const neckL = P(78, 0), neckR = P(222, 0), shR = P(300, 34), uaR = P(272, 178), hemR = P(282, 520), hemL = P(18, 520), uaL = P(28, 178), shL = P(0, 34);
  const pts: Pt[] = [neckL];
  if (vneck) pts.push(P(150, 92), neckR);
  else pts.push(...quad(neckL, P(150, 34), neckR));
  pts.push(shR, ...quad(shR, P(256, 118), uaR), hemR, hemL, uaL, ...quad(uaL, P(44, 118), shL));
  return pts;
}

function sleeve(x0: number, y0: number): Pt[] {
  const P = (x: number, y: number): Pt => [x0 + x, y0 + y];
  const hemL = P(28, 180), hemR = P(212, 180), capR = P(240, 62), capL = P(0, 62);
  return [hemL, hemR, capR, ...quad(capR, P(120, -58), capL, 20)];
}

const rect = (x0: number, y0: number, w: number, h: number): Pt[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];

const centre = (pts: Pt[]): Pt => {
  let x = 0, y = 0;
  pts.forEach(p => { x += p[0]; y += p[1]; });
  return [x / pts.length, y / pts.length];
};

export const PIECES: Piece[] = ([
  ["front", body(24, 44, true)],
  ["back", body(354, 44, false)],
  ["sleeveL", sleeve(708, 52)],
  ["sleeveR", sleeve(708, 268)],
  ["collar", rect(708, 486, 240, 30)],
] as [Piece["id"], Pt[]][]).map(([id, pts]) => ({ id, pts, c: centre(pts) }));

export function tracePiece(x: CanvasRenderingContext2D, p: Piece) {
  x.beginPath();
  p.pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.closePath();
}

/** the printed artwork inside one piece (ctx already in sheet space) */
export function paintPiece(x: CanvasRenderingContext2D, p: Piece, col: PrintColors) {
  x.save();
  tracePiece(x, p);
  x.clip();
  const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
  const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
  if (p.id === "front" || p.id === "back") {
    x.fillStyle = col.body; x.fillRect(bx, by, bw, bh);
    // halftone that fades across the body
    x.fillStyle = "rgba(0,0,0,.08)";
    for (let yy = by; yy < by + bh; yy += 9) for (let xx = bx; xx < bx + bw; xx += 9) {
      const r = 0.4 + 2.2 * ((yy - by) / bh);
      x.beginPath(); x.arc(xx + (((yy - by) / 9) % 2) * 4.5, yy, r, 0, Math.PI * 2); x.fill();
    }
    // the diagonal band, trimmed in white
    x.save();
    x.translate(bx + bw / 2, by + bh * 0.42);
    x.rotate(p.id === "front" ? -0.5 : 0.5);
    x.fillStyle = col.trim; x.fillRect(-bw, -40, bw * 2, 80);
    x.fillStyle = col.stripe; x.fillRect(-bw, -32, bw * 2, 64);
    x.restore();
    x.fillStyle = col.trim; x.fillRect(bx, by + bh - 14, bw, 14);
    if (p.id === "front") {
      // crest and wordmark on the chest
      const cx = bx + bw * 0.7, cy = by + 118;
      x.fillStyle = col.number;
      x.beginPath(); x.moveTo(cx - 22, cy - 26); x.lineTo(cx + 22, cy - 26); x.lineTo(cx + 22, cy + 4); x.quadraticCurveTo(cx, cy + 30, cx - 22, cy + 4); x.closePath(); x.fill();
      x.fillStyle = col.stripe;
      x.beginPath(); x.moveTo(cx, cy - 18); x.lineTo(cx + 12, cy + 8); x.lineTo(cx - 12, cy + 8); x.closePath(); x.fill();
      x.fillStyle = col.number; x.font = '400 26px "Anton", sans-serif'; x.textAlign = "left";
      x.fillText("AXIOM", bx + 42, by + 128);
    } else {
      x.fillStyle = col.number; x.textAlign = "center";
      x.font = '400 40px "Anton", sans-serif';
      x.fillText("AXIOM", bx + bw / 2, by + 150);
      x.font = '400 190px "Anton", sans-serif';
      x.fillText("10", bx + bw / 2, by + 360);
    }
  } else if (p.id === "collar") {
    x.fillStyle = col.trim; x.fillRect(bx, by, bw, bh);
    x.fillStyle = col.stripe; x.fillRect(bx, by + bh / 2 - 3, bw, 6);
  } else {
    x.fillStyle = col.sleeve; x.fillRect(bx, by, bw, bh);
    x.fillStyle = col.trim; x.fillRect(bx, by + bh - 20, bw, 12);
    x.fillStyle = col.stripe; x.fillRect(bx, by + bh - 28, bw, 5);
  }
  x.restore();
}

/**
 * The whole sheet. `mirror` for sublimation paper (it prints back to front so it
 * reads right once pressed onto the fabric); `ground` is the paper or fabric colour.
 */
export function drawSheet(c: HTMLCanvasElement, col: PrintColors, opts: { mirror?: boolean; ground?: string; marks?: boolean } = {}) {
  const x = c.getContext("2d")!;
  const s = c.width / SHEET_W;
  x.save();
  x.fillStyle = opts.ground ?? "#f4f3ef";
  x.fillRect(0, 0, c.width, c.height);
  if (opts.mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.scale(s, c.height / SHEET_H);
  PIECES.forEach(p => paintPiece(x, p, col));
  if (opts.marks) {
    // registration marks in the corners, the way the printer lays a job out
    x.strokeStyle = "rgba(20,20,20,.5)"; x.lineWidth = 2;
    for (const [mx, my] of [[10, 10], [990, 10], [10, 590], [990, 590]]) {
      x.beginPath(); x.moveTo(mx - 8, my); x.lineTo(mx + 8, my); x.moveTo(mx, my - 8); x.lineTo(mx, my + 8); x.stroke();
    }
  }
  x.restore();
}

export interface CutPath { pts: Pt[]; len: number[]; total: number; /** segment i (pts[i] → pts[i+1]) cuts; false = a travel move between pieces */ cut: boolean[] }

/** every outline end to end, for the laser's path */
export function cutPath(): CutPath {
  const pts: Pt[] = [];
  const cut: boolean[] = [];
  PIECES.forEach((p, k) => {
    if (k) cut.push(false); // travel from the last piece to this one
    p.pts.forEach((q, i) => { pts.push(q); if (i) cut.push(true); });
    pts.push(p.pts[0]); cut.push(true);
  });
  const len: number[] = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1], cut };
}

/** the point a fraction `f` along the path */
export function pathAt(path: CutPath, f: number): { p: Pt; i: number } {
  const d = Math.max(0, Math.min(1, f)) * path.total;
  let lo = 0, hi = path.len.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.len[m] <= d) lo = m; else hi = m; }
  const a = path.pts[lo], b = path.pts[hi];
  const seg = path.len[hi] - path.len[lo] || 1;
  const t = (d - path.len[lo]) / seg;
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i: lo };
}
