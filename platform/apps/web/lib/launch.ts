/**
 * What the site is open for. While the site launches with bibs only, every
 * other page shows "Coming soon" (middleware.ts rewrites it to /coming-soon)
 * and links to it carry a "Coming soon" tag.
 *
 * Open for bibs: designing bibs on the web (/order/bib), ordering with the
 * team's own zip (/order/upload) and the bib kit in the 3D studio (/shop/bib),
 * plus everything around an order: sign-in, account, checkout, payment,
 * invoices, tracking and the admin side.
 *
 * NEXT_PUBLIC_OPEN_ALL=1 opens every page again (read at build time).
 */
export const OPEN_ALL = process.env.NEXT_PUBLIC_OPEN_ALL === "1";

/** the kit the 3D studio opens on while it is bibs only (/shop → /shop/bib) */
export const LAUNCH_KIT = "bib";

/** pages that are open, with everything under them */
const OPEN = [
  "/order/bib", "/order/upload",
  "/shop/bib", "/shop/rim", // /shop/rim is the old address of /shop/bib
  "/checkout", "/orders", "/account",
  "/login", "/register", "/verify", "/forgot-password", "/reset-password", "/auth",
  "/terms", "/tracking", "/process",
  "/admin",
  "/coming-soon",
];

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

/** Is this page (a path, or a link with a query) open? */
export function isOpen(href: string): boolean {
  if (OPEN_ALL) return true;
  const [rawPath, query = ""] = href.split("#")[0].split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  if (path === "/") return true;
  // the rack of kits: open only on the bib kit
  if (path === "/shop") {
    const kit = new URLSearchParams(query).get("kit");
    return !kit || kit === LAUNCH_KIT || kit === "rim";
  }
  return OPEN.some(base => under(path, base));
}

export const isSoon = (href: string) => !isOpen(href);
