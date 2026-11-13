"use client";

import { useMemo, type ReactNode } from "react";
import StoreHeader from "./StoreHeader";
import StoreFooter from "./StoreFooter";
import JerseyStage from "./JerseyStage";
import { KITS, defaultConfig, kitById } from "../lib/kits";
import { OPEN_ALL, LAUNCH_KIT } from "../lib/launch";
import { tri, type Lang } from "../lib/i18n";
import "../app/app.css";
import "../app/home.css";

const nav = (lang: Lang) => {
  const L = tri(lang);
  return [
    { href: "/shop", label: L("ออกแบบเสื้อ", "Design", "デザイン") },
    { href: "/templates", label: L("ตลาดลาย", "Designs market", "デザインマーケット") },
    { href: "/design", label: L("ออกแบบขั้นสูง", "Advanced designer", "上級デザイナー") },
  ];
};

/**
 * Frame for the account-side pages (account, orders, admin, terms…): the
 * storefront header and footer around a centred column, in the same dark
 * brand theme as the shop. `auth` turns it into the split sign-in layout:
 * a kit turning in 3D beside the form.
 */
export default function AppShell({
  children, narrow = false, wide = false, auth = false, lang, onLang,
}: {
  children: ReactNode;
  narrow?: boolean;
  wide?: boolean;
  /** sign-in / sign-up style page: form on the right, brand stage on the left */
  auth?: boolean;
  /** a page written in Thai / English / Japanese passes its language: the header gets the switch */
  lang?: Lang;
  onLang?: (l: Lang) => void;
}) {
  return (
    <div className="app ax" lang={lang}>
      <StoreHeader nav={nav(lang ?? "th")} bell cta={!auth} lang={lang} onLang={onLang} />
      {auth ? (
        <div className="ax-auth">
          <AuthStage />
          <main className="ax-auth-form">{children}</main>
        </div>
      ) : (
        <main className={`app-main${narrow ? " app-narrow" : ""}${wide ? " app-wide" : ""}`}>{children}</main>
      )}
      {!auth && <StoreFooter lang={lang} />}
    </div>
  );
}

function AuthStage() {
  // a different kit each day, so returning visitors see the range (only the bib kit while it's bibs only)
  const kit = useMemo(() => (!OPEN_ALL && kitById(LAUNCH_KIT)) || KITS[Math.floor(Date.now() / 86400000) % KITS.length], []);
  const look = useMemo(() => {
    const c = defaultConfig(kit);
    return { colors: c.colors, pattern: c.pattern, trim: c.trim, fabric: c.fabric, name: "", number: "10", font: c.font };
  }, [kit]);
  return (
    <aside className="ax-auth-art" aria-label="Axiom Siam">
      <div className="stage"><JerseyStage kit={kit} look={look} /></div>
      <div className="copy">
        <span className="ax-mono">Axiom Siam · Sportswear factory</span>
        <h2 className="ax-display">ทีมเดียวกัน<br /><em>ตั้งแต่ตัวแรก</em></h2>
        <ul>
          <li>ออกแบบบนโมเดล 3D เห็นราคาทันที</li>
          <li>เก็บแบบ รายชื่อ และที่อยู่ไว้สั่งซ้ำ</li>
          <li>ติดตามทุกออเดอร์จนถึงมือทีม</li>
        </ul>
      </div>
    </aside>
  );
}
