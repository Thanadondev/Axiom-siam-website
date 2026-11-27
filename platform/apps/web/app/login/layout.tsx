import type { ReactNode } from "react";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta("เข้าสู่ระบบ");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
