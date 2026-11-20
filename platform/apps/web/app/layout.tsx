import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";

export const metadata: Metadata = {
  title: "Axiom Siam Co.,Ltd. — โรงงานผลิตเสื้อผ้ากีฬา OEM/ODM ส่งออกทั่วโลก",
  description:
    "Axiom Siam Co.,Ltd. โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก — ออกแบบเสื้อของคุณเองแบบ 3D พร้อมขอใบเสนอราคา",
  icons: { icon: "/models/axiom-icon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <head>
        {/* a page of this site is never shown inside a frame of this site: the advanced designer
            (/design) holds its editor in an iframe, and a link out of it once opened the home page,
            then the 3D studio, inside that frame with the address bar still on /design */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(window.top!==window.self&&window.top.location.origin===location.origin)window.top.location.replace(location.href)}catch(e){}" }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Sora:wght@400;600;700;800&family=Noto+Sans+Thai:wght@400;500;700;800&family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, fontFamily: "'Sora', 'Noto Sans Thai', system-ui, sans-serif", background: "#0d0e10", color: "#f2f0eb" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
