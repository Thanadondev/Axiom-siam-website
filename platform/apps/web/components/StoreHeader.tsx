"use client";

import Link from "next/link";
import UserMenu from "./UserMenu";
import NotifyBell from "./NotifyBell";
import { LANGS, tri, type Lang } from "../lib/i18n";

/** Header for the dark storefront pages (/, /shop). */
export default function StoreHeader({
  lang, onLang, nav, bell = false, cta = true,
}: {
  lang?: Lang;
  onLang?: (l: Lang) => void;
  nav?: { href: string; label: string }[];
  /** order/payment notifications (signed-in pages) */
  bell?: boolean;
  /** the orange "start designing" button */
  cta?: boolean;
}) {
  const L = tri(lang ?? "th");
  return (
    <header className="ax-head">
      <div className="ax-wrap">
        <Link href="/" className="ax-brand" aria-label="Axiom Siam หน้าแรก">
          <img src="/models/axiom-logo-white.png" alt="" />
          <b>AXIOM<i>.</i></b>
        </Link>
        {nav && (
          <nav className="ax-nav" aria-label={L("เมนูหลัก", "Main menu", "メインメニュー")}>
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
