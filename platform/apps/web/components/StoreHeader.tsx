"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";
import NotifyBell from "./NotifyBell";
import SoonTag from "./SoonTag";
import { LANGS, tri, type Lang } from "../lib/i18n";
import { SITE_NAV } from "../lib/stations";

/**
 * The header of every page. Its menu is the factory's stations (lib/stations.ts), the same
 * ways in as the buttons on the home page, with the page you're on marked. The home page
 * passes `plain`: its picture is the menu there.
 */
export default function StoreHeader({
  lang, onLang, nav, plain = false, bell = false, cta = true,
}: {
  lang?: Lang;
  onLang?: (l: Lang) => void;
  /** a different menu (default: the stations) */
  nav?: { href: string; label: string }[];
  /** no menu (the home page) */
  plain?: boolean;
  /** order/payment notifications (signed-in pages) */
  bell?: boolean;
  /** the orange "start designing" button */
  cta?: boolean;
}) {
  const L = tri(lang ?? "th");
  const path = usePathname() ?? "";
  const items = plain ? [] : nav ?? SITE_NAV.map(s => ({ href: s.href, label: L(...s.title) }));
  const here = (href: string) => !href.startsWith("#") && (path === href || path.startsWith(href + "/"));
  // phones: the menu is a row that scrolls sideways; bring the page you're on into it
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current, a = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && a && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = a.offsetLeft - nav.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
  }, [path]);
  return (
    <header className="ax-head">
      <div className="ax-wrap">
        <Link href="/" className="ax-brand" aria-label="Axiom Siam หน้าแรก">
          <img src="/models/axiom-logo-white.png" alt="" />
          <b>AXIOM<i>.</i></b>
        </Link>
        {items.length > 0 && (
          <nav ref={navRef} className="ax-nav" aria-label={L("เมนูหลัก", "Main menu", "メインメニュー")}>
            {items.map(n => n.href.startsWith("#")
              ? <a key={n.href} href={n.href}>{n.label}</a>
              : <Link key={n.href} href={n.href} aria-current={here(n.href) ? "page" : undefined}>{n.label}<SoonTag href={n.href} /></Link>)}
          </nav>
        )}
        <div className="ax-tools">
          {bell && <NotifyBell lang={lang} />}
          <UserMenu loginClass="ax-login" lang={lang} />
          {onLang && (
            <div className="ax-pill" role="group" aria-label="ภาษา / Language">
              {LANGS.map(l => (
                <button key={l.id} type="button" lang={l.id} aria-pressed={(lang ?? "th") === l.id} title={l.name} onClick={() => onLang(l.id)}>{l.label}</button>
              ))}
            </div>
          )}
          {cta && <Link href="/shop" className="ax-btn solid">{L("เริ่มออกแบบ", "Start designing", "デザインを始める")}</Link>}
        </div>
      </div>
    </header>
  );
}
