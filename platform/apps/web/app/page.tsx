"use client";

import { tri, useLang } from "../lib/i18n";
import StoreHeader from "../components/StoreHeader";
import ScrollStory, { RingCursor } from "../components/ScrollStory";
import SiteFooter from "../components/SiteFooter";
import "./app.css"; // UserMenu styles
import "./home.css";

export default function Home() {
  const [lang, setLang] = useLang();
  const L = tri(lang);
  return (
    <div className="ax ax-landing" lang={lang}>
      <RingCursor />
      <StoreHeader
        lang={lang}
        onLang={setLang}
        nav={[
          { href: "#collection", label: L("คอลเลกชัน", "Collection", "コレクション") },
          { href: "/tracking", label: L("ติดตามงาน", "Track order", "注文追跡") },
          { href: "#work", label: L("ผลงาน", "Our work", "制作実績") },
          { href: "#contact", label: L("ติดต่อ", "Contact", "お問い合わせ") },
        ]}
      />

      <main>
        <ScrollStory lang={lang} />

      </main>

      <SiteFooter lang={lang} />
    </div>
  );
}
