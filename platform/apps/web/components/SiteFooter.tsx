import Link from "next/link";

const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";

/** the footer of the dark storefront pages (/, /tracking) */
export default function SiteFooter({ th }: { th: boolean }) {
  return (
    <footer className="ax-foot">
      <div className="ax-wrap">
        <div style={{ maxWidth: 300 }}>
          <div className="ax-brand" style={{ marginBottom: 12 }}>
            <img src="/models/axiom-logo-white.png" alt="" />
            <b style={{ color: "var(--ax-ink)" }}>AXIOM SIAM</b>
          </div>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            {th ? "โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก" : "Full-service sportswear manufacturer. Export-quality OEM/ODM production."}
          </p>
        </div>
        <div>
          <h4>{th ? "เมนู" : "Menu"}</h4>
          <Link href="/shop">{th ? "ออกแบบเสื้อ" : "Design a kit"}</Link>
          <Link href="/design">{th ? "ออกแบบขั้นสูง" : "Advanced designer"}</Link>
          <Link href="/tracking">{th ? "ติดตามงาน" : "Track order"}</Link>
          <Link href="/templates">{th ? "ตลาดลาย" : "Templates"}</Link>
          <Link href="/account">{th ? "ติดตามออเดอร์" : "Track an order"}</Link>
        </div>
        <div>
          <h4>{th ? "ติดต่อ" : "Contact"}</h4>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <span style={{ display: "block", marginBottom: 6 }}>LINE: {CONTACT_LINE}</span>
          <Link href="/terms">{th ? "ข้อตกลง & เงื่อนไข" : "Terms"}</Link>
        </div>
      </div>
      <div className="ax-wrap" style={{ paddingBottom: 32, fontSize: 12.5, color: "var(--ax-mute)" }}>© {new Date().getFullYear()} Axiom Siam Co.,Ltd. · All rights reserved.</div>
    </footer>
  );
}
