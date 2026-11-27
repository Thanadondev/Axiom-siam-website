import type { ReactNode } from "react";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta("ข้อตกลง & เงื่อนไข");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
