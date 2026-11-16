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
]);

/** a UA old enough that Google Fonts falls back to TTF */
const LEGACY_UA = "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)";

/** family|weight -> ttf bytes. Fonts never change, so an in-process cache is enough. */
const cache = new Map<string, ArrayBuffer>();

function ttfUrlFrom(css: string): string | null {
  const m = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+?\.ttf)\)/i.exec(css);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest, { params }: { params: { family: string } }) {
  const family = decodeURIComponent(params.family);
  if (!ALLOWED.has(family)) {
    return NextResponse.json({ error: `ฟอนต์ "${family}" ไม่อยู่ในรายการที่อนุญาต` }, { status: 400 });
  }

  const weightRaw = req.nextUrl.searchParams.get("weight") ?? "400";
  const weight = /^\d{3}$/.test(weightRaw) ? weightRaw : weightRaw === "bold" ? "700" : "400";
  const key = `${family}|${weight}`;

  const hit = cache.get(key);
  if (hit) return ttfResponse(hit);

  try {
    const cssUrl = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}`;
    const cssRes = await fetch(cssUrl, { headers: { "User-Agent": LEGACY_UA } });
    if (!cssRes.ok) throw new Error(`Google CSS ${cssRes.status}`);

    const url = ttfUrlFrom(await cssRes.text());
    if (!url) throw new Error("ไม่พบไฟล์ .ttf ในผลลัพธ์ของ Google");

    const fontRes = await fetch(url);
    if (!fontRes.ok) throw new Error(`font ${fontRes.status}`);

    const buf = await fontRes.arrayBuffer();
    cache.set(key, buf);
    return ttfResponse(buf);
  } catch (e: any) {
    // the designer falls back to embedding <text> and warns the user
    return NextResponse.json({ error: `โหลดฟอนต์ไม่สำเร็จ: ${e.message}` }, { status: 502 });
  }
}

function ttfResponse(buf: ArrayBuffer) {
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "font/ttf",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
