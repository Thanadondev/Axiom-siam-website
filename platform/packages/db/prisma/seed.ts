import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Sizes (real cm from the designer patterns)
  const sizes = [
    { code: "S", label: "S", widthCm: 45.886, heightCm: 55.4847, sortOrder: 1 },
    { code: "M", label: "M", widthCm: 51.886, heightCm: 60.4736, sortOrder: 2 },
    { code: "L", label: "L", widthCm: 60.886, heightCm: 70.4023, sortOrder: 3 },
    { code: "XL", label: "XL", widthCm: 68.286, heightCm: 76.4023, sortOrder: 4 },
  ];
  for (const s of sizes) {
    await prisma.size.upsert({ where: { code: s.code }, update: s, create: s });
  }

  // Fabrics
  const fabrics = [
    { code: "Mesh", name: "Mesh (ผ้าตาข่าย)", priceAdj: 0 },
    { code: "B1", name: "B1", priceAdj: 0 },
    { code: "C1", name: "C1", priceAdj: 0 },
  ];
  for (const f of fabrics) {
    await prisma.fabric.upsert({ where: { code: f.code }, update: f, create: f });
  }

  // Base product
  await prisma.product.upsert({
    where: { slug: "reversible-bib" },
    update: {},
    create: {
      slug: "reversible-bib",
      name: "เสื้อ Bibs (Reversible)",
      nameEn: "Reversible Bibs",
      description: "เสื้อกล้ามกีฬาใส่กลับด้านได้",
      basePrice: 19000, // 190.00 THB in satang
    },
  });

  // A few chart colors (full 280-color palette imported from palette.js in app setup)
  const colors = [
    { hex: "#ec008c", cmyk: "C0 M100 Y0 K0", name: "Magenta", colorGroup: "magenta" },
    { hex: "#ed1c24", cmyk: "C0 M100 Y100 K0", name: "Red", colorGroup: "red" },
    { hex: "#00aeef", cmyk: "C100 M0 Y0 K0", name: "Cyan", colorGroup: "cyan" },
    { hex: "#231f20", cmyk: "C0 M0 Y0 K100", name: "Black", colorGroup: "black" },
  ];
  for (const c of colors) {
    await prisma.color.upsert({ where: { hex: c.hex }, update: c, create: c });
  }

  console.log("Seed complete: sizes, fabrics, product, colors");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
