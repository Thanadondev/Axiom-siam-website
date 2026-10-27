"use client";

import Link from "next/link";
import UserMenu from "./UserMenu";
import NotifyBell from "./NotifyBell";

/** Header for the dark storefront pages (/, /shop). */
export default function StoreHeader({
  lang, onLang, nav, bell = false, cta = true,
}: {
  lang?: "th" | "en";
  onLang?: (l: "th" | "en") => void;
  nav?: { href: string; label: string }[];
  /** order/payment notifications (signed-in pages) */
  bell?: boolean;
  /** the orange "start designing" button */
  cta?: boolean;
}) {
  const th = lang !== "en";
  return (
    <header className="ax-head">
      <div className="ax-wrap">
        <Link href="/" className="ax-brand" aria-label="Axiom Siam หน้าแรก">
          <img src="/models/axiom-logo-white.png" alt="" />
          <b>AXIOM<i>.</i></b>
        </Link>
        {nav && (
          <nav className="ax-nav" aria-label={th ? "เมนูหลัก" : "Main menu"}>
            {nav.map(n => n.href.startsWith("#")
              ? <a key={n.href} href={n.href}>{n.label}</a>
              : <Link key={n.href} href={n.href}>{n.label}</Link>)}
          </nav>
        )}
        <div className="ax-tools">
          {bell && <NotifyBell />}
          <UserMenu loginClass="ax-login" />
          {onLang && (
            <div className="ax-pill" role="group" aria-label="ภาษา / Language">
              <button type="button" aria-pressed={th} onClick={() => onLang("th")}>TH</button>
              <button type="button" aria-pressed={!th} onClick={() => onLang("en")}>EN</button>
            </div>
          )}
          {cta && <Link href="/shop" className="ax-btn solid">{th ? "เริ่มออกแบบ" : "Start designing"}</Link>}
        </div>
      </div>
    </header>
  );
}
