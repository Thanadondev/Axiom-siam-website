#!/usr/bin/env node
/**
 * End-to-end: สั่งผลิต bib ด้วยไฟล์ zip ของลูกค้าเอง
 *   สมัคร → อัปโหลด zip → ภาพตัวอย่าง → สร้างออเดอร์ → ดาวน์โหลดคืนด้วยลิงก์ที่ลงลายเซ็น
 *
 * Hits a RUNNING API against a REAL dev database. Creates an @axiom.test account
 * and cancels its own order; `npm run test:e2e:purge` clears it (files included).
 *
 *   cd platform
 *   npm run test:e2e:files
 *   SAMPLE_ZIP="Z:/path/to/job.zip" npm run test:e2e:files   # a real customer zip
 */
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";

const API = (process.env.API ?? "http://localhost:4000").replace(/\/$/, "");
const SAMPLE = process.env.SAMPLE_ZIP;

let pass = 0, fail = 0;
const check = (name, cond, why = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${name}${!cond && why ? `\n      \x1b[31m${why}\x1b[0m` : ""}`); return cond; };

async function api(path, { method = "GET", token, body, raw, headers = {} } = {}) {
  const res = await fetch(API + "/api/v1" + path, {
    method,
    headers: { ...(raw ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    ...(raw ? { duplex: "half" } : {}),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data };
}

/** something shaped like a customer's zip: the local-file signature, then bytes */
function fakeZip() { const b = Buffer.alloc(64 * 1024, 7); b.write("PK\u0003\u0004", 0, "latin1"); return b; }
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(400, 1)]);

async function main() {
  console.log(`\n\x1b[1mAxiom E2E — สั่ง bib ด้วยไฟล์ zip\x1b[0m  \x1b[90m${API}${SAMPLE ? ` · ${basename(SAMPLE)}` : ""}\x1b[0m`);
  const email = `e2e-files-${Date.now()}@axiom.test`, password = "E2ePassw0rd!";
  const reg = await api("/auth/register", { method: "POST", body: { email, password, fullName: "ผู้ทดสอบไฟล์ E2E" } });
  if (!check("สมัครสมาชิก", reg.ok, `HTTP ${reg.status} ${JSON.stringify(reg.data)}`)) return;
  const token = (await api("/auth/login", { method: "POST", body: { email, password } })).data.accessToken;
  const addr = await api("/auth/addresses", { method: "POST", token, body: { recipient: "ผู้ทดสอบ", phone: "0800000000", line1: "1 ถนนทดสอบ", province: "กรุงเทพฯ", postalCode: "10110", isDefault: true } });

  const q = await api("/orders/quote?totalQty=15&fabric=mesh&trim=none&garment=bib_r");
  check("ราคา R-bib 15 ตัว = 245/ตัว", q.data.unitPrice === 245 && q.data.subtotal === 3675, JSON.stringify(q.data));
  check("ราคา N-bib = 252/ตัว", (await api("/orders/quote?totalQty=3&fabric=C1&trim=full&garment=bib_n")).data.unitPrice === 252);

  check("ไม่ล็อกอิน อัปโหลดไม่ได้", (await api("/order-files", { method: "POST", raw: fakeZip(), headers: { "Content-Type": "application/zip" } })).status === 401);
  const notZip = await api("/order-files", { method: "POST", token, raw: Buffer.from("%PDF-1.7 not a zip ".repeat(10)), headers: { "Content-Type": "application/zip" } });
  check("ไฟล์ที่ไม่ใช่ zip ถูกปฏิเสธ", notZip.status === 400, `HTTP ${notZip.status}`);

  let want, up;
  const name = SAMPLE ? basename(SAMPLE) : "HF-000 (N) 0000 E2E TEAM R bib (ML).zip";
  const t0 = Date.now();
  if (SAMPLE) {
    const size = statSync(SAMPLE).size;
    const h = createHash("sha256");
    await new Promise((ok, no) => createReadStream(SAMPLE).on("data", c => h.update(c)).on("end", ok).on("error", no));
    want = h.digest("hex");
    up = await api("/order-files", { method: "POST", token, raw: Readable.toWeb(createReadStream(SAMPLE)), headers: { "Content-Type": "application/zip", "Content-Length": String(size), "X-File-Name": encodeURIComponent(name) } });
  } else {
    const z = fakeZip();
    want = createHash("sha256").update(z).digest("hex");
    up = await api("/order-files", { method: "POST", token, raw: z, headers: { "Content-Type": "application/zip", "X-File-Name": encodeURIComponent(name) } });
  }
  if (!check(`อัปโหลด zip (${((up.data.bytes ?? 0) / 1048576).toFixed(1)} MB ใน ${((Date.now() - t0) / 1000).toFixed(1)} วิ)`, up.ok && up.data.id, `HTTP ${up.status} ${JSON.stringify(up.data)}`)) return;
  check("ชื่อไฟล์ภาษาญี่ปุ่น/ไทยไม่เพี้ยน", up.data.name === name, up.data.name);
  check("แนบภาพตัวอย่าง", (await api(`/order-files/${up.data.id}/preview`, { method: "POST", token, body: { image: `data:image/jpeg;base64,${JPEG.toString("base64")}` } })).ok);

  const order = await api("/orders", { method: "POST", token, body: { fileId: up.data.id, product: "bib_r", lines: [{ size: "M", qty: 10 }, { size: "L", qty: 5 }], shippingAddressId: addr.data.id } });
  if (!check("สร้างออเดอร์ด้วยไฟล์", order.ok, `HTTP ${order.status} ${JSON.stringify(order.data)}`)) return;
  check("ยอด = 15 × 245 + ค่าส่ง", order.data.breakdown?.subtotal === 3675, JSON.stringify(order.data.breakdown));
  check("ใช้ไฟล์เดิมซ้ำไม่ได้", (await api("/orders", { method: "POST", token, body: { fileId: up.data.id, product: "bib_r", lines: [{ size: "M", qty: 1 }], shippingAddressId: addr.data.id } })).status === 400);

  const got = await api(`/orders/${order.data.id}`, { token });
  const f = got.data.files?.[0];
  check("ออเดอร์มีไฟล์และลิงก์", !!f?.downloadUrl && !!f?.previewUrl, JSON.stringify(got.data.files));
  check("สรุปสินค้า", got.data.fabricSummary === "R-bib (2 ด้าน) · ไฟล์ลูกค้า", got.data.fabricSummary);

  const dl = await fetch(API + f.downloadUrl);
  const h2 = createHash("sha256");
  for await (const c of dl.body) h2.update(c);
  check("ดาวน์โหลดคืนได้ไฟล์เดียวกันทุกไบต์ (sha256)", dl.ok && h2.digest("hex") === want);
  // an ASCII name comes as filename="…"; Japanese or Thai as filename*=UTF-8''…
  const cd = dl.headers.get("content-disposition") ?? "";
  const dlName = cd.includes("filename*=UTF-8''") ? decodeURIComponent(cd.split("filename*=UTF-8''")[1]) : (/filename="([^"]*)"/.exec(cd)?.[1] ?? "");
  check("ดาวน์โหลดได้ชื่อเดิม", dlName === name, cd);
  const pv = await fetch(API + f.previewUrl);
  check("ภาพตัวอย่างเปิดได้", pv.ok && (pv.headers.get("content-type") ?? "").startsWith("image/jpeg"));
  check("ลิงก์ที่แก้ลายเซ็นใช้ไม่ได้", (await fetch(API + f.downloadUrl.replace(/sig=../, "sig=xx"))).status === 404);
  check("ลิงก์ zip ใช้เปิดภาพไม่ได้ (คนละส่วน)", (await fetch(API + f.downloadUrl.replace("/zip?", "/preview?"))).status === 404);
  check("ไฟล์ไม่ได้เปิดเป็นไฟล์สาธารณะใต้ /uploads", (await fetch(`${API}/uploads/order-files/${got.data.user?.id ?? "x"}/${f.id}.zip`)).status === 404);

  check("ยกเลิกออเดอร์ทดสอบ", (await api(`/orders/${order.data.id}/cancel`, { method: "POST", token })).ok);
}

main()
  .catch(e => { fail++; console.log(`\x1b[31m✗ ${e?.stack ?? e}\x1b[0m`); })
  .finally(() => { console.log(`\n${fail ? "\x1b[31m" : "\x1b[32m"}${pass} ผ่าน · ${fail} ไม่ผ่าน\x1b[0m  (ล้างข้อมูล: npm run test:e2e:purge -- --yes)\n`); process.exit(fail ? 1 : 0); });
