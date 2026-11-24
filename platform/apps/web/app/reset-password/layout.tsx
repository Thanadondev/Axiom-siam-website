import type { ReactNode } from "react";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta("ตั้งรหัสผ่านใหม่", undefined, undefined, { noindex: true });

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
