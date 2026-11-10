/**
 * The ten steps of the production line — the /tracking walk-through and the
 * tracker on each order use the same list (the API's production-steps.ts has
 * the names too, for notifications).
 *
 * Order.productionStep: 0 not started, 1–9 on the factory floor, 10 shipped.
 */

export interface ProductionStep { th: string; en: string; ja: string; h: string; hEn: string; hJa: string; p: string; pEn: string; pJa: string }

export const STEPS: ProductionStep[] = [
  { th: "ทำไฟล์", en: "Artwork", ja: "データ作成", h: "ทำ*ไฟล์", hEn: "The *file", hJa: "データ*作成",
    p: "ออกแบบและเตรียมไฟล์งานพิมพ์ วางแพทเทิร์นทุกชิ้นของเสื้อลงบนแผ่นงานให้พร้อมพิมพ์",
    pEn: "Design and prepare the print file: every pattern piece of the shirt laid out on the sheet, ready to print.",
    pJa: "印刷データを作成します。シャツの型紙パーツをすべてシートに配置して、印刷の準備をします。" },
  { th: "พิมพ์", en: "Printing", ja: "プリント", h: "*พิมพ์", hEn: "*Print", hJa: "*プリント",
    p: "พิมพ์ลายลงกระดาษซับลิเมชั่น ลายบนกระดาษจะกลับด้าน เพื่อให้ออกมาถูกด้านเมื่อรีดลงผ้า",
    pEn: "The design is printed on sublimation paper, mirrored, so it reads the right way round once it's on the fabric.",
    pJa: "昇華転写紙にデザインを印刷します。生地に転写したとき正しい向きになるよう、左右反転で印刷します。" },
  { th: "รีด", en: "Heat transfer", ja: "転写", h: "*รีด\nลงผ้า", hEn: "Heat\n*transfer", hJa: "生地へ\n*熱転写",
    p: "รีดลายจากกระดาษลงบนผ้าด้วยความร้อน หมึกซึมเข้าไปในเนื้อผ้า",
    pEn: "Heat presses the design from the paper into the fabric.",
    pJa: "熱プレスで紙のデザインを生地に転写します。インクが繊維の中まで染み込みます。" },
  { th: "ตัดเลเซอร์", en: "Laser cutting", ja: "レーザーカット", h: "ตัด*เลเซอร์", hEn: "Laser *cut", hJa: "レーザー*カット",
    p: "ตัดชิ้นงานผ้าตามแบบด้วยเลเซอร์ ตรงตามแพทเทิร์นทุกชิ้น",
    pEn: "Every piece is cut out by laser, following the pattern.",
    pJa: "型紙どおりに、すべてのパーツをレーザーで裁断します。" },
  { th: "QC ก่อนเข้าเย็บ", en: "QC before sewing", ja: "縫製前の検品", h: "QC\nก่อน*เข้าเย็บ", hEn: "QC before\n*sewing", hJa: "縫製前の\n*検品",
    p: "ตรวจสอบชิ้นงานหลังตัดหรือรีด ก่อนส่งเข้าไลน์เย็บ",
    pEn: "The pieces are checked after cutting and pressing, before they go to the sewing line.",
    pJa: "裁断・転写後のパーツを、縫製ラインに送る前に検品します。" },
  { th: "เย็บ", en: "Sewing", ja: "縫製", h: "*เย็บ", hEn: "*Sew", hJa: "*縫製",
    p: "ประกอบและเย็บเป็นตัวเสื้อผ้าสำเร็จรูป",
    pEn: "The pieces are assembled and sewn into the finished shirt.",
    pJa: "パーツを組み立てて縫い合わせ、シャツに仕上げます。" },
  { th: "QC ก่อนรีดแพ็ค", en: "QC before packing", ja: "梱包前の検品", h: "QC\nก่อน*รีดแพ็ค", hEn: "QC before\n*packing", hJa: "梱包前の\n*検品",
    p: "ตรวจสอบความเรียบร้อยของตัวเสื้อทั้งหมดก่อนแพ็คสินค้า",
    pEn: "Every finished shirt is checked over before it's packed.",
    pJa: "仕上がったシャツを1枚ずつ、梱包前に検品します。" },
  { th: "รีดไซส์", en: "Size label", ja: "サイズラベル", h: "รีด*ไซส์", hEn: "Size *label", hJa: "サイズ*ラベル",
    p: "รีดป้ายไซส์ลงบนเสื้อ",
    pEn: "The size label is heat-pressed onto the shirt.",
    pJa: "サイズラベルをシャツに熱圧着します。" },
  { th: "รีดและแพ็ค", en: "Press & pack", ja: "プレスと梱包", h: "รีด*และแพ็ค", hEn: "Press &\n*pack", hJa: "プレスと\n*梱包",
    p: "รีดเสื้อให้เรียบ พับ ใส่ถุง แล้วบรรจุลงกล่อง",
    pEn: "Pressed flat, folded, bagged and boxed.",
    pJa: "シワを伸ばしてたたみ、袋に入れて箱詰めします。" },
  { th: "จัดส่ง", en: "Delivery", ja: "出荷", h: "*จัดส่ง", hEn: "*Delivery", hJa: "*出荷",
    p: "ขึ้นรถ ส่งถึงทีมของคุณ",
    pEn: "Onto the truck and on its way to your team.",
    pJa: "トラックに積み込み、チームのもとへお届けします。" },
];

export const SHIP_STEP = STEPS.length;

/** the step to show for an order: shipped and later is the last step */
export function orderStep(status: string, productionStep?: number | null): number {
  if (status === "shipped" || status === "delivered" || status === "completed") return SHIP_STEP;
  return Math.max(0, Math.min(productionStep ?? 0, SHIP_STEP - 1));
}
