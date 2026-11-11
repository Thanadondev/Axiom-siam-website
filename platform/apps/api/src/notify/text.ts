/**
 * Notification text in Thai, English and Japanese. A customer's notifications
 * are written in their language (User.locale: the language they last picked on
 * the site); staff notifications stay in Thai. The words match the web's
 * (apps/web/lib/production-steps.ts, lib/order-text.ts).
 */
export type Lang = "th" | "en" | "ja";
export interface Tri { th: string; en: string; ja: string }
/** plain Thai, or the three languages */
export type Text = string | Tri;

export const tri = (th: string, en: string, ja: string): Tri => ({ th, en, ja });
export const isLang = (v: unknown): v is Lang => v === "th" || v === "en" || v === "ja";
export function pick(t: Text | undefined, lang: Lang): string | undefined {
  if (t === undefined) return undefined;
  return typeof t === "string" ? t : t[lang] || t.th;
}

const STEPS: [string, string, string][] = [
  ["ทำไฟล์", "Artwork", "データ作成"],
  ["พิมพ์", "Printing", "プリント"],
  ["รีด", "Heat transfer", "転写"],
  ["ตัดเลเซอร์", "Laser cutting", "レーザーカット"],
  ["QC ก่อนเข้าเย็บ", "QC before sewing", "縫製前の検品"],
  ["เย็บ", "Sewing", "縫製"],
  ["QC ก่อนรีดแพ็ค", "QC before packing", "梱包前の検品"],
  ["รีดไซส์", "Size label", "サイズラベル"],
  ["รีดและแพ็ค", "Press & pack", "プレスと梱包"],
  ["จัดส่ง", "Delivery", "出荷"],
];

/** "Order AX-…: Step 3/10 · Heat transfer" */
export function stepTitle(orderNo: string, step: number, of: number): Tri {
  const s = STEPS[step - 1] ?? ["", "", ""];
  return tri(`ออเดอร์ ${orderNo}: ขั้นที่ ${step}/${of} · ${s[0]}`, `Order ${orderNo}: step ${step}/${of} · ${s[1]}`, `ご注文 ${orderNo}：工程 ${step}/${of} · ${s[2]}`);
}

const STATUS: Record<string, [string, string, string]> = {
  pending: ["รอชำระเงิน", "awaiting payment", "お支払い待ち"],
  paid: ["ชำระแล้ว", "paid", "お支払い済み"],
  approved: ["อนุมัติแบบแล้ว", "design approved", "デザイン承認済み"],
  in_production: ["กำลังผลิต", "in production", "制作中"],
  shipped: ["จัดส่งแล้ว", "shipped", "発送済み"],
  delivered: ["ได้รับแล้ว", "delivered", "お届け済み"],
  completed: ["เสร็จสิ้น", "completed", "完了"],
  cancelled: ["ยกเลิก", "cancelled", "キャンセル"],
  refunded: ["คืนเงินแล้ว", "refunded", "返金済み"],
};

/** "Order AX-…: shipped" */
export function statusTitle(orderNo: string, status: string): Tri {
  const s = STATUS[status] ?? [status, status, status];
  return tri(`ออเดอร์ ${orderNo}: ${s[0]}`, `Order ${orderNo}: ${s[1]}`, `ご注文 ${orderNo}：${s[2]}`);
}

/** the deposit / the whole amount / the balance, as in "payment of the deposit confirmed" */
export const DUE: Record<string, Tri> = {
  deposit: tri("มัดจำ", "deposit", "前金"),
  full: tri("ยอดเต็ม", "full amount", "全額"),
  balance: tri("ส่วนที่เหลือ", "balance", "残額"),
};

export const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;
