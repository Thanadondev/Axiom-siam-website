import { z } from "zod";
import { BIB_SIZES } from "./template";

/**
 * A bib designed on the website: what the customer picked, nothing drawn yet.
 * The job builder turns it into the same package the graphics team makes by
 * hand (print file per size, order sheet, name list).
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #RRGGBB").transform(s => s.toLowerCase());

export const PATTERNS = ["plain", "stripes", "hoops"] as const;

export const SideLookSchema = z.object({
  body: hex,
  /** vertical stripes or horizontal hoops in a second colour */
  pattern: z.enum(PATTERNS).default("plain"),
  patternColor: hex.optional(),
  /** name, number and team name */
  ink: hex,
  /** a keyline round the name and number, as on most bibs */
  inkOutline: hex.optional(),
  /** bands printed along the neck, armholes and hem; each side has them or not, as the designer likes */
  rib: z.object({ neck: hex, arm: hex, hem: hex }).optional(),
});

export const RosterRowSchema = z.object({
  name: z.string().max(20).default(""),
  number: z.string().regex(/^\d{0,3}$/, "number: up to 3 digits").default(""),
  size: z.enum(BIB_SIZES),
});

export const BibDesignSchema = z.object({
  product: z.enum(["bib_r", "bib_n"]),
  /** printed across the front */
  team: z.string().max(30).default(""),
  font: z.enum(["block", "classic", "thai"]).default("block"),
  /** side A, and for a reversible bib the reverse (side B) */
  sides: z.array(SideLookSchema).min(1).max(2),
  /** where the pieces carry what */
  show: z.object({
    frontNumber: z.boolean().default(true),
    frontLogo: z.boolean().default(true),
    frontTeam: z.boolean().default(true),
    backName: z.boolean().default(true),
    backNumber: z.boolean().default(true),
  }).default({}),
  roster: z.array(RosterRowSchema).min(1).max(500),
}).superRefine((d, ctx) => {
  if (d.product === "bib_r" && d.sides.length !== 2) ctx.addIssue({ code: "custom", path: ["sides"], message: "a reversible bib needs both sides" });
  if (d.product === "bib_n" && d.sides.length !== 1) ctx.addIssue({ code: "custom", path: ["sides"], message: "a normal bib has one side" });
});

export type SideLook = z.infer<typeof SideLookSchema>;
export type RosterRow = z.infer<typeof RosterRowSchema>;
export type BibDesign = z.infer<typeof BibDesignSchema>;

/**
 * Where things go, as the graphics team places them on a junior (M) bib —
 * measured from their order sheets (HH-434): centre across and top of the ink
 * as shares of the cut piece, height (or width) in mm on the M piece. Other
 * sizes scale with the piece's width.
 */
export const LAYOUT = {
  front: {
    number: { cx: 0.264, top: 0.278, h: 85 },
    logo: { cx: 0.743, top: 0.268, h: 85, maxW: 110 },
    team: { cx: 0.5, cy: 0.5, w: 320, h: 50 },
  },
  back: {
    name: { cx: 0.5, top: 0.146, h: 35, maxW: 380 },
    number: { cx: 0.5, top: 0.286, h: 200, maxW: 330 },
  },
  /** keyline round name/number, mm on M */
  outline: 3,
} as const;
