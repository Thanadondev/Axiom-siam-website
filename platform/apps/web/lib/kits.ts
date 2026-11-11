/**
 * The kit catalogue behind /shop (the rack) and /shop/[kit] (the locker-room
 * customizer).
 *
 * Colours are taken from the factory's DTP chart (public/designer/palette.js)
 * so a default kit is always printable as shown — except #ffffff, which is the
 * fabric left unprinted. Fabric and trim ids are the same ones the order
 * system prices (lib/order-draft.ts, lib/garment-options.ts); kits.spec.ts
 * fails if they drift.
 */

import { TRIMS, type TrimId } from "./garment-options";
import { FABRICS, SIZES, type Size } from "./order-draft";

export type PatternId = "none" | "diagonal" | "chest" | "side" | "pin" | "hoops";
export type PartId = "body" | "sleeve" | "trim" | "stripe" | "number";
export type FontId = "block" | "classic" | "thai";
export type FabricId = (typeof FABRICS)[number];

export interface KitColors {
  body: string;
  sleeve: string;
  trim: string;
  stripe: string;
  number: string;
}

export interface KitCut {
  sleeves: "short" | "none" | "long";
  /** "hood" = a hoodie, "waist" = shorts / pants (an elastic waistband, no neck), "zip" = a zip-up warm-up top */
  neck: "crew" | "v" | "polo" | "hood" | "waist" | "zip";
  /** torso half-width multiplier — basketball runs loose, running tight */
  fit: number;
  /** torso length multiplier */
  length: number;
}

export interface KitTheme {
  /** page background while this kit is on the rack */
  bg: string;
  ink: string;
  soft: string;
  rail: string;
  accent: string;
  accentInk: string;
}

/** what the garment is: drives the display form, the print layout and the price */
export type GarmentId = "jersey" | "hoodie" | "shorts" | "piste" | "piste_zip" | "pants";

/** shorts and track pants: an elastic waist, legs, the lower-body form */
export const isBottom = (k: { garment: GarmentId }) => k.garment === "shorts" || k.garment === "pants";

export interface Kit {
  id: string;
  garment: GarmentId;
  /** the fabrics this garment is made in (the first is the default); all of them if absent */
  fabrics?: FabricId[];
  /** the trim levels that make sense for it, with labels in its own words */
  trims?: { id: TrimId; label: string }[];
  code: string;
  /** priced as another product: the basketball singlet is cut on the bib template, so it is a normal bib (N-bib) */
  priceAs?: "bib_n";
  /** Thai product name */
  name: string;
  /** display name on the rack */
  en: string;
  note: string;
  deck: string;
  cutLabel: string;
  /** the cut in English and Japanese (the storefront's other languages) */
  cutEn: string;
  cutJa: string;
  cut: KitCut;
  theme: KitTheme;
  paletteLabel: string;
  defaults: {
    colors: KitColors;
    pattern: PatternId;
    trim: TrimId;
    fabric: FabricId;
    number: string;
  };
}

export const KITS: Kit[] = [
  {
    id: "striker",
    garment: "jersey",
    code: "FB-01",
    name: "เสื้อฟุตบอล",
    en: "Striker",
    note: "ทรงเข้ารูป ระบายเหงื่อไว สำหรับเกมเร็ว",
    deck: "ชุดแข่งฟุตบอลทรงเข้ารูป ลายคาดเฉียงพาดอก ปรับสีได้ทุกส่วน พร้อมชื่อและเบอร์รายคนทั้งทีม",
    cutLabel: "คอวี แขนสั้น", cutEn: "V-neck, short sleeve", cutJa: "Vネック・半袖",
    cut: { sleeves: "short", neck: "v", fit: 1, length: 1 },
    theme: { bg: "#0f1a2e", ink: "#f2f0eb", soft: "#aab2c4", rail: "#2c3550", accent: "#f26522", accentInk: "#0f1a2e" },
    paletteLabel: "Royal · black · flare",
    defaults: {
      colors: { body: "#0054a6", sleeve: "#231f20", trim: "#ffffff", stripe: "#f26522", number: "#ffffff" },
      pattern: "diagonal", trim: "neckarm", fabric: "mesh", number: "10",
    },
  },
  {
    id: "pacer",
    garment: "jersey",
    code: "RN-02",
    name: "เสื้อวิ่ง",
    en: "Pacer",
    note: "เบา บาง สำหรับงานวิ่งและอีเวนต์",
    deck: "เสื้อวิ่งแขนกุดน้ำหนักเบา ตัดเย็บให้เคลื่อนไหวคล่อง เหมาะกับงานวิ่ง ชมรม และอีเวนต์องค์กร",
    cutLabel: "คอกลม แขนกุด", cutEn: "Crew neck, sleeveless", cutJa: "丸首・ノースリーブ",
    cut: { sleeves: "none", neck: "crew", fit: 0.92, length: 1 },
    theme: { bg: "#0e3426", ink: "#f2f0eb", soft: "#b9cec2", rail: "#1f5843", accent: "#fff200", accentInk: "#0e3426" },
    paletteLabel: "Bone · forest · volt",
    defaults: {
      colors: { body: "#ffffff", sleeve: "#ffffff", trim: "#00a651", stripe: "#00a651", number: "#231f20" },
      pattern: "side", trim: "neckarm", fabric: "mesh", number: "07",
    },
  },
  {
    id: "bib",
    garment: "jersey",
    priceAs: "bib_n",
    code: "BK-03",
    name: "เสื้อบาสเกตบอล",
    en: "Bib",
    note: "ทรงหลวม เบอร์ใหญ่ เห็นชัดจากอัฒจันทร์",
    deck: "เสื้อบาสทรงหลวม ขอบคอและวงแขนตัดสีได้ เบอร์ขนาดใหญ่ทั้งหน้าและหลัง",
    // cut on the factory's bib pattern (CB-005): a deep round (U) neck
    cutLabel: "คอกลมลึก แขนกุด ตัวยาว", cutEn: "Scoop neck, sleeveless, long body", cutJa: "Uネック・ノースリーブ・ロング丈",
    cut: { sleeves: "none", neck: "crew", fit: 1.1, length: 1.08 },
    theme: { bg: "#4d0f14", ink: "#f7efe6", soft: "#e4bec1", rail: "#7a2129", accent: "#ffc20e", accentInk: "#4d0f14" },
    paletteLabel: "Crimson · gold · ink",
    defaults: {
      colors: { body: "#ed1c24", sleeve: "#ed1c24", trim: "#ffc20e", stripe: "#ffc20e", number: "#ffffff" },
      pattern: "chest", trim: "full", fabric: "mesh", number: "23",
    },
  },
  {
    id: "smash",
    garment: "jersey",
    code: "BD-04",
    name: "เสื้อแบดมินตัน",
    en: "Smash",
    note: "ผ้ายืดสี่ทาง สำหรับจังหวะตบแรง",
    deck: "เสื้อแบดมินตันผ้ายืดหยุ่นสูง เหมาะกับทีมสโมสรและการแข่งขันระดับโรงเรียน",
    cutLabel: "คอกลม แขนสั้น", cutEn: "Crew neck, short sleeve", cutJa: "丸首・半袖",
    cut: { sleeves: "short", neck: "crew", fit: 0.96, length: 0.97 },
    theme: { bg: "#0a3f47", ink: "#f2f0eb", soft: "#b6d4d7", rail: "#18646d", accent: "#f8aa9e", accentInk: "#0a3f47" },
    paletteLabel: "Lagoon · bone · black",
    defaults: {
      colors: { body: "#00aeef", sleeve: "#231f20", trim: "#231f20", stripe: "#ffffff", number: "#231f20" },
      pattern: "pin", trim: "neck", fabric: "B1", number: "04",
    },
  },
  {
    id: "club",
    garment: "jersey",
    code: "PL-05",
    name: "เสื้อโปโล",
    en: "Club",
    note: "ใส่ได้ทั้งในสนามและงานองค์กร",
    deck: "โปโลสำหรับทีมงาน สต๊าฟ และองค์กร พิมพ์โลโก้ได้ ใส่ได้ทั้งวันทำงานและวันแข่ง",
    cutLabel: "คอปก แขนสั้น", cutEn: "Collar, short sleeve", cutJa: "襟付き・半袖",
    cut: { sleeves: "short", neck: "polo", fit: 1, length: 1 },
    theme: { bg: "#18181b", ink: "#f2f0eb", soft: "#b8b5af", rail: "#34343a", accent: "#ffc20e", accentInk: "#18181b" },
    paletteLabel: "Charcoal · gilt · smoke",
    defaults: {
      colors: { body: "#231f20", sleeve: "#414042", trim: "#ffc20e", stripe: "#231f20", number: "#ffc20e" },
      pattern: "none", trim: "neckarm", fabric: "C1", number: "01",
    },
  },
  {
    id: "warmup",
    garment: "hoodie",
    code: "HD-06",
    name: "เสื้อฮู้ด",
    en: "Warmup",
    note: "ผ้าหนานุ่ม ใส่วอร์มก่อนลงสนามและเดินทาง",
    deck: "ฮู้ดสวมหัวสำหรับทีม ผ้าหนานุ่ม จั๊มปลายแขนและเอว มีกระเป๋าจิงโจ้และเชือกฮู้ด พิมพ์ชื่อและเบอร์ด้านหลังได้",
    cutLabel: "ฮู้ด แขนยาว", cutEn: "Hoodie, long sleeve", cutJa: "フード・長袖",
    cut: { sleeves: "long", neck: "hood", fit: 1.05, length: 1 },
    theme: { bg: "#2b2118", ink: "#f2f0eb", soft: "#cdbfae", rail: "#4a3a2c", accent: "#f26522", accentInk: "#2b2118" },
    paletteLabel: "Graphite · flare · bone",
    fabrics: ["C1", "B1"],
    trims: [
      { id: "none", label: "ไม่มีขลิบ" },
      { id: "neck", label: "ขอบฮู้ด" },
      { id: "neckarm", label: "ขอบฮู้ด + จั๊มแขน" },
      { id: "full", label: "ขอบฮู้ด + จั๊มแขน + จั๊มเอว" },
    ],
    defaults: {
      colors: { body: "#414042", sleeve: "#414042", trim: "#f26522", stripe: "#f26522", number: "#ffffff" },
      pattern: "none", trim: "full", fabric: "C1", number: "09",
    },
  },
  {
    id: "stride",
    garment: "shorts",
    code: "SH-07",
    name: "กางเกงกีฬา",
    en: "Stride",
    note: "เอวยางยืดพร้อมเชือกผูก เข้าชุดกับเสื้อทีม",
    deck: "กางเกงขาสั้นสำหรับทีม เอวยางยืดพร้อมเชือกผูก ตัดขาเดียวไม่มีตะเข็บข้าง พิมพ์แถบข้างและเบอร์ที่ขาได้",
    cutLabel: "ขาสั้น เอวยางยืด", cutEn: "Shorts, elastic waist", cutJa: "ショートパンツ・ウエストゴム",
    cut: { sleeves: "none", neck: "waist", fit: 1, length: 1 },
    theme: { bg: "#13232b", ink: "#f2f0eb", soft: "#a9bfc8", rail: "#25414e", accent: "#00aeef", accentInk: "#13232b" },
    paletteLabel: "Black · cyan · white",
    trims: [
      { id: "none", label: "ไม่มีขลิบ" },
      { id: "neck", label: "ขอบเอว" },
      { id: "full", label: "ขอบเอว + ปลายขา" },
    ],
    defaults: {
      colors: { body: "#231f20", sleeve: "#231f20", trim: "#ffffff", stripe: "#00aeef", number: "#ffffff" },
      pattern: "side", trim: "full", fabric: "mesh", number: "10",
    },
  },
  // ---------- the warm-up suit (piste): a raglan top, crew neck or zip-up, and track pants ----------
  {
    id: "tempo",
    garment: "piste",
    code: "WU-08",
    name: "เสื้อวอร์ม",
    en: "Tempo",
    note: "แขนรากลัน คอกลม ไม่มีซิป ใส่วอร์มอัพและเดินทาง",
    deck: "เสื้อวอร์มแขนยาวสำหรับทีม แขนรากลัน คอกลมไม่มีซิป จั๊มปลายแขนและเอว พิมพ์ลายทั้งตัว ชื่อและเบอร์ด้านหลังได้",
    cutLabel: "แขนยาวรากลัน คอกลม", cutEn: "Raglan long sleeve, crew neck", cutJa: "ラグラン長袖・丸首",
    cut: { sleeves: "long", neck: "crew", fit: 1.05, length: 1 },
    theme: { bg: "#1a1517", ink: "#f2f0eb", soft: "#c8bfc2", rail: "#3a2e32", accent: "#ed1c24", accentInk: "#f2f0eb" },
    paletteLabel: "Black · red · white",
    fabrics: ["C1", "B1"],
    trims: [
      { id: "none", label: "ไม่มีขลิบ" },
      { id: "neck", label: "ขอบคอ" },
      { id: "neckarm", label: "ขอบคอ + จั๊มแขน" },
      { id: "full", label: "ขอบคอ + จั๊มแขน + จั๊มเอว" },
    ],
    defaults: {
      colors: { body: "#231f20", sleeve: "#231f20", trim: "#231f20", stripe: "#ed1c24", number: "#ffffff" },
      pattern: "diagonal", trim: "full", fabric: "C1", number: "10",
    },
  },
  {
    id: "tempozip",
    garment: "piste_zip",
    code: "WZ-09",
    name: "เสื้อวอร์มซิป",
    en: "Tempo Zip",
    note: "แขนรากลัน คอตั้ง ซิปหน้าตลอดตัว",
    deck: "แจ็กเก็ตวอร์มแขนยาวสำหรับทีม แขนรากลัน คอตั้งซิปหน้าตลอดตัว จั๊มปลายแขนและเอว พิมพ์ลายทั้งตัว ชื่อและเบอร์ด้านหลังได้",
    cutLabel: "แขนยาวรากลัน ซิปหน้า", cutEn: "Raglan long sleeve, full zip", cutJa: "ラグラン長袖・フルジップ",
    cut: { sleeves: "long", neck: "zip", fit: 1.05, length: 1 },
    theme: { bg: "#111a26", ink: "#f2f0eb", soft: "#b4bfcd", rail: "#24344a", accent: "#00aeef", accentInk: "#111a26" },
    paletteLabel: "Navy · cyan · white",
    fabrics: ["C1", "B1"],
    trims: [
      { id: "none", label: "ไม่มีขลิบ" },
      { id: "neck", label: "คอตั้ง" },
      { id: "neckarm", label: "คอตั้ง + จั๊มแขน" },
      { id: "full", label: "คอตั้ง + จั๊มแขน + จั๊มเอว" },
    ],
    defaults: {
      colors: { body: "#0054a6", sleeve: "#0054a6", trim: "#231f20", stripe: "#00aeef", number: "#ffffff" },
      pattern: "side", trim: "full", fabric: "C1", number: "07",
    },
  },
  {
    id: "track",
    garment: "pants",
    code: "TP-10",
    name: "กางเกงวอร์ม",
    en: "Track",
    note: "ขายาวทรงเรียว เอวยางยืด เข้าชุดกับเสื้อวอร์ม",
    deck: "กางเกงวอร์มขายาวสำหรับทีม เอวยางยืดพร้อมเชือกผูก ขาเรียวเข้ารูปลงถึงข้อเท้า ปลายขาเย็บพับ พิมพ์แถบข้าง โลโก้และเบอร์ที่ต้นขาได้",
    cutLabel: "ขายาว ทรงเรียว", cutEn: "Slim tapered track pants", cutJa: "ロングパンツ・テーパード",
    cut: { sleeves: "none", neck: "waist", fit: 1, length: 1 },
    theme: { bg: "#151517", ink: "#f2f0eb", soft: "#bdbdc2", rail: "#33333a", accent: "#f2f0eb", accentInk: "#151517" },
    paletteLabel: "Black · white",
    fabrics: ["C1", "B1"],
    trims: [
      { id: "none", label: "ไม่มีขลิบ" },
      { id: "neck", label: "ขอบเอว" },
      { id: "full", label: "ขอบเอว + ขอบปลายขา" },
    ],
    defaults: {
      colors: { body: "#231f20", sleeve: "#231f20", trim: "#231f20", stripe: "#ffffff", number: "#ffffff" },
      pattern: "side", trim: "full", fabric: "C1", number: "10",
    },
  },
];

/** the garment its price is looked up as (the server reads the same from the saved design: pricing.ts garmentOf) */
export function kitPriceGarment(kit: Kit): string {
  return kit.priceAs ?? kit.garment;
}

/** the fabrics a kit is made in (the first is its usual one) */
export function kitFabrics(kit: Kit): FabricId[] {
  return kit.fabrics?.length ? kit.fabrics : [...FABRICS];
}

/** the trim levels a kit offers, labelled for that garment */
export function kitTrims(kit: Kit): { id: TrimId; label: string }[] {
  return kit.trims?.length ? kit.trims : TRIMS.map(t => ({ id: t.id, label: t.label }));
}

/** the parts that can be coloured on this garment, named and explained in its own words */
export function kitParts(kit: Kit): { id: PartId; label: string; hint: string }[] {
  return PARTS.filter(p => p.id !== "sleeve" || kit.cut.sleeves !== "none").map(p => {
    if (isBottom(kit)) {
      if (p.id === "body") return { ...p, label: "ตัวกางเกง" };
      if (p.id === "trim") return { ...p, label: "ขอบ", hint: "ขอบเอวและขอบปลายขา" };
      if (p.id === "number") return { ...p, label: "เบอร์", hint: "เบอร์ที่ขา ต้องอ่านได้ชัด" };
    }
    if (kit.garment === "piste" || kit.garment === "piste_zip") {
      if (p.id === "sleeve") return { ...p, label: "แขน", hint: "แขนรากลัน ต่อขึ้นไปถึงคอ" };
      if (p.id === "trim") return { ...p, label: kit.garment === "piste_zip" ? "คอตั้ง / จั๊ม" : "ขอบคอ / จั๊ม", hint: "ขอบคอ จั๊มแขนและเอว" };
    }
    if (kit.garment === "hoodie") {
      if (p.id === "trim") return { ...p, label: "ขอบฮู้ด / จั๊ม", hint: "ขอบฮู้ด เชือก จั๊มแขนและเอว" };
    }
    return p;
  });
}

/** kits renamed: the old id still finds the kit (the basketball singlet was "rim") */
const RENAMED: Record<string, string> = { rim: "bib" };

export function kitById(id: string | null | undefined): Kit | undefined {
  if (!id) return undefined;
  const k = id.toLowerCase();
  return KITS.find(x => x.id === (RENAMED[k] ?? k));
}

/** ten quick picks, all from the factory chart (white = unprinted fabric) */
export const QUICK_SWATCHES: { hex: string; name: string }[] = [
  { hex: "#ffffff", name: "ขาว (ไม่พิมพ์)" },
  { hex: "#231f20", name: "ดำ" },
  { hex: "#414042", name: "เทาเข้ม" },
  { hex: "#ed1c24", name: "แดง" },
  { hex: "#f26522", name: "ส้ม" },
  { hex: "#ffc20e", name: "เหลืองทอง" },
  { hex: "#00a651", name: "เขียว" },
  { hex: "#00aeef", name: "ฟ้า" },
  { hex: "#0054a6", name: "น้ำเงิน" },
  { hex: "#92278f", name: "ม่วง" },
];

export const PARTS: { id: PartId; label: string; hint: string }[] = [
  { id: "body", label: "ตัวเสื้อ", hint: "สีหลักที่ทุกคนจำได้" },
  { id: "sleeve", label: "แขนเสื้อ", hint: "ตัดหรือเข้ากับตัวเสื้อ" },
  { id: "trim", label: "ขลิบ", hint: "คอ วงแขน และชายเสื้อ" },
  { id: "stripe", label: "สีลาย", hint: "ลายที่บอกตัวตนทีม" },
  { id: "number", label: "ชื่อ-เบอร์", hint: "ต้องอ่านได้ชัดจากขอบสนาม" },
];

export const PATTERNS: { id: PatternId; label: string; code: string }[] = [
  { id: "none", label: "ไม่มีลาย", code: "P-00" },
  { id: "diagonal", label: "คาดเฉียง", code: "P-01" },
  { id: "chest", label: "คาดอก", code: "P-02" },
  { id: "side", label: "แถบข้าง", code: "P-03" },
  { id: "pin", label: "ริ้วตั้ง", code: "P-04" },
  { id: "hoops", label: "ริ้วขวาง", code: "P-05" },
];

export const FONTS: { id: FontId; label: string; family: string }[] = [
  { id: "block", label: "บล็อก", family: "Anton" },
  { id: "classic", label: "คลาสสิก", family: "Sora" },
  { id: "thai", label: "ไทย", family: "Noto Sans Thai" },
];

/** labels for the order system's fabric ids */
export const FABRIC_OPTIONS: { id: FabricId; label: string; sub: string }[] = [
  { id: "mesh", label: "Mesh", sub: "ตาข่าย ระบายอากาศดี" },
  { id: "B1", label: "B1", sub: "เนื้อนุ่ม ทิ้งตัว" },
  { id: "C1", label: "C1", sub: "พรีเมียม เนื้อแน่น" },
];

export const TRIM_OPTIONS = TRIMS;
export { SIZES };
export type { Size, TrimId };

/** what /shop/[kit] remembers on this device and saves to the account */
export interface KitConfig {
  kind: "kit-studio";
  v: 1;
  kit: string;
  colors: KitColors;
  pattern: PatternId;
  font: FontId;
  fabric: FabricId;
  trim: TrimId;
  name: string;
  number: string;
  /** chest logo: "axiom" (our mark), "none", or the id of a team logo in lib/kit-assets */
  logo: string;
  /** print the team logo in the number colour */
  logoTint: boolean;
  /** id of the team's own name/number font in lib/kit-assets; overrides `font` */
  fontAsset?: string;
}

export function defaultConfig(kit: Kit): KitConfig {
  return {
    kind: "kit-studio",
    v: 1,
    kit: kit.id,
    colors: { ...kit.defaults.colors },
    pattern: kit.defaults.pattern,
    font: "block",
    fabric: kit.defaults.fabric,
    trim: kit.defaults.trim,
    name: "SOMCHAI",
    number: kit.defaults.number,
    logo: "axiom",
    logoTint: false,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Restores a saved config, field by field. Anything missing or malformed falls
 * back to the kit default, so an old or hand-edited blob never breaks the page.
 */
export function restoreConfig(kit: Kit, raw: unknown): KitConfig {
  const base = defaultConfig(kit);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, any>;
  const colors = { ...base.colors };
  if (r.colors && typeof r.colors === "object") {
    for (const k of Object.keys(colors) as PartId[]) {
      if (typeof r.colors[k] === "string" && HEX.test(r.colors[k])) colors[k] = r.colors[k].toLowerCase();
    }
  }
  const pick = <T extends string>(v: unknown, ok: readonly T[], fb: T): T => (ok.includes(v as T) ? (v as T) : fb);
  return {
    ...base,
    colors,
    pattern: pick(r.pattern, PATTERNS.map(p => p.id), base.pattern),
    font: pick(r.font, FONTS.map(f => f.id), base.font),
    fabric: pick(r.fabric, kitFabrics(kit), base.fabric),
    trim: pick(r.trim, kitTrims(kit).map(t => t.id), base.trim),
    name: typeof r.name === "string" ? cleanName(r.name) : base.name,
    number: typeof r.number === "string" ? cleanNumber(r.number) : base.number,
    logo: typeof r.logo === "string" && /^(axiom|none|logo-[a-z0-9-]{4,40})$/.test(r.logo) ? r.logo : base.logo,
    logoTint: r.logoTint === true,
    fontAsset: typeof r.fontAsset === "string" && /^font-[a-z0-9-]{4,40}$/.test(r.fontAsset) ? r.fontAsset : undefined,
  };
}

/**
 * Names print in capitals, 14 characters max (fits the back at size S).
 * A trailing space survives so the name field can still be typed word by word.
 */
export function cleanName(v: string): string {
  return v.toUpperCase().replace(/\s+/g, " ").replace(/^ /, "").slice(0, 14);
}

/** two digits max; leading zeros are kept because teams use 00 and 07 */
export function cleanNumber(v: string): string {
  return v.replace(/[^0-9]/g, "").slice(0, 2);
}

/** which trimmed edges a trim level actually colours */
export function trimEdges(trim: TrimId): { neck: boolean; arm: boolean; hem: boolean } {
  return {
    neck: trim !== "none",
    arm: trim === "neckarm" || trim === "full",
    hem: trim === "full",
  };
}

export interface RosterRow {
  playerName: string;
  number: string;
  size: Size;
}

/**
 * Parses a pasted roster — one player per line, straight from Excel (tab
 * separated) or typed with commas: name, number, size. Lines that are blank
 * or a header row are skipped; an unknown size falls back to M.
 */
export function parseRoster(text: string): RosterRow[] {
  const rows: RosterRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(/\t|,|;/).map(c => c.trim());
    const [name = "", num = "", size = ""] = cells;
    if (/^(ชื่อ|name)$/i.test(name) && rows.length === 0) continue; // header
    const playerName = cleanName(name);
    const number = cleanNumber(num);
    if (!playerName && !number) continue;
    const up = size.toUpperCase();
    rows.push({ playerName, number, size: (SIZES as readonly string[]).includes(up) ? (up as Size) : "M" });
  }
  return rows.slice(0, 200);
}
