"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Colour picker over the production palette (palette.js — the same DTP chart
 * the factory prints from, ~280 swatches).
 *
 * 280 flat swatches is a wall of colour nobody can scan, so they're grouped by
 * hue and collapsed to one row per family until you open it. The CMYK code is
 * surfaced because that — not the hex — is what the print floor works from.
 */

export interface Swatch { c: string; k: string }

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

// ---------- hue grouping ----------
function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

const GROUPS: { id: string; label: string; test: (h: number, s: number, l: number) => boolean }[] = [
  { id: "mono", label: "ขาว-เทา-ดำ", test: (_h, s) => s < 0.12 },
  { id: "red", label: "แดง", test: h => h < 15 || h >= 345 },
  { id: "orange", label: "ส้ม", test: h => h >= 15 && h < 45 },
  { id: "yellow", label: "เหลือง", test: h => h >= 45 && h < 70 },
  { id: "green", label: "เขียว", test: h => h >= 70 && h < 165 },
  { id: "cyan", label: "ฟ้า", test: h => h >= 165 && h < 200 },
  { id: "blue", label: "น้ำเงิน", test: h => h >= 200 && h < 255 },
  { id: "purple", label: "ม่วง", test: h => h >= 255 && h < 300 },
  { id: "pink", label: "ชมพู", test: h => h >= 300 && h < 345 },
];

function groupOf(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return (GROUPS.find(g => g.test(h, s, l)) ?? GROUPS[0]).id;
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

  const grouped = useMemo(() => {
    const by: Record<string, Swatch[]> = {};
    for (const sw of palette) {
      const g = groupOf(sw.c);
      (by[g] ??= []).push(sw);
    }
    // sort each family light -> dark so it reads like a paint chart
    for (const k of Object.keys(by)) by[k].sort((a, b) => hexToHsl(b.c)[2] - hexToHsl(a.c)[2]);
    return by;
  }, [palette]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return palette.filter(s => s.c.toLowerCase().includes(term) || s.k.toLowerCase().includes(term));
  }, [q, palette]);

  const current = palette.find(s => s.c.toLowerCase() === value?.toLowerCase());

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <label className="flabel" style={{ margin: 0 }}>{label}</label>
        <span className="dim" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
          {current?.k ?? (value === "none" ? "ไม่มีสี" : value)}
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
            placeholder="ค้นหา เช่น C100 M0 หรือ #ec008c"
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
            GROUPS.filter(g => grouped[g.id]?.length).map(g => (
              <Row key={g.id} label={`${g.label} (${grouped[g.id].length})`}>
                <Grid swatches={grouped[g.id]} value={value} onPick={h => { onChange(h); setOpen(false); }} />
              </Row>
            ))
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
        <Chip key={s.c} hex={s.c} title={s.k} active={value?.toLowerCase() === s.c.toLowerCase()} onPick={() => onPick(s.c)} />
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
