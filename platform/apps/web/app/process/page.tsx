import { redirect } from "next/navigation";

/** the walk down the line moved to /tracking (old links, ?step=n included, still work) */
export default function ProcessPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) if (typeof v === "string") q.set(k, v);
  const s = q.toString();
  redirect(s ? `/tracking?${s}` : "/tracking");
}
