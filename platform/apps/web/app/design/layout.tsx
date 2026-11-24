import type { ReactNode } from "react";
import { stationMeta } from "../../lib/meta";

export const metadata = stationMeta("laser");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
