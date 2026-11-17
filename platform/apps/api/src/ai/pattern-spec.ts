import { z } from "zod";
import CHART from "../bibs/dtp-chart.json";

/**
 * A full-print pattern as a recipe, not a picture: a background and up to four
 * layers of vector motifs. The designer draws it (public/designer/ai-patterns.js,
 * same motif names) as shapes on each piece, so it prints sharp at any size and
 * in the CMYK of its colours. Claude writes these from a customer's words.
 */
export const MOTIFS = [
  "stripes", "pinstripes", "chevrons", "diamonds", "waves", "halftone", "shards", "camo", "digicamo",
  "speedlines", "lightning", "hexagons", "dots", "rings", "sash", "grid", "triangles", "scales",
] as const;
export const FADES = ["none", "up", "down", "left", "right", "center"] as const;
export const BACKGROUNDS = ["solid", "linear", "radial"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(s => s.toLowerCase());
/** a number kept in range; anything else becomes the default (a model's slip shouldn't lose the whole pattern) */
const within = (lo: number, hi: number, d: number) => z.number().finite().catch(d).transform(v => Math.min(hi, Math.max(lo, v)));

export const LayerSchema = z.object({
  motif: z.enum(MOTIFS),
  colors: z.array(hex).min(1).max(4),
  scale: within(0.3, 3, 1),
  angle: within(-180, 180, 0),
  density: within(0.1, 1, 0.6),
  opacity: within(0.1, 1, 1),
  fade: z.enum(FADES).catch("none"),
  seed: z.number().int().catch(1).transform(v => Math.abs(v) % 100000),
});

export const PatternSpecSchema = z.object({
  name: z.string().trim().min(1).max(40).catch("ลาย AI"),
  background: z.object({
    type: z.enum(BACKGROUNDS).catch("solid"),
    colors: z.array(hex).min(1).max(4),
    angle: within(-180, 180, 90),
  }),
  layers: z.array(LayerSchema).max(4),
});
export type PatternSpec = z.infer<typeof PatternSpecSchema>;

/** each pattern on its own: one the model got wrong is dropped, the others kept */
export function readPatterns(raw: unknown): PatternSpec[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { patterns?: unknown }).patterns) ? (raw as { patterns: unknown[] }).patterns : [];
  return list.slice(0, 4).map(p => PatternSpecSchema.safeParse(p)).filter(r => r.success).map(r => r.data as PatternSpec);
}

/** the reply's shape for structured outputs (ranges and colours are checked again by readPatterns) */
const layerJson = {
  type: "object",
  additionalProperties: false,
  required: ["motif", "colors", "scale", "angle", "density", "opacity", "fade", "seed"],
  properties: {
    motif: { type: "string", enum: [...MOTIFS] },
    colors: { type: "array", items: { type: "string" } },
    scale: { type: "number" },
    angle: { type: "number" },
    density: { type: "number" },
    opacity: { type: "number" },
    fade: { type: "string", enum: [...FADES] },
    seed: { type: "integer" },
  },
};
export const REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["patterns"],
  properties: {
    patterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "background", "layers"],
        properties: {
          name: { type: "string" },
          background: {
            type: "object",
            additionalProperties: false,
            required: ["type", "colors", "angle"],
            properties: { type: { type: "string", enum: [...BACKGROUNDS] }, colors: { type: "array", items: { type: "string" } }, angle: { type: "number" } },
          },
          layers: { type: "array", items: layerJson },
        },
      },
    },
  },
};

const chart = Object.keys((CHART as { colors: Record<string, string> }).colors);

/** the instructions: the same on every call, so they are cached */
export const PATTERN_SYSTEM = `You design full-print (sublimation) patterns for sports bibs and jerseys made by a Thai factory.
A customer describes the pattern they want, in Thai, English or Japanese. Reply with pattern recipes that the website draws as vector shapes over the whole garment piece (about 600 mm wide and 700 mm tall; front, back, and on a reversible bib the inside too).

A recipe is a background plus 0-4 layers drawn in order, each layer one motif:
- stripes: parallel bands (scale 1 = 30 mm bands), turned by angle (0 = vertical bands, 90 = horizontal); colors cycle band by band; density = band width against the gap (1 = no gap).
- pinstripes: thin lines (3 mm) about 20 mm apart at scale 1.
- chevrons: stacked V shapes pointing up (angle turns them), 80 mm wide at scale 1.
- diamonds: a diamond grid (110 mm cells at scale 1), each diamond shaded from colors[0] at its top to colors[1] at its bottom (the "KOOL" look).
- waves: wavy horizontal bands (160 mm wavelength at scale 1); angle tilts them.
- halftone: a grid of dots whose size grows in the fade direction (classic sportswear halftone); needs fade other than none.
- shards: scattered sharp triangles (broken glass), random by seed.
- camo: rounded organic blobs (80 mm at scale 1), colors cycle.
- digicamo: pixel camouflage squares.
- speedlines: long thin slanted streaks (motion), tilted by angle.
- lightning: a few zigzag lightning bolts.
- hexagons: honeycomb outlines.
- dots: regular polka dots.
- rings: concentric circles from the centre.
- sash: one broad band across the piece (120 mm at scale 1), tilted by angle (45 = diagonal).
- grid: square grid lines.
- triangles: a triangle tessellation, colors alternating.
- scales: overlapping fish-scale arcs.
Every layer: colors (1-4 "#rrggbb"), scale 0.3-3 (motif size), angle -180..180 degrees, density 0.1-1 (how much of the area it covers), opacity 0.1-1, fade (none/up/down/left/right/center: the layer fades out toward that side; for halftone the dots grow toward it), seed (any integer; changes the random placement).
Background: type solid (colors[0]), linear (a gradient through its colors at angle; 90 = top to bottom) or radial (from the centre out).

Design rules:
- Give each recipe a short name in Thai (2-5 words).
- Make the recipes clearly different from each other (motif, layout or colour), all matching the request.
- Team numbers and names are printed over the pattern: keep the area readable - strong motifs at lower opacity or faded, high contrast against the background.
- Use the customer's colours. When they name none, use the garment's body and trim colours given. Prefer colours from the factory's DTP chart below; they print exactly.
- Never draw logos, brand marks, club crests, text or letters, or copy a known team's kit.
- 1-3 layers is usually best; restraint looks professional.

The factory's DTP chart (#rrggbb): ${chart.join(" ")}`;
