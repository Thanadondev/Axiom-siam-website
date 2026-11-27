/**
 * A design from the advanced designer (public/designer): a saved order is
 * "axiom-roster" (the design under `template`), a plain saved design
 * "axiom-designer". It draws on the bib's pattern (CB-005): "แบบ 2" (both sides)
 * is an R-bib, else an N-bib — the API decides the same way (orders/pricing.ts
 * fromDesigner); checkout and the production board read it from here.
 */
export interface DesignerDoc { app: "axiom-roster" | "axiom-designer"; style?: number; template?: { style?: number }; printId?: string }

export function designerDoc(snap: unknown): DesignerDoc | null {
  const s = snap as { app?: unknown } | null | undefined;
  return s && typeof s === "object" && (s.app === "axiom-roster" || s.app === "axiom-designer") ? (s as DesignerDoc) : null;
}

/** the bib an advanced design is priced and made as, or null for anything else */
export function designerBib(snap: unknown): "bib_n" | "bib_r" | null {
  const d = designerDoc(snap);
  if (!d) return null;
  return Number(d.style ?? d.template?.style) === 2 ? "bib_r" : "bib_n";
}
