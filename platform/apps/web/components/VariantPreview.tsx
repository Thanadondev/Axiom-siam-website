"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SwatchPicker from "./SwatchPicker";
import { apiFetch } from "../lib/api";
import { SIZES, TRIMS, variantFromState, type Variant } from "../lib/garment-options";

export type { Variant };

/**
 * Live colourway preview for a marketplace template.
 *
 * Renders the garment by embedding the real designer in ?preview=1 mode rather
 * than reimplementing it. That matters: the editor already knows the true
 * pattern outlines (real cm per size), trim geometry and colour handling — a
 * second renderer would drift, and a buyer would end up approving a shirt that
 * doesn't match what gets printed.
 */

export default function VariantPreview({
  templateId,
  onVariantChange,
}: {
  templateId: string;
  onVariantChange?: (v: Variant) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [watermarked, setWatermarked] = useState(false);
  const [v, setV] = useState<Variant | null>(null);
  const doc = useRef<any>(null);

  // 1. fetch the design state (guests allowed — they get a watermark)
  useEffect(() => {
    let dead = false;
    apiFetch<{ stateJson: any; watermark: boolean }>(`/templates/${templateId}/preview-state`)
      .then(r => {
        if (dead) return;
        doc.current = r.stateJson;
        setWatermarked(r.watermark);
        // seed the controls from what the designer saved (handles legacy shapes)
        setV(variantFromState(r.stateJson));
      })
      .catch(e => !dead && setErr(e.message));
    return () => { dead = true; };
  }, [templateId]);

  const post = useCallback((msg: any) => {
    frame.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // 2. the editor tells us when it can accept messages
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data || {};
      if (m.type === "axiom-ready") setReady(true);
      if (m.type === "axiom-variant-ready") setLoading(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // 3. once both the frame and the doc are here, load it
  useEffect(() => {
    if (!ready || !doc.current) return;
    post({ type: "axiom-open", doc: doc.current, watermark: watermarked });
    setLoading(false);
  }, [ready, watermarked, post]);

  // 4. every control change repaints the garment in place
  const apply = (patch: Partial<Variant>) => {
    setV(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      setLoading(true);
      post({ type: "axiom-set-variant", ...next });
      onVariantChange?.(next);
      // never let a dropped message strand the spinner
      setTimeout(() => setLoading(false), 1200);
      return next;
    });
  };

  if (err) return <div className="acard"><p style={{ color: "var(--err, #dc2626)", fontSize: 13 }}>⚠ {err}</p></div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="acard" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <iframe
          ref={frame}
          src="/designer/index.html?preview=1"
          title="ตัวอย่างเสื้อ"
          style={{ width: "100%", height: 460, border: 0, display: "block", background: "#fff" }}
        />
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            background: "rgba(255,255,255,.6)", pointerEvents: "none",
          }}>
            <span className="asub">กำลังวาด…</span>
          </div>
        )}
        {watermarked && (
          <div className="dim" style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
            ตัวอย่างมีลายน้ำ — ซื้อแล้วลายน้ำจะหายไป และเปิดแก้ไขในดีไซเนอร์ได้
          </div>
        )}
      </div>

      {v && (
        <div className="acard">
          <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>ลองเปลี่ยนสี</h3>
          <p className="asub" style={{ marginBottom: 14 }}>เลือกได้ทุกสีในชาร์ตที่โรงงานพิมพ์จริง · เห็นผลทันที</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
            <SwatchPicker label="สีพื้นเสื้อ" value={v.bodyColor} onChange={c => apply({ bodyColor: c })} />
            <SwatchPicker label="สีขลิบ" value={v.trimColor} onChange={c => apply({ trimColor: c })} allowNone />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginTop: 16 }}>
            <div>
              <label className="flabel" style={{ margin: "0 0 6px" }}>ไซซ์</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SIZES.map(s => (
                  <button
                    key={s}
                    className={`minibtn${v.size === s ? " solid" : ""}`}
                    onClick={() => apply({ size: s })}
                    style={{ minWidth: 46 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flabel" style={{ margin: "0 0 6px" }}>ขลิบ</label>
              <select className="ainput" value={v.trim} onChange={e => apply({ trim: e.target.value })}>
                {TRIMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <p className="dim" style={{ marginTop: 12, fontSize: 11.5 }}>
            ไซซ์เปลี่ยนทรงแพทเทิร์นจริงตามเซนติเมตรที่ใช้ตัด ไม่ได้ย่อ-ขยายรูป
          </p>
        </div>
      )}
    </div>
  );
}
