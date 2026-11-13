import Link from "next/link";
import SoonTag from "./SoonTag";
import { tri, type Lang } from "../lib/i18n";

const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";

/** the footer of the dark storefront pages (/, /tracking) */
export default function SiteFooter({ lang }: { lang: Lang }) {
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
            {L("โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก", "Full-service sportswear manufacturer. Export-quality OEM/ODM production.", "スポーツウェアの一貫生産工場。輸出品質のOEM/ODMに対応しています。")}
          </p>
        </div>
        <div>
          <h4>{L("เมนู", "Menu", "メニュー")}</h4>
          <Link href="/shop">{L("ออกแบบเสื้อ", "Design a kit", "ユニフォームをデザイン")}</Link>
          <Link href="/design">{L("ออกแบบขั้นสูง", "Advanced designer", "詳細デザインエディタ")}<SoonTag href="/design" /></Link>
          <Link href="/tracking">{L("ติดตามงาน", "Track order", "注文追跡")}</Link>
          <Link href="/templates">{L("ตลาดลาย", "Templates", "テンプレート")}<SoonTag href="/templates" /></Link>
          <Link href="/account">{L("ติดตามออเดอร์", "Track an order", "注文履歴")}</Link>
        </div>
        <div>
          <h4>{L("ติดต่อ", "Contact", "お問い合わせ")}</h4>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <span style={{ display: "block", marginBottom: 6 }}>LINE: {CONTACT_LINE}</span>
          <Link href="/terms">{L("ข้อตกลง & เงื่อนไข", "Terms", "利用規約")}</Link>
        </div>
      </div>
      <div className="ax-wrap" style={{ paddingBottom: 32, fontSize: 12.5, color: "var(--ax-mute)" }}>© {new Date().getFullYear()} Axiom Siam Co.,Ltd. · All rights reserved.</div>
    </footer>
  );
}
