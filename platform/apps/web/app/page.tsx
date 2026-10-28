"use client";

import { useState } from "react";
import StoreHeader from "../components/StoreHeader";
import ScrollStory, { RingCursor } from "../components/ScrollStory";
import SiteFooter from "../components/SiteFooter";
import "./app.css"; // UserMenu styles
import "./home.css";

export default function Home() {
  const [lang, setLang] = useState<"th" | "en">("th");
  const th = lang === "th";
  return (
    <div className="ax ax-landing" lang={lang}>
      <RingCursor />
      <StoreHeader
        lang={lang}
        onLang={setLang}
        nav={[
          { href: "#collection", label: th ? "คอลเลกชัน" : "Collection" },
          { href: "/process", label: th ? "ขั้นตอนผลิต" : "How it's made" },
          { href: "#work", label: th ? "ผลงาน" : "Our work" },
          { href: "#contact", label: th ? "ติดต่อ" : "Contact" },
        ]}
      />

      <main>
        <ScrollStory th={th} />

      </main>

      <SiteFooter th={th} />
    </div>
  );
}
