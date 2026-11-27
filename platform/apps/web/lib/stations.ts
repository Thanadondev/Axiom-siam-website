/**
 * The stations of the factory on the home page. Each one is a way into the site, and the
 * pages behind them show their station at the top (StationHero), so the whole site reads as
 * walking through the same factory. The pictures are public/factory/<id>-*.webp (each
 * station's own camera in AXIOM-WEB\3D Factory\garment_web_v2.blend).
 * Positions on the factory picture stay in FactoryHome.
 */
export type T3 = [string, string, string];

export interface Station {
  id: "printing" | "heatpress" | "laser" | "sewing" | "shipping" | "office";
  /** no href = the office: the card shows how to reach us */
  href?: string;
  /** what the button does */
  title: T3;
  /** the station it sits on */
  place: T3;
  /** one line about it */
  about: T3;
}

export const STATIONS: Station[] = [
  { id: "printing", href: "/order/bib", title: ["ออกแบบเอี๊ยม", "Design a bib", "ビブをデザイン"], place: ["เครื่องพิมพ์", "Printing", "プリント"],
    about: ["ออกแบบเอี๊ยมบนเว็บ เลือกสี ลาย ใส่ชื่อและเบอร์ทั้งทีม แล้วสั่งพิมพ์ได้เลย",
      "Design your team's bibs online: colours, pattern, every name and number, then order.",
      "ウェブでビブをデザイン。色・柄・チーム全員の名前と番号を入れてそのまま注文。"] },
  { id: "heatpress", href: "/order/upload", title: ["ส่งไฟล์เอง", "Send your own file", "データ入稿"], place: ["เครื่องรีดร้อน", "Heat press", "ヒートプレス"],
    about: ["มีไฟล์งานอยู่แล้ว อัปโหลด zip ของทีม แล้วเราผลิตให้",
      "Already have the artwork? Upload your team's zip and we make it.",
      "データをお持ちなら、チームの zip をアップロードするだけ。"] },
  { id: "laser", href: "/design", title: ["ออกแบบขั้นสูง", "Advanced designer", "詳細デザイン"], place: ["ตัดเลเซอร์", "Laser cutting", "レーザーカット"],
    about: ["ออกแบบอิสระบนแพทเทิร์นจริง ใส่ลาย รูป และตัวหนังสือได้ทุกตำแหน่ง",
      "Design freely on the real pattern: artwork, photos and text anywhere.",
      "実際の型紙に自由にデザイン。柄・写真・文字をどこにでも。"] },
  { id: "sewing", href: "/templates", title: ["ร้านแม่แบบ", "Template shop", "テンプレート"], place: ["ไลน์เย็บ", "Sewing line", "縫製ライン"],
    about: ["แบบสำเร็จรูปจากนักออกแบบ เลือกแบบที่ชอบแล้วใส่ชื่อทีมได้เลย",
      "Ready-made designs from designers: pick one and add your team.",
      "デザイナーのテンプレートから選んで、チーム名を入れるだけ。"] },
  { id: "shipping", href: "/tracking", title: ["ติดตามงาน", "Track order", "注文追跡"], place: ["แพ็กและส่ง", "Packing & shipping", "梱包・出荷"],
    about: ["ใส่เลขออเดอร์ ดูว่างานอยู่ขั้นไหนในไลน์ผลิต จนถึงวันส่ง",
      "Enter your order number to see where it is on the line, right up to shipping.",
      "注文番号で、製造ラインのどこにあるか出荷まで確認できます。"] },
  { id: "office", title: ["ติดต่อเรา", "Contact us", "お問い合わせ"], place: ["สำนักงาน", "Office", "オフィス"],
    about: ["ทีมกราฟิกและฝ่ายขายอยู่ที่นี่ ถามเรื่องงาน ราคา หรือส่งแบบมาให้ดูได้",
      "Our graphics and sales team sit here: ask about a job, prices, or send us a design.",
      "グラフィックと営業チームはここ。ご相談・お見積り・デザインの確認はお気軽に。"] },
];

export const station = (id: Station["id"]) => STATIONS.find(s => s.id === id)!;

/** the header menu: the stations that lead to a page, in the order of the line */
export const SITE_NAV = STATIONS.filter((s): s is Station & { href: string } => Boolean(s.href));
