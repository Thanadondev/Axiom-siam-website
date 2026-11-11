/**
 * SVG path data as absolute moves, lines and cubic curves — the only drawing
 * the print file and the order sheet need. Template cut lines, rib bands and
 * outlined text all come through here.
 */

export type Seg =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

const TOKEN = /([MmLlHhVvCcQqZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;

/** parses M L H V C Q Z (absolute or relative); quadratics become cubics */
export function parsePath(d: string): Seg[] {
  const out: Seg[] = [];
  const toks: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) toks.push(m[1] ?? Number(m[2]));
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  const num = () => {
    const v = toks[i++];
    if (typeof v !== "number") throw new Error(`bad path data near "${String(v)}"`);
    return v;
  };
  while (i < toks.length) {
    if (typeof toks[i] === "string") cmd = toks[i++] as string;
    else if (!cmd) throw new Error("path data must start with a command");
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M":
        x = ox + num(); y = oy + num(); sx = x; sy = y;
        out.push({ op: "M", x, y });
        cmd = rel ? "l" : "L"; // further pairs are lines
        break;
      case "L": x = ox + num(); y = oy + num(); out.push({ op: "L", x, y }); break;
      case "H": x = ox + num(); out.push({ op: "L", x, y }); break;
      case "V": y = oy + num(); out.push({ op: "L", x, y }); break;
      case "C": {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num();
        x = ox + num(); y = oy + num();
        out.push({ op: "C", x1, y1, x2, y2, x, y });
        break;
      }
      case "Q": {
        const qx = ox + num(), qy = oy + num(), ex = ox + num(), ey = oy + num();
        out.push({ op: "C", x1: x + (2 / 3) * (qx - x), y1: y + (2 / 3) * (qy - y), x2: ex + (2 / 3) * (qx - ex), y2: ey + (2 / 3) * (qy - ey), x: ex, y: ey });
        x = ex; y = ey;
        break;
      }
      case "Z": out.push({ op: "Z" }); x = sx; y = sy; break;
      default: throw new Error(`unsupported path command ${cmd}`);
    }
  }
  return out;
}

/** scale then move */
export function mapPath(segs: Seg[], k: number, dx: number, dy: number): Seg[] {
  return segs.map(s => s.op === "Z" ? s
    : s.op === "C" ? { op: "C", x1: s.x1 * k + dx, y1: s.y1 * k + dy, x2: s.x2 * k + dx, y2: s.y2 * k + dy, x: s.x * k + dx, y: s.y * k + dy }
    : { op: s.op, x: s.x * k + dx, y: s.y * k + dy });
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

export function pathData(segs: Seg[]): string {
  return segs.map(s => s.op === "Z" ? "Z"
    : s.op === "C" ? `C${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}`
    : `${s.op}${n(s.x)} ${n(s.y)}`).join("");
}

export interface Box { x: number; y: number; w: number; h: number }

/** bounds of what's drawn (curves sampled, so a glyph's height is its ink, not its control points) */
export function bounds(segs: Seg[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  let px = 0, py = 0;
  for (const s of segs) {
    if (s.op === "Z") continue;
    if (s.op === "C") {
      for (let i = 1; i < 16; i++) {
        const t = i / 16, u = 1 - t;
        add(u * u * u * px + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x,
            u * u * u * py + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y);
      }
    }
    add(s.x, s.y);
    px = s.x; py = s.y;
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
