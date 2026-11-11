import type { BibDesign, RosterRow } from "./design";
import { BIB_SIZES, type BibSize } from "./template";

/**
 * Kits from the kit studio (/shop/[kit]) that are cut on the bib template: the
 * basketball singlet is the factory's bib (CB-005), one side. Their orders get
 * the same job package as a bib designed on the web.
 */
export const KITS_ON_BIB: Record<string, { code: string; name: string }> = {
  bib: { code: "BK-03", name: "Basketball" },
};

/** what the kit studio saves with a design (apps/web/lib/kits.ts KitConfig, plus the uploaded files) */
export interface KitSnapshot {
  kind: "kit-studio";
  kit: string;
  colors: { body: string; sleeve?: string; trim: string; stripe: string; number: string };
  pattern: string;
  font: string;
  fabric?: string;
  trim: string;
  name?: string;
  number?: string;
  logo?: string;
  logoTint?: boolean;
  fontAsset?: string;
  assets?: { logo?: { url?: string }; font?: { url?: string } };
}

export function kitOnBib(s: unknown): s is KitSnapshot {
  if (!s || typeof s !== "object") return false;
  const k = s as Record<string, unknown>;
  return k.kind === "kit-studio" && typeof k.kit === "string" && !!KITS_ON_BIB[k.kit.toLowerCase()] && !!k.colors && typeof k.colors === "object";
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, fb: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fb);

/** the kit studio's pattern names, as the bib's */
const PATTERN: Record<string, BibDesign["sides"][number]["pattern"]> = {
  none: "plain", diagonal: "diagonal", chest: "chest", side: "side", pin: "pin", hoops: "rings",
};

/** the kit's team logo (uploaded with the design), or none */
export function kitLogoUrl(s: KitSnapshot): string | undefined {
  return typeof s.logo === "string" && s.logo.startsWith("logo-") ? s.assets?.logo?.url : undefined;
}

/**
 * The kit studio's design as a bib design, for the given pieces (one per row,
 * by size). What the 3D singlet shows is what prints: body, pattern in the
 * stripe colour, name and number in the number colour, trim bands where the
 * trim level puts them, the chest logo (the team's or the Axiom mark) on the
 * wearer's right and the small number opposite.
 */
export function kitBibDesign(s: KitSnapshot, roster: RosterRow[]): BibDesign {
  const kit = KITS_ON_BIB[s.kit.toLowerCase()];
  const c = s.colors;
  const body = hex(c.body, "#ffffff");
  const trim = hex(c.trim, body);
  // the trim levels: none · neck · neck + armholes · neck + armholes + hem (lib/kits.ts trimEdges)
  const t = s.trim;
  const on = { neck: t !== "none", arm: t === "neckarm" || t === "full", hem: t === "full" };
  const rib = on.neck || on.arm || on.hem
    ? { neck: on.neck ? trim : body, arm: on.arm ? trim : body, hem: on.hem ? trim : body }
    : undefined;
  const fontUrl = typeof s.fontAsset === "string" && s.fontAsset.startsWith("font-") ? s.assets?.font?.url : undefined;
  return {
    product: "bib_n",
    team: "",
    font: s.font === "classic" || s.font === "thai" ? s.font : "block",
    sides: [{
      body,
      pattern: PATTERN[s.pattern] ?? "plain",
      patternColor: hex(c.stripe, body),
      ink: hex(c.number, "#231f20"),
      ...(rib ? { rib } : {}),
    }],
    show: { frontNumber: true, frontLogo: s.logo !== "none", frontTeam: false, backName: true, backNumber: true },
    roster,
    logoLeft: true,
    logoTint: s.logoTint === true,
    axiomMark: s.logo === "axiom" || s.logo === undefined,
    ...(fontUrl && /^\/uploads\/kit-assets\/fonts\/[a-f0-9]{64}\.(ttf|otf|woff|woff2)$/.test(fontUrl) ? { fontUrl } : {}),
    kit: { id: s.kit.toLowerCase(), code: kit.code, name: kit.name, ...(s.fabric ? { fabric: String(s.fabric).slice(0, 10) } : {}) },
  };
}

/**
 * One row per piece from the order's lines and names. Pieces with no name on
 * the list print the design's own name and number when the order has no list
 * at all (what the customer saw on the 3D kit); with a list, they stay blank.
 */
export function kitRoster(
  s: KitSnapshot,
  items: { size: string; qty: number; roster: { playerName: string | null; number: string | null; qty: number }[] }[],
): RosterRow[] {
  const anyNames = items.some(i => i.roster.length);
  const rows: RosterRow[] = [];
  for (const it of items) {
    if (!(BIB_SIZES as readonly string[]).includes(it.size)) continue;
    const size = it.size as BibSize;
    let left = it.qty;
    for (const r of it.roster) {
      for (let n = 0; n < r.qty && left > 0; n++, left--) {
        rows.push({ name: (r.playerName ?? "").slice(0, 20), number: (r.number ?? "").replace(/\D/g, "").slice(0, 3), size });
      }
    }
    for (; left > 0; left--) {
      rows.push(anyNames ? { name: "", number: "", size } : { name: (s.name ?? "").trim().slice(0, 20), number: (s.number ?? "").replace(/\D/g, "").slice(0, 3), size });
    }
  }
  return rows;
}
