"use client";

import Link from "next/link";
import AppShell from "../../components/AppShell";
import { tri, useLang } from "../../lib/i18n";

/**
 * Shown at the address of every page that isn't open yet (middleware.ts,
 * lib/launch.ts): the site opens with bibs first.
 */
export default function ComingSoonPage() {
  const [lang, setLang] = useLang();
  const L = tri(lang);
  return (
    <AppShell narrow lang={lang} onLang={setLang}>
      <div className="acard" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div className="eyebrow">Coming soon</div>
        <h1 className="ax-display" style={{ fontSize: "clamp(40px, 9vw, 72px)", margin: "8px 0 12px" }}>Coming <em>soon</em></h1>
        <p className="asub" style={{ maxWidth: 460, margin: "0 auto 24px", lineHeight: 1.8 }}>
          {L(
            "ส่วนนี้กำลังจะเปิดเร็ว ๆ นี้ ตอนนี้เปิดสั่งผลิตเอี๊ยม (Bib) ก่อน ออกแบบบนเว็บหรือส่งไฟล์ .zip ของทีมมาได้เลย",
            "This part of the site opens soon. For now we're taking bib orders: design your bibs on the web or send your team's .zip.",
            "このページは近日公開です。現在はビブスのご注文を受け付けています。Webでデザインするか、チームの.zipを入稿してください。",
          )}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/order/bib" className="ax-btn solid">{L("ออกแบบเอี๊ยมบนเว็บ", "Design bibs", "ビブスをデザイン")}</Link>
          <Link href="/order/upload" className="ax-btn ghost">{L("สั่งผลิตด้วยไฟล์ .zip", "Order with your .zip", ".zipで入稿・注文")}</Link>
          <Link href="/" className="ax-btn ghost">{L("หน้าแรก", "Home", "ホーム")}</Link>
        </div>
      </div>
    </AppShell>
  );
}
