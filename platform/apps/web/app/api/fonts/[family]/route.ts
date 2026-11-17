import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Serves the raw TTF for a Google Font so the designer can convert text to
 * outlines before exporting production SVG.
 *
 * Why a proxy at all?
 *  - Google serves .woff2 to modern browsers; opentype.js cannot read woff2
 *    (it is Brotli-compressed). Requesting the *legacy* CSS with an ancient
 *    User-Agent makes Google hand back a plain .ttf URL.
 *  - Going through our own origin also avoids CORS on fonts.gstatic.com.
 *
 * Only the families the designer actually offers are allowed — this endpoint
 * must never become an open proxy to arbitrary URLs.
 */

const ALLOWED = new Set([
  // Thai
  "Kanit", "Prompt", "Mitr", "Bai Jamjuree", "K2D", "Athiti", "Krub",
  "Chakra Petch", "Sarabun", "Pridi", "Noto Sans Thai",
  // athletic / display
  "Anton", "Bebas Neue", "Graduate", "Black Ops One", "Russo One", "Staatliches",
  "Squada One", "Archivo Black", "Bungee", "Teko", "Big Shoulders Display",
  // condensed
  "Oswald", "Fjalla One", "Saira Condensed", "Barlow Condensed",
  // general
  "Sora", "Montserrat",
  // what the outliner falls back to for a character the chosen face lacks (a Japanese name in Sora)
  "Noto Sans JP",
  // the open twins of Arial / Helvetica, Times and Courier (same letter widths), for text in imported logos
  "Arimo", "Tinos", "Cousine",
]);

/**
 * Google Fonts answers a client that isn't a known browser with plain TTF. (An old
 * browser UA used to work too; since 2026 old IE gets an extensionless /l/font URL.)
 */
const LEGACY_UA = "axiom-font-proxy";

/** family|weight -> ttf bytes and the weight served. Fonts never change, so an in-process cache is enough. */
const cache = new Map<string, { buf: ArrayBuffer; served: string }>();

/**
 * `text`: only these letters. Google serves a family's scripts as separate files
 * (Noto Sans Thai's default is its Latin part); asking for the letters themselves
 * gets one font that has them all — a Thai or Japanese name included.
 */
async function fetchTtf(family: string, weight: string, text = ""): Promise<ArrayBuffer | null> {
  const cssUrl = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  const cssRes = await fetch(cssUrl, { headers: { "User-Agent": LEGACY_UA } });
  if (!cssRes.ok) return null;
  const url = ttfUrlFrom(await cssRes.text());
  if (!url) throw new Error("ไม่พบไฟล์ .ttf ในผลลัพธ์ของ Google");
  const fontRes = await fetch(url);
  if (!fontRes.ok) throw new Error(`font ${fontRes.status}`);
  return fontRes.arrayBuffer();
}

function ttfUrlFrom(css: string): string | null {
  // a whole font (…/x.ttf), or one cut to the letters asked for (…/l/font?kit=…)
  const m = /url\((https:\/\/fonts\.gstatic\.com\/(?:[^)]+?\.ttf|l\/font\?[^)]+))\)/i.exec(css);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest, { params }: { params: { family: string } }) {
  const family = decodeURIComponent(params.family);
  if (!ALLOWED.has(family)) {
    return NextResponse.json({ error: `ฟอนต์ "${family}" ไม่อยู่ในรายการที่อนุญาต` }, { status: 400 });
  }

  const weightRaw = req.nextUrl.searchParams.get("weight") ?? "400";
  const weight = /^\d{3}$/.test(weightRaw) ? weightRaw : weightRaw === "bold" ? "700" : "400";
  // the letters needed, at most a few hundred (a name, a number, a team)
  const text = [...new Set([...(req.nextUrl.searchParams.get("text") ?? "")])].sort().join("").slice(0, 400);
  const key = `${family}|${weight}|${text}`;

  const hit = cache.get(key);
  if (hit) return ttfResponse(hit.buf, hit.served);

  try {
    // a weight the family doesn't come in (Anton bold): the regular, as the browser
    // does before it thickens it — X-Font-Weight tells the designer to do the same
    let served = weight;
    let buf = await fetchTtf(family, weight, text);
    if (!buf && weight !== "400") { served = "400"; buf = await fetchTtf(family, "400", text); }
    if (!buf) throw new Error("Google CSS: no such weight");
    // letters asked for (text=) make many small fonts: keep the newest few hundred, not every one ever asked
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { buf, served });
    return ttfResponse(buf, served);
  } catch (e: any) {
    // the designer warns the user (an order can't be printed without its outlines)
    return NextResponse.json({ error: `โหลดฟอนต์ไม่สำเร็จ: ${e.message}` }, { status: 502 });
  }
}

function ttfResponse(buf: ArrayBuffer, served: string) {
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "font/ttf",
      "X-Font-Weight": served,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
