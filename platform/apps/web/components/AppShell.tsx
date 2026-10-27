"use client";

import { useMemo, type ReactNode } from "react";
import StoreHeader from "./StoreHeader";
import StoreFooter from "./StoreFooter";
import JerseyStage from "./JerseyStage";
import { KITS, defaultConfig } from "../lib/kits";
import "../app/app.css";
import "../app/home.css";

const NAV = [
  { href: "/shop", label: "ออกแบบเสื้อ" },
  { href: "/templates", label: "ตลาดลาย" },
  { href: "/design", label: "ออกแบบขั้นสูง" },
];

/**
 * Frame for the account-side pages (account, orders, admin, terms…): the
 * storefront header and footer around a centred column, in the same dark
 * brand theme as the shop. `auth` turns it into the split sign-in layout:
 * a kit turning in 3D beside the form.
 */
export default function AppShell({
  children, narrow = false, wide = false, auth = false,
}: {
  children: ReactNode;
  narrow?: boolean;
  wide?: boolean;
  /** sign-in / sign-up style page: form on the right, brand stage on the left */
  auth?: boolean;
}) {
  return (
    <div className="app ax">
      <StoreHeader nav={NAV} bell cta={!auth} />
      {auth ? (
        <div className="ax-auth">
          <AuthStage />
          <main className="ax-auth-form">{children}</main>
        </div>
      ) : (
        <main className={`app-main${narrow ? " app-narrow" : ""}${wide ? " app-wide" : ""}`}>{children}</main>
      )}
      {!auth && <StoreFooter />}
    </div>
  );
}

function AuthStage() {
  // a different kit each day, so returning visitors see the range
  const kit = useMemo(() => KITS[Math.floor(Date.now() / 86400000) % KITS.length], []);
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
