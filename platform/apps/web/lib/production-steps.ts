/**
 * The ten steps of the production line — the /tracking walk-through and the
 * tracker on each order use the same list (the API's production-steps.ts has
 * the names too, for notifications).
 *
 * Order.productionStep: 0 not started, 1–9 on the factory floor, 10 shipped.
 */

export interface ProductionStep { th: string; en: string; h: string; hEn: string; p: string; pEn: string }

export const STEPS: ProductionStep[] = [
  { th: "ทำไฟล์", en: "Artwork", h: "ทำ*ไฟล์", hEn: "The *file",
    p: "ออกแบบและเตรียมไฟล์งานพิมพ์ วางแพทเทิร์นทุกชิ้นของเสื้อลงบนแผ่นงานให้พร้อมพิมพ์",
    pEn: "Design and prepare the print file: every pattern piece of the shirt laid out on the sheet, ready to print." },
  { th: "พิมพ์", en: "Printing", h: "*พิมพ์", hEn: "*Print",
    p: "พิมพ์ลายลงกระดาษซับลิเมชั่น ลายบนกระดาษจะกลับด้าน เพื่อให้ออกมาถูกด้านเมื่อรีดลงผ้า",
    pEn: "The design is printed on sublimation paper, mirrored, so it reads the right way round once it's on the fabric." },
  { th: "รีด", en: "Heat transfer", h: "*รีด\nลงผ้า", hEn: "Heat\n*transfer",
    p: "รีดลายจากกระดาษลงบนผ้าด้วยความร้อน หมึกซึมเข้าไปในเนื้อผ้า",
    pEn: "Heat presses the design from the paper into the fabric." },
  { th: "ตัดเลเซอร์", en: "Laser cutting", h: "ตัด*เลเซอร์", hEn: "Laser *cut",
    p: "ตัดชิ้นงานผ้าตามแบบด้วยเลเซอร์ ตรงตามแพทเทิร์นทุกชิ้น",
    pEn: "Every piece is cut out by laser, following the pattern." },
  { th: "QC ก่อนเข้าเย็บ", en: "QC before sewing", h: "QC\nก่อน*เข้าเย็บ", hEn: "QC before\n*sewing",
    p: "ตรวจสอบชิ้นงานหลังตัดหรือรีด ก่อนส่งเข้าไลน์เย็บ",
    pEn: "The pieces are checked after cutting and pressing, before they go to the sewing line." },
  { th: "เย็บ", en: "Sewing", h: "*เย็บ", hEn: "*Sew",
    p: "ประกอบและเย็บเป็นตัวเสื้อผ้าสำเร็จรูป",
    pEn: "The pieces are assembled and sewn into the finished shirt." },
  { th: "QC ก่อนรีดแพ็ค", en: "QC before packing", h: "QC\nก่อน*รีดแพ็ค", hEn: "QC before\n*packing",
    p: "ตรวจสอบความเรียบร้อยของตัวเสื้อทั้งหมดก่อนแพ็คสินค้า",
    pEn: "Every finished shirt is checked over before it's packed." },
  { th: "รีดไซส์", en: "Size label", h: "รีด*ไซส์", hEn: "Size *label",
    p: "รีดป้ายไซส์ลงบนเสื้อ",
    pEn: "The size label is heat-pressed onto the shirt." },
  { th: "รีดและแพ็ค", en: "Press & pack", h: "รีด*และแพ็ค", hEn: "Press &\n*pack",
    p: "รีดเสื้อให้เรียบ พับ ใส่ถุง แล้วบรรจุลงกล่อง",
    pEn: "Pressed flat, folded, bagged and boxed." },
  { th: "จัดส่ง", en: "Delivery", h: "*จัดส่ง", hEn: "*Delivery",
    p: "ขึ้นรถ ส่งถึงทีมของคุณ",
    pEn: "Onto the truck and on its way to your team." },
];

export const SHIP_STEP = STEPS.length;

/** the step to show for an order: shipped and later is the last step */
export function orderStep(status: string, productionStep?: number | null): number {
  if (status === "shipped" || status === "delivered" || status === "completed") return SHIP_STEP;
  return Math.max(0, Math.min(productionStep ?? 0, SHIP_STEP - 1));
}
