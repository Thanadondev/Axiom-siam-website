/**
 * Order words in Thai, English and Japanese, shared by the order page and the
 * account's order list (teams in Japan order bibs by zip).
 */
import { tri, type Lang } from "./i18n";

export const ORDER_STATUS: Record<string, [string, string, string]> = {
  pending: ["รอชำระเงิน", "Awaiting payment", "お支払い待ち"],
  paid: ["ชำระแล้ว", "Paid", "お支払い済み"],
  approved: ["อนุมัติแบบแล้ว", "Design approved", "デザイン承認済み"],
  in_production: ["กำลังผลิต", "In production", "制作中"],
  shipped: ["จัดส่งแล้ว", "Shipped", "発送済み"],
  delivered: ["ได้รับแล้ว", "Delivered", "お届け済み"],
  completed: ["เสร็จสิ้น", "Completed", "完了"],
  cancelled: ["ยกเลิก", "Cancelled", "キャンセル"],
  refunded: ["คืนเงินแล้ว", "Refunded", "返金済み"],
};

export function orderStatus(lang: Lang, status: string) {
  const t = ORDER_STATUS[status];
  return t ? tri(lang)(t[0], t[1], t[2]) : status;
}

/** the API's Thai product summary ("R-bib (2 ด้าน) · ไฟล์ลูกค้า") in the page's language */
export function summaryIn(lang: Lang, s: string | null | undefined) {
  if (!s || lang === "th") return s ?? "";
  const ja = lang === "ja";
  const words: [RegExp, string, string][] = [
    [/\(2 ด้าน\)/g, "(reversible)", "（リバーシブル）"],
    [/ไฟล์ลูกค้า/g, "your files", "お客様データ"],
    [/2 ชิ้น \(reversible\)/g, "reversible", "リバーシブル"],
    [/ขลิบ:/g, "trim: ", "パイピング: "],
    [/เสื้อวอร์มซิป/g, "Zip warm-up top", "ジップアップジャージ"],
    [/เสื้อวอร์ม/g, "Warm-up top", "ジャージ"],
    [/กางเกงวอร์ม/g, "Track pants", "トラックパンツ"],
    [/เสื้อฮู้ด/g, "Hoodie", "パーカー"],
    [/กางเกง/g, "Shorts", "ショーツ"],
  ];
  return words.reduce((t, [re, en, j]) => t.replace(re, ja ? j : en), s);
}
