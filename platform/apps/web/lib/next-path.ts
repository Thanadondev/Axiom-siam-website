/**
 * Where to go after signing in: `?next=/shop/striker` sends the buyer back to
 * the kit they were ordering. Only same-site paths are honoured — never
 * `//evil.com` or `https://…` — so the parameter can't become an open redirect.
 */
export function nextPath(fallback = "/account"): string {
  if (typeof window === "undefined") return fallback;
  const raw = new URLSearchParams(window.location.search).get("next");
  return safePath(raw) ?? fallback;
}

export function safePath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}
