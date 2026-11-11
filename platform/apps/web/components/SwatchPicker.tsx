"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

/**
 * Colour picker over the production palette (palette.js — the same DTP chart
 * the factory prints from, ~280 swatches).
 *
 * Laid out as the paper chart is (DTP-28color-cs4.svg): 28 rows of 10, each row
 * one colour family from full strength to light, in the chart's own numbers
 * (0001-0280), so the customer and the print floor point at the same swatch.
 * The number and CMYK are surfaced because that — not the hex — is what the
 * print floor works from.
 */

/** c: screen colour, k: the CMYK the factory prints, n: the swatch's number on the paper chart (0001-0280) */
export interface Swatch { c: string; k: string; n?: string }

/** a swatch as the print floor names it: "0031 · C0 M75 Y100 K0" */
export const swatchLabel = (s: Swatch) => (s.n ? `${s.n} · ${s.k}` : s.k);

/**
 * The chart swatch nearest a colour typed in by hex, so every colour on a kit is one the
 * factory prints from its chart. White is the fabric left unprinted and stays white.
 */
export function nearestSwatch(palette: Swatch[], hex: string): Swatch | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !palette.length) return null;
  const rgb = (h: string) => { const v = parseInt(h.replace("#", ""), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const [r, g, b] = rgb(m[1]);
  let best: Swatch | null = null, bestD = Infinity;
  for (const s of palette) {
    const [r2, g2, b2] = rgb(s.c);
    // weighted for how the eye sees red, green and blue
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

declare global {
  interface Window { AXIOM_PALETTE?: Swatch[] }
}

/** loads /designer/palette.js once and hands back the swatches */
export function usePalette(): Swatch[] {
  const [pal, setPal] = useState<Swatch[]>([]);
  useEffect(() => {
    if (window.AXIOM_PALETTE) { setPal(window.AXIOM_PALETTE); return; }
    const existing = document.getElementById("axiom-palette");
    const done = () => setPal(window.AXIOM_PALETTE ?? []);
    if (existing) { existing.addEventListener("load", done); return; }
    const s = document.createElement("script");
    s.id = "axiom-palette";
    s.src = "/designer/palette.js";
    s.onload = done;
    document.head.appendChild(s);
  }, []);
  return pal;
}

/** the chart's rows: ten swatches each, in its order */
function chartRows(palette: Swatch[]): Swatch[][] {
  const sorted = [...palette].sort((a, b) => (a.n ?? "").localeCompare(b.n ?? ""));
  const rows: Swatch[][] = [];
  for (let i = 0; i < sorted.length; i += 10) rows.push(sorted.slice(i, i + 10));
  return rows;
}

export default function SwatchPicker({
  value, onChange, label, allowNone = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  allowNone?: boolean;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const rows = useMemo(() => chartRows(palette), [palette]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return palette.filter(s => s.c.toLowerCase().includes(term) || s.k.toLowerCase().includes(term) || (s.n ?? "").includes(term));
  }, [q, palette]);

  const current = palette.find(s => s.c.toLowerCase() === value?.toLowerCase());

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <label className="flabel" style={{ margin: 0 }}>{label}</label>
        <span className="dim" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>
          {current ? swatchLabel(current) : value === "none" ? "ไม่มีสี" : value}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "8px 10px", borderRadius: 10, cursor: "pointer",
          border: "1px solid var(--border)", background: "var(--surface, #fff)",
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          background: value === "none" ? "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50% / 10px 10px" : value,
          border: "1px solid rgba(0,0,0,.15)",
        }} />
        <span style={{ fontSize: 13, flex: 1, textAlign: "left" }}>{open ? "ปิดจานสี" : "เลือกสี"}</span>
        <span className="dim" style={{ fontSize: 11 }}>{palette.length} สี</span>
      </button>

      {open && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, marginTop: 8, padding: 10, maxHeight: 340, overflowY: "auto" }}>
          <input
            className="ainput"
            placeholder="ค้นหา เช่น 0031, C100 M0 หรือ #ec008c"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ marginBottom: 10 }}
          />

          {allowNone && !q && (
            <Row label="ไม่มีสี (โปร่ง)">
              <Chip hex="none" active={value === "none"} onPick={() => { onChange("none"); setOpen(false); }} title="ไม่มีสี" />
            </Row>
          )}

          {filtered ? (
            filtered.length === 0
              ? <p className="dim" style={{ padding: "8px 2px" }}>ไม่พบสีที่ตรงกับ “{q}”</p>
              : <Grid swatches={filtered} value={value} onPick={h => { onChange(h); setOpen(false); }} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "34px repeat(10, minmax(0, 1fr))", gap: 4, alignItems: "center" }}>
              {rows.map(row => (
                <Fragment key={row[0].c}>
                  <span className="dim" style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}>{row[0].n}</span>
                  {row.map(s => (
                    <Chip key={s.c} hex={s.c} title={swatchLabel(s)} active={value?.toLowerCase() === s.c.toLowerCase()} onPick={() => { onChange(s.c); setOpen(false); }} />
                  ))}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="dim" style={{ fontSize: 11, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function Grid({ swatches, value, onPick }: { swatches: Swatch[]; value: string; onPick: (hex: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(24px, 1fr))", gap: 4 }}>
      {swatches.map(s => (
        <Chip key={s.c} hex={s.c} title={swatchLabel(s)} active={value?.toLowerCase() === s.c.toLowerCase()} onPick={() => onPick(s.c)} />
      ))}
    </div>
  );
}

function Chip({ hex, title, active, onPick }: { hex: string; title: string; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onPick}
      style={{
        width: "100%", aspectRatio: "1", borderRadius: 5, cursor: "pointer", padding: 0,
        background: hex === "none" ? "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50% / 8px 8px" : hex,
        // the ring has to survive on a white swatch, so it sits outside the chip
        border: active ? "2px solid var(--brand)" : "1px solid rgba(0,0,0,.14)",
        outline: active ? "2px solid var(--brand)" : "none",
        outlineOffset: 1,
      }}
    />
  );
}
