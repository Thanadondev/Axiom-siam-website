/**
 * Promote a user to admin.
 *
 *   npm run make-admin -w packages/db -- you@example.com
 *
 * There is deliberately no "first user becomes admin" rule and no admin
 * self-signup: on a public site that is a takeover waiting to happen. Granting
 * admin requires shell access to the server, which is the point.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("\nUsage: npm run make-admin -w packages/db -- you@example.com\n");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, fullName: true },
  });

  if (!user) {
    console.error(`\n✗ ไม่พบผู้ใช้ ${email}`);
    const others = await prisma.user.findMany({
      select: { email: true, role: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    if (others.length) {
      console.error("\nบัญชีที่มีอยู่:");
      for (const u of others) console.error(`  ${u.email}  (${u.role})`);
    } else {
      console.error("\nยังไม่มีบัญชีในระบบเลย — สมัครที่ /register หรือล็อกอินด้วย Google ก่อน");
    }
    console.error("");
    process.exit(1);
  }

  if (user.role === "admin") {
    console.log(`\n✓ ${user.email} เป็น admin อยู่แล้ว\n`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
  console.log(`\n✓ ${user.email} : ${user.role} → admin`);
  console.log("  ออกจากระบบแล้วเข้าใหม่ เพื่อให้ token ใบใหม่มี role ที่อัปเดตแล้ว\n");
}

main()
  .catch(e => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
