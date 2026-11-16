import type { Garment } from "./pricing";

/**
 * The site launches with bibs only (the web's lib/launch.ts shows every other
 * page as "Coming soon"). The API holds the same line, so an order for anything
 * else can't be placed by calling it directly. OPEN_ALL=1 (or the web's
 * NEXT_PUBLIC_OPEN_ALL=1) opens every product again.
 */
export function bibsOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return !(env.OPEN_ALL === "1" || env.NEXT_PUBLIC_OPEN_ALL === "1");
}

export const LAUNCH_GARMENTS: readonly Garment[] = ["bib_n", "bib_r"];

/** null when the order can be placed; the reason in Thai when it can't */
export function launchBlock(garment: Garment, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!bibsOnly(env) || LAUNCH_GARMENTS.includes(garment)) return null;
  return "ตอนนี้เปิดสั่งผลิตเฉพาะเอี๊ยม (Bib) — สินค้าอื่นจะเปิดเร็ว ๆ นี้";
}
