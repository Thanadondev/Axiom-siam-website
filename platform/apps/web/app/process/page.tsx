"use client";

import { useState } from "react";
import StoreHeader from "../../components/StoreHeader";
import { RingCursor } from "../../components/ScrollStory";
import ProcessStory from "../../components/ProcessStory";
import SiteFooter from "../../components/SiteFooter";
import "../app.css"; // UserMenu styles
import "../home.css";

export default function ProcessPage() {
  const [lang, setLang] = useState<"th" | "en">("th");
  const th = lang === "th";
  return (
    <div className="ax ax-landing" lang={lang}>
      <RingCursor />
      <StoreHeader
        lang={lang}
        onLang={setLang}
        nav={[
          { href: "/", label: th ? "หน้าแรก" : "Home" },
          { href: "/shop", label: th ? "คอลเลกชัน" : "Collection" },
          { href: "/process", label: th ? "ขั้นตอนผลิต" : "How it's made" },
          { href: "/#contact", label: th ? "ติดต่อ" : "Contact" },
        ]}
      />
      <main>
        <ProcessStory th={th} />
      </main>
      <SiteFooter th={th} />
    </div>
  );
}
