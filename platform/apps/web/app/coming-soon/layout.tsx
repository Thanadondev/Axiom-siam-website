import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Coming soon — Axiom Siam",
  robots: { index: false, follow: true },
};

export default function ComingSoonLayout({ children }: { children: ReactNode }) {
  return children;
}
