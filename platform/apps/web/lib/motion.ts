/**
 * Whether the factory's videos (loop.mp4, fly-*.mp4: 2–3.6 MB each) should play. Off when the viewer
 * asks for less motion, has turned on data saver, or is on a slow connection; the stills stand in
 * for them. Browser-only (call it in an effect, after mount).
 */
export function videoOk(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return false;
  if (c?.effectiveType && /(^|-)2g$|^3g$/.test(c.effectiveType)) return false;
  return true;
}
