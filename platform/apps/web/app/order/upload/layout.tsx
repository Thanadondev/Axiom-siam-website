import type { ReactNode } from "react";
import { stationMeta } from "../../../lib/meta";

export const metadata = stationMeta("heatpress");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
