import Link from "next/link";

const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";

/** Footer for the dark storefront pages outside the landing page. */
export default function StoreFooter() {
  return (
    <footer className="ax-foot">
      <div className="ax-wrap">
        <div style={{ maxWidth: 300 }}>
          <div className="ax-brand" style={{ marginBottom: 12 }}>
            <img src="/models/axiom-logo-white.png" alt="" />
            <b style={{ color: "var(--ax-ink)" }}>AXIOM SIAM</b>
          </div>
          <p style={{ margin: 0, lineHeight: 1.7 }}>โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก</p>
        </div>
        <div>
          <h4>เมนู</h4>
          <Link href="/shop">ออกแบบเสื้อ</Link>
          <Link href="/design">ออกแบบขั้นสูง</Link>
          <Link href="/templates">ตลาดลาย</Link>
          <Link href="/account">ติดตามออเดอร์</Link>
        </div>
        <div>
          <h4>ติดต่อ</h4>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <span style={{ display: "block", marginBottom: 6 }}>LINE: {CONTACT_LINE}</span>
          <Link href="/terms">ข้อตกลง & เงื่อนไข</Link>
        </div>
      </div>
      <div className="ax-wrap" style={{ paddingBottom: 32, fontSize: 12.5, color: "var(--ax-mute)" }}>© {new Date().getFullYear()} Axiom Siam Co.,Ltd. · All rights reserved.</div>
    </footer>
  );
}
