import { NextResponse, type NextRequest } from "next/server";
import { isOpen, OPEN_ALL, LAUNCH_KIT } from "./lib/launch";

/**
 * Bibs-only launch (lib/launch.ts): a page that isn't open yet shows
 * /coming-soon at its own address; the rack of kits (/shop) goes straight to
 * the bib kit.
 */
export function middleware(req: NextRequest) {
  if (OPEN_ALL) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const href = pathname + search;
  if (pathname === "/shop" && isOpen(href)) {
    const url = req.nextUrl.clone();
    url.pathname = `/shop/${LAUNCH_KIT}`;
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isOpen(href)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/coming-soon";
  url.search = "";
  return NextResponse.rewrite(url);
}

export const config = {
  // pages only: not Next's own files, the font route, or files in public/ (they have an extension)
  matcher: ["/((?!_next/|api/|.*\\.[^/]+$).*)"],
};
