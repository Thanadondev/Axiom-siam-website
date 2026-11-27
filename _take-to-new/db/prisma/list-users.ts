/**
 * Who is in the system, and what can they do.
 *
 *   npm run users -w packages/db
 *
 * Flags accounts whose email differs only by case — those are duplicates
 * caused by an unnormalised signup, and they are why "I'm admin but the site
 * says 403" happens: you are logged into the other one.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, role: true, fullName: true,
      passwordHash: true, isVerified: true, createdAt: true, suspendedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!users.length) {
    console.log("\nยังไม่มีบัญชีในระบบ\n");
    return;
  }

  console.log(`\n${users.length} บัญชี:\n`);
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(pad("EMAIL", 34), pad("ROLE", 10), pad("SIGN-IN", 16), "VERIFIED");
  console.log("─".repeat(78));

  for (const u of users) {
    const how = u.passwordHash ? "password" : "Google only";
    console.log(
      pad(u.email, 34),
      pad(u.role + (u.suspendedAt ? " (ระงับ)" : ""), 10),
      pad(how, 16),
      u.isVerified ? "✓" : "✗",
    );
  }

  // duplicates that differ only by case — the classic cause of a phantom 403
  const byLower = new Map<string, string[]>();
  for (const u of users) {
    const k = u.email.toLowerCase();
    byLower.set(k, [...(byLower.get(k) ?? []), u.email]);
  }
  const dupes = [...byLower.entries()].filter(([, v]) => v.length > 1);
  if (dupes.length) {
    console.log("\n⚠ พบบัญชีที่ซ้ำกันเมื่อไม่สนตัวพิมพ์เล็ก-ใหญ่:");
    for (const [k, v] of dupes) console.log(`   ${k} → ${v.join("  |  ")}`);
    console.log("   นี่คือสาเหตุที่ตั้ง admin ใบหนึ่งแล้วอีกใบยังเข้าไม่ได้");
  }

  const admins = users.filter(u => u.role === "admin");
  console.log(`\nadmin ${admins.length} คน: ${admins.map(a => a.email).join(", ") || "— ไม่มีเลย"}\n`);
}

main()
  .catch(e => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
