import type { ReactNode } from "react";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta("ออเดอร์ของฉัน", undefined, undefined, { noindex: true });

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
