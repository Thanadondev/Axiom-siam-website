/**
 * Demo data seeder — 10 members + 10 marketplace templates (+ a few sales).
 *
 * Safe to re-run: everything is upserted by a natural key, so you get the same
 * 10 rows instead of 20. It never touches real users (only the demo emails).
 *
 *   npm run db:seed:demo
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo1234!";
const COMMISSION_PCT = 30;

const USERS = [
  { email: "somchai@axiom.demo", fullName: "สมชาย ใจดี", companyName: "ทีมสิงห์เหนือ", role: "customer", bio: "โค้ชฟุตบอลเยาวชน ชอบชุดสีสด" },
  { email: "nara@axiom.demo", fullName: "นารา ศรีสุข", companyName: "Nara Studio", role: "customer", bio: "กราฟิกดีไซเนอร์ ถนัดลายมินิมอล ประสบการณ์ 6 ปี" },
  { email: "pipat@axiom.demo", fullName: "พิพัฒน์ วงศ์ทอง", companyName: null, role: "customer", bio: "รับออกแบบชุดบาสเกตบอลและวิ่งมาราธอน" },
  { email: "kanya@axiom.demo", fullName: "กัญญา แสงเดือน", companyName: "Kanya Sportwear", role: "customer", bio: "ลายไทยประยุกต์บนชุดกีฬา" },
  { email: "thanet@axiom.demo", fullName: "ธเนศ ภูผา", companyName: "ทีมภูผา FC", role: "customer", bio: null },
  { email: "orn@axiom.demo", fullName: "อรพรรณ ทองดี", companyName: null, role: "customer", bio: "สายลายเรขาคณิต ไล่เฉดสี" },
  { email: "krit@axiom.demo", fullName: "กฤต อินทรีย์", companyName: "Krit Design", role: "customer", bio: "ออกแบบชุดวอลเลย์บอลและแบดมินตัน" },
  { email: "manee@axiom.demo", fullName: "มณี ประเสริฐ", companyName: "โรงเรียนสวนกุหลาบ", role: "customer", bio: null },
  { email: "staff@axiom.demo", fullName: "พนักงานขาย (สาธิต)", companyName: "Axiom Siam", role: "staff", bio: null },
  { email: "prod@axiom.demo", fullName: "ฝ่ายผลิต (สาธิต)", companyName: "Axiom Siam", role: "production", bio: null },
];

/** designer emails get the templates; index into USERS */
const TEMPLATES = [
  { name: "สิงห์เหนือ แดง-ดำ", category: "football", price: 150, designer: 0, tags: ["ฟุตบอล", "แดง"], desc: "ลายเสือพาดกลางลำตัว โทนแดง-ดำ" },
  { name: "Minimal Stripe Navy", category: "football", price: 120, designer: 1, tags: ["มินิมอล", "navy"], desc: "ริ้วบางแนวตั้ง เรียบหรู" },
  { name: "Gradient Wave Cyan", category: "running", price: 180, designer: 1, tags: ["ไล่เฉด", "วิ่ง"], desc: "คลื่นไล่เฉดฟ้า เหมาะกับผ้า mesh" },
  { name: "Court Hex Basketball", category: "basketball", price: 200, designer: 2, tags: ["บาส", "hex"], desc: "ลายหกเหลี่ยมโปร่ง ระบายอากาศดี" },
  { name: "Marathon Sunrise", category: "running", price: 0, designer: 2, tags: ["ฟรี", "วิ่ง"], desc: "แจกฟรี — ไล่เฉดพระอาทิตย์ขึ้น" },
  { name: "ลายไทยประยุกต์ ทอง-กรม", category: "football", price: 250, designer: 3, tags: ["ลายไทย", "ทอง"], desc: "กนกทองบนพื้นน้ำเงินกรมท่า" },
  { name: "Geometric Fade Lime", category: "volleyball", price: 160, designer: 5, tags: ["เรขาคณิต", "lime"], desc: "สามเหลี่ยมไล่ขนาด โทนเขียวมะนาว" },
  { name: "Smash Badminton White", category: "badminton", price: 140, designer: 6, tags: ["แบดมินตัน"], desc: "ขาวสะอาด แถบข้างสีส้ม" },
  { name: "Volley Block Purple", category: "volleyball", price: 175, designer: 6, tags: ["วอลเลย์บอล"], desc: "บล็อกสีม่วง-ขาว ตัดกันคม" },
  { name: "Reversible Bib Mono", category: "football", price: 90, designer: 1, tags: ["bib", "reversible"], desc: "เสื้อเอี๊ยมกลับด้าน ขาว-ดำ" },
];

/** a believable-but-tiny designer document so the template opens in the editor */
const stateFor = (name: string, color: string) => ({
  app: "axiom-designer",
  version: 1,
  style: 1,
  size: "L",
  fabric: "mesh",
  trim: "full",
  cutOn: true,
  cutMm: 7,
  bodyColor: color,
  objects: [{ type: "i-text", text: name, left: 200, top: 240, fontSize: 22, fill: "#ffffff" }],
});

const COLORS = ["#b91c1c", "#1e3a8a", "#0891b2", "#ea580c", "#f59e0b", "#1d4ed8", "#65a30d", "#f97316", "#7c3aed", "#111827"];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------- users ----------
  const users = [];
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, companyName: u.companyName, bio: u.bio, role: u.role as any },
      create: {
        email: u.email, passwordHash, fullName: u.fullName, companyName: u.companyName,
        bio: u.bio, role: u.role as any, isVerified: true,
      },
      select: { id: true, email: true, fullName: true },
    });
    users.push(row);
  }
  console.log(`✓ ${users.length} demo members`);

  // ---------- templates ----------
  const templates = [];
  for (let i = 0; i < TEMPLATES.length; i++) {
    const t = TEMPLATES[i];
    const designerId = users[t.designer].id;

    // no natural unique key on templates -> look one up by (designer, name)
    const existing = await prisma.marketTemplate.findFirst({ where: { designerId, name: t.name } });
    const data = {
      designerId,
      name: t.name,
      description: t.desc,
      category: t.category,
      tags: t.tags,
      price: t.price,
      previewUrl: `/portfolio/ex_0${(i % 4) + 1}.png`,
      stateJson: stateFor(t.name, COLORS[i]) as any,
      status: "published" as const,
      featured: i < 2, // first two show up first in the marketplace
    };
    const row = existing
      ? await prisma.marketTemplate.update({ where: { id: existing.id }, data, select: { id: true, name: true, price: true, designerId: true } })
      : await prisma.marketTemplate.create({ data, select: { id: true, name: true, price: true, designerId: true } });
    templates.push(row);
  }
  console.log(`✓ ${templates.length} marketplace templates`);

  // ---------- a few sales, so the admin dashboard isn't empty ----------
  // buyer index -> template index (buyer must not own the template)
  const SALES: [number, number][] = [[0, 1], [0, 3], [4, 0], [4, 6], [7, 5], [7, 2], [3, 8], [5, 7]];
  let sold = 0;
  for (const [buyerIdx, tplIdx] of SALES) {
    const buyer = users[buyerIdx];
    const tpl = templates[tplIdx];
    if (tpl.designerId === buyer.id) continue; // never buy your own

    const already = await prisma.templatePurchase.findUnique({
      where: { templateId_buyerId: { templateId: tpl.id, buyerId: buyer.id } },
    });
    if (already) continue;

    const platformFee = Math.round((tpl.price * COMMISSION_PCT) / 100);
    await prisma.templatePurchase.create({
      data: {
        templateId: tpl.id, buyerId: buyer.id, price: tpl.price,
        platformFee, designerEarning: tpl.price - platformFee,
        commissionPct: COMMISSION_PCT, status: "paid",
      },
    });
    await prisma.marketTemplate.update({ where: { id: tpl.id }, data: { salesCount: { increment: 1 } } });
    sold++;
  }
  console.log(`✓ ${sold} template sales`);

  const gross = await prisma.templatePurchase.aggregate({ _sum: { price: true, platformFee: true }, _count: true });
  console.log(`\nรวมทั้งระบบ: ขาย ${gross._count} ครั้ง · ยอดขาย ฿${gross._sum.price ?? 0} · รายได้แพลตฟอร์ม ฿${gross._sum.platformFee ?? 0}`);
  console.log(`\nล็อกอินบัญชีสาธิตได้ทุกอันด้วยรหัส: ${DEMO_PASSWORD}`);
  const perDesigner = await prisma.marketTemplate.groupBy({ by: ["designerId"], _count: true });
  const top = perDesigner.sort((a, b) => b._count - a._count)[0];
  const topUser = users.find(u => u.id === top?.designerId);
  if (topUser) console.log(`ตัวอย่างดีไซเนอร์: ${topUser.email} (${top._count} ลาย)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
