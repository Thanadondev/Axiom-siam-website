#!/usr/bin/env node
/**
 * ลบข้อมูลที่ scripts/e2e-order.mjs สร้างไว้ (ออเดอร์ทดสอบที่ยกเลิกไม่ได้แล้ว)
 *
 *   npm run test:e2e:purge          # แสดงว่าจะลบอะไร แล้วถาม
 *   npm run test:e2e:purge -- --yes # ลบเลย
 *
 * ความปลอดภัย:
 *   - แตะเฉพาะบัญชีที่อีเมลลงท้าย @axiom.test (โดเมนสงวนของ e2e เท่านั้น)
 *   - ไม่แตะ @axiom.demo (ข้อมูลสาธิต) และไม่แตะบัญชีจริงเด็ดขาด
 *   - ออเดอร์/ที่อยู่/ดีไซน์ ถูกลบตาม cascade ของบัญชีนั้น
 *   - ปฏิเสธที่จะทำงานถ้า NODE_ENV=production
 */
import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";

const YES = process.argv.includes("--yes") || process.argv.includes("-y");
const E2E_DOMAIN = "@axiom.test";

if (process.env.NODE_ENV === "production") {
  console.error("\n\x1b[31m✗ ปฏิเสธ: NODE_ENV=production — สคริปต์นี้ใช้กับฐานข้อมูล dev เท่านั้น\x1b[0m\n");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: E2E_DOMAIN } },
    select: {
      id: true, email: true, createdAt: true,
      _count: { select: { orders: true, designs: true, addresses: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    console.log(`\n\x1b[32m✓ ไม่มีข้อมูล e2e ค้างอยู่\x1b[0m (ไม่พบบัญชี ${E2E_DOMAIN})\n`);
    return;
  }

  // guard: never touch anything outside the e2e domain
  const strays = users.filter(u => !u.email.endsWith(E2E_DOMAIN));
  if (strays.length) throw new Error("safety check failed: query returned non-e2e users");

  const orders = await prisma.order.findMany({
    where: { user: { email: { endsWith: E2E_DOMAIN } } },
    select: { orderNo: true, status: true, total: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n\x1b[1mจะลบ:\x1b[0m`);
  console.log(`  บัญชี ${users.length} รายการ`);
  for (const u of users) {
    console.log(`    \x1b[90m${u.email}\x1b[0m  ออเดอร์ ${u._count.orders} · ดีไซน์ ${u._count.designs} · ที่อยู่ ${u._count.addresses}`);
  }
  if (orders.length) {
    console.log(`  ออเดอร์ ${orders.length} รายการ`);
    for (const o of orders) console.log(`    \x1b[90m${o.orderNo}\x1b[0m  ${o.status}  ฿${o.total.toLocaleString()}`);
  }
  console.log(`\n  \x1b[90m(ที่อยู่ / ดีไซน์ / ใบแจ้งหนี้ / พัสดุ ของบัญชีเหล่านี้จะถูกลบตามไปด้วย)\x1b[0m`);

  if (!YES) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question(`\nพิมพ์ \x1b[1mDELETE\x1b[0m เพื่อยืนยัน: `)).trim();
    rl.close();
    if (ans !== "DELETE") {
      console.log("\n\x1b[33mยกเลิก — ไม่มีอะไรถูกลบ\x1b[0m\n");
      return;
    }
  }

  const ids = users.map(u => u.id);

  // Order has no cascade from User (it is a restrict-style relation in places),
  // so clear the order graph explicitly, deepest child first.
  const orderIds = (await prisma.order.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map(o => o.id);

  if (orderIds.length) {
    const itemIds = (await prisma.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })).map(i => i.id);
    await prisma.orderRoster.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }

  // print-file zips (bib orders): the rows, the files under UPLOAD_DIR/order-files/<user>,
  // and, for files kept in the S3 bucket ("s3:<key>"), the objects there.
  // The API resolves UPLOAD_DIR from apps/api, this script from the repo root: try both.
  const inBucket = (await prisma.orderFile.findMany({ where: { userId: { in: ids } }, select: { path: true, previewPath: true } }))
    .flatMap(f => [f.path, f.previewPath]).filter(p => p?.startsWith("s3:")).map(p => `order-files/${p.slice(3)}`);
  if (inBucket.length) {
    const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: key, S3_SECRET_ACCESS_KEY: secret, S3_ENDPOINT: endpoint } = process.env;
    if (!bucket || !key || !secret) {
      console.log(`\x1b[33m⚠ ${inBucket.length} ไฟล์อยู่ใน S3 แต่ไม่ได้ตั้งค่า S3 — ข้ามการลบใน bucket\x1b[0m`);
    } else {
      const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({ region: process.env.S3_REGION || "auto", endpoint: endpoint || undefined, forcePathStyle: Boolean(endpoint), credentials: { accessKeyId: key, secretAccessKey: secret } });
      for (const k of inBucket) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })).catch(e => console.log(`  ลบ ${k} ไม่ได้: ${e.message}`));
    }
  }
  await prisma.orderFile.deleteMany({ where: { userId: { in: ids } } });
  const { rm } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const upload = process.env.UPLOAD_DIR ?? "./uploads";
  for (const id of ids.filter(i => /^[0-9a-f-]{36}$/i.test(i))) {
    for (const base of [resolve(upload), resolve("apps/api", upload)]) {
      await rm(resolve(base, "order-files", id), { recursive: true, force: true });
    }
  }

  await prisma.design.deleteMany({ where: { userId: { in: ids } } });
  await prisma.address.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids }, email: { endsWith: E2E_DOMAIN } } });

  console.log(`\n\x1b[32m✓ ลบแล้ว\x1b[0m — บัญชี ${users.length}, ออเดอร์ ${orderIds.length}\n`);
}

main()
  .catch(e => { console.error(`\n\x1b[31mError: ${e.message}\x1b[0m\n`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
