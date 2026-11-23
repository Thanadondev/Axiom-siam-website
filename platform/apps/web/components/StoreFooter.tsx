import Link from "next/link";
import SoonTag from "./SoonTag";
import { tri, type Lang } from "../lib/i18n";
import { SITE_NAV } from "../lib/stations";

const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";

/**
 * The footer of every page but the home page (in the page's language, Thai by default): the same
 * stations as the header menu, your orders, and how to reach us (#contact).
 */
export default function StoreFooter({ lang = "th" }: { lang?: Lang }) {
  const L = tri(lang);
  return (
    <footer className="ax-foot">
      <div className="ax-wrap">
        <div style={{ maxWidth: 300 }}>
          <div className="ax-brand" style={{ marginBottom: 12 }}>
            <img src="/models/axiom-logo-white.png" alt="" />
            <b style={{ color: "var(--ax-ink)" }}>AXIOM SIAM</b>
          </div>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            {L("โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก", "A full-service sportswear factory: OEM/ODM, export quality", "スポーツウェアの一貫生産工場。OEM/ODM、輸出品質")}
          </p>
        </div>
        <div>
          <h4>{L("เมนู", "Menu", "メニュー")}</h4>
          {SITE_NAV.map(s => <Link key={s.href} href={s.href}>{L(...s.title)}<SoonTag href={s.href} /></Link>)}
          <Link href="/account">{L("ออเดอร์ของฉัน", "My orders", "注文履歴")}</Link>
        </div>
        <div id="contact">
          <h4>{L("ติดต่อ", "Contact", "お問い合わせ")}</h4>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <span style={{ display: "block", marginBottom: 6 }}>LINE: {CONTACT_LINE}</span>
          <Link href="/terms">{L("ข้อตกลง & เงื่อนไข", "Terms & conditions", "利用規約")}</Link>
        </div>
      </div>
      <div className="ax-wrap" style={{ paddingBottom: 32, fontSize: 12.5, color: "var(--ax-mute)" }}>© {new Date().getFullYear()} Axiom Siam Co.,Ltd. · All rights reserved.</div>
    </footer>
  );
}
