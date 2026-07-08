import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";

export const metadata: Metadata = {
  title: "Axiom Siam Co.,Ltd. — โรงงานผลิตเสื้อผ้ากีฬา OEM/ODM ส่งออกทั่วโลก",
  description:
    "Axiom Siam Co.,Ltd. โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก — ออกแบบเสื้อของคุณเองแบบ 3D พร้อมขอใบเสนอราคา",
  icons: { icon: "/logo-mark-blue.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Sora:wght@400;600;700;800&family=Noto+Sans+Thai:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, fontFamily: "'Sora', 'Noto Sans Thai', system-ui, sans-serif", background: "#0a0e0d", color: "#e8f5f2" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
