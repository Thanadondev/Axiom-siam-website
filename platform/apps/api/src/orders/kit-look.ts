/** the storefront kit fields of a design snapshot, or null for other designs */
export function kitLook(snap: unknown) {
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Record<string, unknown>;
  if (s.kind !== "kit-studio" || typeof s.kit !== "string") return null;
  const str = (v: unknown, max = 40) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const colors = s.colors && typeof s.colors === "object" ? Object.fromEntries(
    Object.entries(s.colors as Record<string, unknown>).filter(([, v]) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v as string)),
  ) : {};
  return { kit: s.kit.slice(0, 40), colors, pattern: str(s.pattern), number: str(s.number, 4), name: str(s.name, 20), font: str(s.font), fabric: str(s.fabric), trim: str(s.trim) };
}
