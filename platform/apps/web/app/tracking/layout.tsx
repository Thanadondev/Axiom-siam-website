import type { ReactNode } from "react";
import { pageMeta } from "../../lib/meta";

export const metadata = pageMeta("ติดตามงาน", "ใส่เลขออเดอร์ แล้วดูว่างานของคุณอยู่ตรงไหนในโรงงาน ตั้งแต่ทำไฟล์จนถึงวันส่ง", "tracking");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
