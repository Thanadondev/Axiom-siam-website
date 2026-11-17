/* Pattern recipes drawn as vector shapes (the advanced designer's "✨ ให้ AI ออกแบบลาย").
   A recipe is a background and up to four layers of motifs; Claude writes them
   (apps/api/src/ai/pattern-spec.ts, the same motif names). Drawn as SVG in mm over
   a piece's frame, then placed on the piece as shapes: they print sharp, in the
   CMYK of their colours. Random motifs follow the layer's seed, so a recipe
   always draws the same. */
(function () {
  "use strict";
  const r2 = n => Math.round(n * 100) / 100;
  const esc = s => String(s).replace(/[^#0-9a-fA-F]/g, "");
  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const poly = pts => "M" + pts.map(p => r2(p[0]) + " " + r2(p[1])).join("L") + "Z";
  const MAX = 1400; // shapes in one layer at most

  /* each motif draws in a D × D square round the frame's middle (the layer is turned about it);
     add(shape) takes { d | circle, fill, stroke, sw, at: [x, y] } and returns false when the layer is full */
  const MOTIFS = {
    stripes(L, add, b) {
      const w = 30 * L.scale, per = w / Math.max(0.1, L.density);
      for (let x = b.x0, i = 0; x < b.x0 + b.D; x += per, i++) if (!add({ d: poly([[x, b.y0], [x + w, b.y0], [x + w, b.y0 + b.D], [x, b.y0 + b.D]]), fill: L.c(i), at: [x + w / 2, b.cy] })) return;
    },
    pinstripes(L, add, b) {
      const w = 3 * L.scale, per = 20 * L.scale * (1.6 - L.density);
      for (let x = b.x0, i = 0; x < b.x0 + b.D; x += per, i++) if (!add({ d: poly([[x, b.y0], [x + w, b.y0], [x + w, b.y0 + b.D], [x, b.y0 + b.D]]), fill: L.c(i), at: [x, b.cy] })) return;
    },
    chevrons(L, add, b) {
      const w = 80 * L.scale, h = 40 * L.scale, t = (6 + 22 * L.density) * L.scale, row = h + t * 1.6;
      for (let y = b.y0, j = 0; y < b.y0 + b.D; y += row, j++) for (let x = b.x0; x < b.x0 + b.D; x += w)
        if (!add({ d: poly([[x, y + h], [x + w / 2, y], [x + w, y + h], [x + w, y + h + t], [x + w / 2, y + t], [x, y + h + t]]), fill: L.c(j), at: [x + w / 2, y + h / 2] })) return;
    },
    diamonds(L, add, b, defs) {
      const id = L.id + "g", c = 110 * L.scale, k = 0.5 * L.density + 0.5;
      defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.c(0)}"/><stop offset="1" stop-color="${L.c(1)}"/></linearGradient>`);
      for (let y = b.y0 - c, j = 0; y < b.y0 + b.D + c; y += c / 2, j++) for (let x = b.x0 - c + (j % 2 ? c / 2 : 0); x < b.x0 + b.D + c; x += c) {
        const cx = x + c / 2, cy = y + c / 2, hw = c / 2 * k;
        if (!add({ d: poly([[cx, cy - hw], [cx + hw, cy], [cx, cy + hw], [cx - hw, cy]]), fill: `url(#${id})`, at: [cx, cy] })) return;
      }
    },
    waves(L, add, b) {
      const wl = 160 * L.scale, amp = 25 * L.scale, t = (10 + 40 * L.density) * L.scale, per = t + 30 * L.scale;
      for (let y = b.y0, j = 0; y < b.y0 + b.D; y += per, j++) {
        const top = [], bot = [];
        for (let x = b.x0; x <= b.x0 + b.D + wl / 16; x += wl / 16) { const s = Math.sin((x / wl) * Math.PI * 2) * amp; top.push([x, y + s]); bot.unshift([x, y + s + t]); }
        if (!add({ d: poly(top.concat(bot)), fill: L.c(j), at: [b.cx, y] })) return;
      }
    },
    halftone(L, add, b) {
      const sp = Math.max(12 * L.scale, b.D / 36);
      for (let y = b.y0, j = 0; y < b.y0 + b.D; y += sp, j++) for (let x = b.x0 + (j % 2 ? sp / 2 : 0); x < b.x0 + b.D; x += sp) {
        const g = L.grow(x, y); if (g < 0.06) continue;
        if (!add({ circle: [x, y, sp * 0.5 * L.density * g + 0.4], fill: L.c(0), at: [x, y], keep: true })) return;
      }
    },
    shards(L, add, b) {
      const n = Math.round(14 + 70 * L.density / (L.scale * L.scale));
      for (let i = 0; i < n; i++) {
        const cx = b.x0 + L.r() * b.D, cy = b.y0 + L.r() * b.D, s = (60 + 140 * L.r()) * L.scale, a = L.r() * Math.PI * 2;
        const pts = [0, 1, 2].map(k => { const t = a + k * 2.1 + L.r() * 0.6, rr = s * (0.35 + 0.65 * L.r()); return [cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]; });
        if (!add({ d: poly(pts), fill: L.c(Math.floor(L.r() * 4)), at: [cx, cy], op: 0.55 + 0.45 * L.r() })) return;
      }
    },
    camo(L, add, b) {
      const r0 = 40 * L.scale, n = Math.round((b.D * b.D) / ((2 * r0) * (2 * r0)) * (0.5 + 1.5 * L.density));
      for (let i = 0; i < n; i++) {
        const cx = b.x0 + L.r() * b.D, cy = b.y0 + L.r() * b.D, rr = r0 * (0.6 + 0.9 * L.r());
        const pts = Array.from({ length: 9 }, (_, k) => { const t = (k / 9) * Math.PI * 2, q = rr * (0.6 + 0.6 * L.r()); return [cx + Math.cos(t) * q * 1.3, cy + Math.sin(t) * q]; });
        // a soft outline: curves through the midpoints
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        let d = "M" + mid(pts[8], pts[0]).map(r2).join(" ");
        pts.forEach((p, k) => { const m = mid(p, pts[(k + 1) % 9]); d += `Q${r2(p[0])} ${r2(p[1])} ${r2(m[0])} ${r2(m[1])}`; });
        if (!add({ d: d + "Z", fill: L.c(i), at: [cx, cy] })) return;
      }
    },
    digicamo(L, add, b) {
      const p = 10 * L.scale, n = Math.round(60 + 160 * L.density);
      for (let i = 0; i < n; i++) {
        let x = b.x0 + Math.floor(L.r() * b.D / p) * p, y = b.y0 + Math.floor(L.r() * b.D / p) * p; const col = L.c(i);
        const cells = 3 + Math.floor(L.r() * 7);
        for (let k = 0; k < cells; k++) {
          if (!add({ d: poly([[x, y], [x + p, y], [x + p, y + p], [x, y + p]]), fill: col, at: [x, y] })) return;
          const dir = Math.floor(L.r() * 4); x += dir === 0 ? p : dir === 1 ? -p : 0; y += dir === 2 ? p : dir === 3 ? -p : 0;
        }
      }
    },
    speedlines(L, add, b) {
      const n = Math.round(20 + 60 * L.density);
      for (let i = 0; i < n; i++) {
        const y = b.y0 + L.r() * b.D, x = b.x0 + L.r() * b.D, len = (150 + 250 * L.r()) * L.scale, w = (2 + 6 * L.r()) * L.scale;
        if (!add({ d: poly([[x, y], [x + len, y - w / 2], [x + len, y + w / 2]]), fill: L.c(i), at: [x + len / 2, y] })) return;
      }
    },
    lightning(L, add, b) {
      // the classic bolt: a broad top, a step across, a long sharp point
      const n = Math.max(1, Math.round(1 + 5 * L.density));
      for (let i = 0; i < n; i++) {
        const w = (90 + 60 * L.r()) * L.scale, h = w * (1.5 + 0.4 * L.r());
        // spread across the piece: one column each, a little up or down
        const x = b.cx - b.W / 2 + ((i + 0.5) / n) * b.W + (L.r() - 0.5) * b.W / n * 0.4, y = b.cy - b.H * 0.38 + L.r() * b.H * 0.4, flip = L.r() < 0.5 ? -1 : 1;
        // the ⚡ outline: down-left from the top, a step back right, then the long point
        const pts = [[0.56, 0], [0, 0.6], [0.5, 0.6], [0.44, 1], [1, 0.4], [0.5, 0.4]].map(p => [x + flip * (p[0] - 0.5) * w, y + p[1] * h]);
        if (!add({ d: poly(pts), fill: L.c(i), at: [x, y + h / 2] })) return;
      }
    },
    prajamyam(L, add, b) {
      // ลายประจำยาม: four pointed petals round a round heart, in a grid, every other row shifted
      const c = 70 * L.scale, pl = c * (0.28 + 0.16 * L.density), pw = pl * 0.55;
      const petal = (cx, cy, a) => {
        const ca = Math.cos(a), sa = Math.sin(a), P = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
        const t = P(pl, 0), l = P(pl * 0.45, -pw), r = P(pl * 0.45, pw), o = P(0, 0);
        return `M${r2(o[0])} ${r2(o[1])}Q${r2(l[0])} ${r2(l[1])} ${r2(t[0])} ${r2(t[1])}Q${r2(r[0])} ${r2(r[1])} ${r2(o[0])} ${r2(o[1])}Z`;
      };
      for (let y = b.y0, j = 0; y < b.y0 + b.D + c; y += c * 0.75, j++) for (let x = b.x0 + (j % 2 ? c / 2 : 0); x < b.x0 + b.D + c; x += c) {
        const d = [0, 1, 2, 3].map(k => petal(x, y, Math.PI / 4 + (k * Math.PI) / 2)).join("");
        if (!add({ d, fill: L.c(0), at: [x, y] })) return;
        if (!add({ circle: [x, y, pl * 0.22], fill: L.c(1), at: [x, y] })) return;
      }
    },
    hexagons(L, add, b) {
      const r = 24 * L.scale, sw = (1 + 4 * L.density) * L.scale, hw = Math.sqrt(3) * r;
      for (let y = b.y0, j = 0; y < b.y0 + b.D + r; y += 1.5 * r, j++) for (let x = b.x0 + (j % 2 ? hw / 2 : 0); x < b.x0 + b.D + hw; x += hw) {
        const pts = Array.from({ length: 6 }, (_, k) => { const t = Math.PI / 6 + (k * Math.PI) / 3; return [x + Math.cos(t) * r, y + Math.sin(t) * r]; });
        if (!add({ d: poly(pts), stroke: L.c(j), sw, at: [x, y] })) return;
      }
    },
    dots(L, add, b) {
      const sp = 36 * L.scale, rr = 11 * L.scale * (0.4 + 0.6 * L.density);
      for (let y = b.y0, j = 0; y < b.y0 + b.D; y += sp, j++) for (let x = b.x0 + (j % 2 ? sp / 2 : 0); x < b.x0 + b.D; x += sp)
        if (!add({ circle: [x, y, rr], fill: L.c(j), at: [x, y] })) return;
    },
    rings(L, add, b) {
      const st = 30 * L.scale, sw = st * (0.15 + 0.45 * L.density);
      for (let r = st, i = 0; r < b.D * 0.72; r += st, i++) if (!add({ circle: [b.cx, b.cy, r], stroke: L.c(i), sw, at: [b.cx + r * 0.7, b.cy + r * 0.7] })) return;
    },
    sash(L, add, b) {
      const w = 120 * L.scale * (0.5 + 0.5 * L.density), e = 6 * L.scale;
      add({ d: poly([[b.x0, b.cy - w / 2], [b.x0 + b.D, b.cy - w / 2], [b.x0 + b.D, b.cy + w / 2], [b.x0, b.cy + w / 2]]), fill: L.c(0), at: [b.cx, b.cy] });
      if (L.n > 1) for (const s of [-1, 1]) add({ d: poly([[b.x0, b.cy + s * (w / 2 + e * 1.5)], [b.x0 + b.D, b.cy + s * (w / 2 + e * 1.5)], [b.x0 + b.D, b.cy + s * (w / 2 + e * 2.5)], [b.x0, b.cy + s * (w / 2 + e * 2.5)]]), fill: L.c(1), at: [b.cx, b.cy] });
    },
    grid(L, add, b) {
      const sp = 40 * L.scale, sw = (0.6 + 2.4 * L.density) * L.scale;
      for (let x = b.x0, i = 0; x < b.x0 + b.D; x += sp, i++) if (!add({ d: poly([[x, b.y0], [x + sw, b.y0], [x + sw, b.y0 + b.D], [x, b.y0 + b.D]]), fill: L.c(0), at: [x, b.cy] })) return;
      for (let y = b.y0; y < b.y0 + b.D; y += sp) if (!add({ d: poly([[b.x0, y], [b.x0 + b.D, y], [b.x0 + b.D, y + sw], [b.x0, y + sw]]), fill: L.c(L.n > 1 ? 1 : 0), at: [b.cx, y] })) return;
    },
    triangles(L, add, b) {
      const s = 60 * L.scale, h = s * Math.sqrt(3) / 2, k = 0.55 + 0.45 * L.density;
      for (let y = b.y0, j = 0; y < b.y0 + b.D; y += h, j++) for (let x = b.x0 - s, i = 0; x < b.x0 + b.D + s; x += s / 2, i++) {
        const up = (i + j) % 2 === 0, pts = up ? [[x, y + h], [x + s / 2, y], [x + s, y + h]] : [[x, y], [x + s, y], [x + s / 2, y + h]];
        const cx = x + s / 2, cy = y + h / 2;
        if (!add({ d: poly(pts.map(p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k])), fill: L.c(i + j), at: [cx, cy] })) return;
      }
    },
    scales(L, add, b) {
      const r = 26 * L.scale, sw = (1 + 3 * L.density) * L.scale;
      for (let y = b.y0, j = 0; y < b.y0 + b.D + r; y += r, j++) for (let x = b.x0 + (j % 2 ? r : 0); x < b.x0 + b.D + r; x += 2 * r)
        if (!add({ d: `M${r2(x - r)} ${r2(y)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(x + r)} ${r2(y)}`, stroke: L.c(j), sw, open: true, at: [x, y] })) return;
    },
  };

  /** how far toward the fade's side a point is, 0–1 (none: 1) */
  function toward(fade, x, y, W, H) {
    if (fade === "down") return y / H;
    if (fade === "up") return 1 - y / H;
    if (fade === "right") return x / W;
    if (fade === "left") return 1 - x / W;
    if (fade === "center") return 1 - Math.min(1, Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2));
    return 1;
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));

  /** a recipe drawn over a W × H mm frame: { svg, shapes } */
  function render(spec, W, H) {
    const defs = [], body = [];
    const cx = W / 2, cy = H / 2, D = Math.hypot(W, H) * 1.02;
    const bg = spec.background || { type: "solid", colors: ["#ffffff"] }, bc = (bg.colors || ["#ffffff"]).map(esc);
    const bleed = 20;
    if (bg.type === "solid" || bc.length < 2) body.push(`<rect x="${-bleed}" y="${-bleed}" width="${W + 2 * bleed}" height="${H + 2 * bleed}" fill="${bc[0]}"/>`);
    else {
      const stops = bc.map((c, i) => `<stop offset="${r2(i / (bc.length - 1))}" stop-color="${c}"/>`).join("");
      if (bg.type === "radial") defs.push(`<radialGradient id="bgg" gradientUnits="userSpaceOnUse" cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(Math.hypot(W, H) / 2)}">${stops}</radialGradient>`);
      else { const a = ((bg.angle ?? 90) * Math.PI) / 180, dx = Math.cos(a) * D / 2, dy = Math.sin(a) * D / 2; defs.push(`<linearGradient id="bgg" gradientUnits="userSpaceOnUse" x1="${r2(cx - dx)}" y1="${r2(cy - dy)}" x2="${r2(cx + dx)}" y2="${r2(cy + dy)}">${stops}</linearGradient>`); }
      body.push(`<rect x="${-bleed}" y="${-bleed}" width="${W + 2 * bleed}" height="${H + 2 * bleed}" fill="url(#bgg)"/>`);
    }
    let shapes = 1;
    (spec.layers || []).slice(0, 4).forEach((layer, li) => {
      const draw = MOTIFS[layer.motif]; if (!draw) return;
      const cols = (layer.colors && layer.colors.length ? layer.colors : ["#231f20"]).map(esc);
      const ang = ((layer.angle || 0) * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      const turn = (x, y) => [cx + (x - cx) * ca - (y - cy) * sa, cy + (x - cx) * sa + (y - cy) * ca];
      const fade = layer.fade || "none", baseOp = clamp01(layer.opacity ?? 1);
      const L = {
        id: "l" + li, n: cols.length, c: i => cols[((i % cols.length) + cols.length) % cols.length],
        scale: Math.min(3, Math.max(0.3, layer.scale || 1)), density: Math.min(1, Math.max(0.1, layer.density ?? 0.6)),
        r: rng(layer.seed || li + 1),
        grow: (x, y) => { const p = turn(x, y); return fade === "none" ? 1 : clamp01(toward(fade, p[0], p[1], W, H)); },
      };
      const out = [];
      const add = s => {
        if (out.length >= MAX) return false;
        const p = turn(s.at[0], s.at[1]);
        // outside the frame entirely: not drawn
        if (p[0] < -D * 0.2 || p[0] > W + D * 0.2 || p[1] < -D * 0.2 || p[1] > H + D * 0.2) return true;
        let op = baseOp * (s.op ?? 1);
        if (!s.keep && fade !== "none") op *= 1 - 0.95 * clamp01(toward(fade, p[0], p[1], W, H));
        if (op < 0.03) return true;
        const paint = s.stroke ? `fill="none" stroke="${s.stroke}" stroke-width="${r2(s.sw)}" stroke-linejoin="round"` : `fill="${s.fill}"`;
        const see = op < 0.999 ? ` opacity="${r2(op)}"` : "";
        out.push(s.circle ? `<circle cx="${r2(s.circle[0])}" cy="${r2(s.circle[1])}" r="${r2(s.circle[2])}" ${paint}${see}/>` : `<path d="${s.d}" ${paint}${see}/>`);
        return true;
      };
      draw(L, add, { x0: cx - D / 2, y0: cy - D / 2, D, cx, cy, W, H }, defs);
      shapes += out.length;
      body.push(`<g transform="rotate(${r2(layer.angle || 0)} ${r2(cx)} ${r2(cy)})">${out.join("")}</g>`);
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H)}" width="${r2(W)}" height="${r2(H)}"><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    return { svg, shapes };
  }

  /** ready-made recipes: to try the drawing without the AI, and for its examples */
  const EXAMPLES = [
    { name: "สายฟ้าเหลืองดำ", background: { type: "linear", colors: ["#231f20", "#414042"], angle: 90 }, layers: [
      { motif: "speedlines", colors: ["#58595b"], scale: 1, angle: -25, density: 0.7, opacity: 0.8, fade: "down", seed: 3 },
      { motif: "lightning", colors: ["#fff200", "#fdb913"], scale: 1.1, angle: 0, density: 0.5, opacity: 1, fade: "none", seed: 11 }] },
    { name: "ข้าวหลามตัดชมพู", background: { type: "solid", colors: ["#d81b72"], angle: 90 }, layers: [
      { motif: "diamonds", colors: ["#d81b72", "#f47ab4"], scale: 1, angle: 0, density: 1, opacity: 1, fade: "none", seed: 1 }] },
    { name: "คลื่นทะเลญี่ปุ่น", background: { type: "linear", colors: ["#0b1f5c", "#1c75bc"], angle: 90 }, layers: [
      { motif: "waves", colors: ["#27aae1", "#ffffff"], scale: 0.8, angle: -8, density: 0.4, opacity: 0.55, fade: "up", seed: 2 },
      { motif: "scales", colors: ["#ffffff"], scale: 0.7, angle: 0, density: 0.3, opacity: 0.18, fade: "down", seed: 4 }] },
    { name: "ฮาล์ฟโทนแดงไล่ลง", background: { type: "solid", colors: ["#ffffff"], angle: 90 }, layers: [
      { motif: "halftone", colors: ["#ed1c24"], scale: 0.9, angle: 0, density: 1, opacity: 1, fade: "down", seed: 1 },
      { motif: "sash", colors: ["#be1e2d", "#231f20"], scale: 1, angle: -35, density: 0.7, opacity: 1, fade: "none", seed: 1 }] },
    { name: "พรางดิจิทัลเทา", background: { type: "solid", colors: ["#58595b"], angle: 90 }, layers: [
      { motif: "digicamo", colors: ["#808285", "#414042", "#a7a9ac"], scale: 1, angle: 0, density: 0.9, opacity: 1, fade: "none", seed: 9 }] },
    { name: "ประจำยามทองบนแดง", background: { type: "linear", colors: ["#be1e2d", "#7a1416"], angle: 90 }, layers: [
      { motif: "prajamyam", colors: ["#fdb913", "#ffffff"], scale: 0.9, angle: 0, density: 0.7, opacity: 0.9, fade: "none", seed: 1 }] },
    { name: "เศษแก้วม่วงส้ม", background: { type: "linear", colors: ["#2e3192", "#92278f"], angle: 60 }, layers: [
      { motif: "shards", colors: ["#f7941d", "#ec008c", "#ffffff"], scale: 1, angle: 0, density: 0.6, opacity: 0.7, fade: "center", seed: 5 }] },
  ];

  window.AXIOM_AI_PATTERN = { render, EXAMPLES, MOTIFS: Object.keys(MOTIFS) };
})();
