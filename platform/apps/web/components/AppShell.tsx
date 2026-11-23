"use client";

import { useEffect, useState, type ReactNode } from "react";
import StoreHeader from "./StoreHeader";
import StoreFooter from "./StoreFooter";
import StationHero from "./StationHero";
import { tri, type Lang } from "../lib/i18n";
import type { Station } from "../lib/stations";
import "../app/app.css";
import "../app/home.css";

/**
 * Frame for the account-side pages (account, orders, admin, terms…): the
 * storefront header and footer around a centred column, in the same dark
 * brand theme as the home page. `station` puts that station's render across the top;
 * `auth` turns it into the split sign-in layout: the factory beside the form.
 */
export default function AppShell({
  children, narrow = false, wide = false, auth = false, station, lang, onLang,
}: {
  children: ReactNode;
  narrow?: boolean;
  wide?: boolean;
  /** sign-in / sign-up style page: form on the right, brand stage on the left */
  auth?: boolean;
  /** the home page's station this page belongs to: its render goes across the top (StationHero) */
  station?: Station["id"];
  /** a page written in Thai / English / Japanese passes its language: the header gets the switch */
  lang?: Lang;
  onLang?: (l: Lang) => void;
}) {
  return (
    <div className="app ax" lang={lang}>
      <StoreHeader bell cta={!auth} lang={lang} onLang={onLang} />
      {auth ? (
        <div className="ax-auth">
          <AuthStage lang={lang} />
          <main className="ax-auth-form">{children}</main>
        </div>
      ) : (
        <>
          {station && <StationHero id={station} lang={lang} />}
          <main className={`app-main${narrow ? " app-narrow" : ""}${wide ? " app-wide" : ""}`}>{children}</main>
        </>
      )}
      {!auth && <StoreFooter lang={lang} />}
    </div>
  );
}

function AuthStage({ lang }: { lang?: Lang }) {
  const L = tri(lang ?? "th");
  const [motion, setMotion] = useState(false);
  useEffect(() => setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return (
    <aside className="ax-auth-art st-auth" aria-label="Axiom Siam">
      {/* the same factory as the home page, at work */}
      <div className="st-auth-pic">
        <img src="/factory/factory-1600.webp" alt="" draggable={false} />
        {motion && <video src="/factory/loop.mp4" poster="/factory/factory-1600.webp" autoPlay muted loop playsInline aria-hidden="true" />}
      </div>
      <div className="copy">
        <span className="ax-mono">Axiom Siam · {L("โรงงานเสื้อกีฬา", "Sportswear factory", "スポーツウェア工場")}</span>
        <h2 className="ax-display">{L("ทีมเดียวกัน", "One team", "ひとつのチーム")}<br /><em>{L("ตั้งแต่ตัวแรก", "from the first kit", "最初の一枚から")}</em></h2>
        <ul>
          <li>{L("ออกแบบบนเว็บ เห็นราคาทันที", "Design on the web, see the price at once", "ウェブでデザイン、価格はその場で")}</li>
          <li>{L("เก็บแบบ รายชื่อ และที่อยู่ไว้สั่งซ้ำ", "Keep designs, rosters and addresses for the next order", "デザイン・名簿・住所を保存して再注文")}</li>
          <li>{L("ดูได้ว่างานอยู่ตรงไหนในโรงงาน จนถึงมือทีม", "See where your order is in the factory, right to your team", "工場のどこにあるか、お届けまで確認")}</li>
        </ul>
      </div>
    </aside>
  );
}
