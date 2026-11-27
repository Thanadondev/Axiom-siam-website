#!/usr/bin/env node
/**
 * ตรวจว่าเซิร์ฟเวอร์ส่งอีเมลจริงได้ (ออเดอร์ต้องมาจากบัญชีที่ยืนยันอีเมลแล้ว — ส่งไม่ได้ = ลูกค้าใหม่สั่งผลิตไม่ได้)
 *
 *   cd platform
 *   npm run mail:test -- you@example.com     # ส่งอีเมลทดสอบ 1 ฉบับผ่าน Resend ด้วยค่าใน .env
 *   npm run mail:test                         # ตรวจค่าใน .env อย่างเดียว ไม่ส่ง
 *
 * ใช้ RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_SITE_URL ชุดเดียวกับที่ API ใช้ (apps/api/src/auth/mail.service.ts)
 */
const to = process.argv[2];
const key = process.env.RESEND_API_KEY || "";
const from = process.env.EMAIL_FROM || "Axiom Siam <onboarding@resend.dev>";
const site = process.env.NEXT_PUBLIC_SITE_URL || "";

let bad = 0;
const line = (good, text, fix = "") => { if (!good) bad++; console.log(`  ${good ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${text}${!good && fix ? `\n      \x1b[90m${fix}\x1b[0m` : ""}`); };

console.log("\n\x1b[1mAxiom — ตรวจระบบอีเมล\x1b[0m\n");
line(!!key, key ? `RESEND_API_KEY ตั้งแล้ว (${key.slice(0, 3)}…, ${key.length} ตัวอักษร)` : "RESEND_API_KEY ยังไม่ได้ตั้ง",
  "สร้าง API key ที่ resend.com → API Keys แล้วใส่ใน .env ของเซิร์ฟเวอร์ จากนั้น restart API");
line(!from.includes("onboarding@resend.dev"), `EMAIL_FROM = ${from}`,
  "onboarding@resend.dev ส่งได้เฉพาะอีเมลเจ้าของบัญชี Resend — ยืนยันโดเมนที่ resend.com → Domains แล้วใช้อีเมลบนโดเมนนั้น");
line(!!site && !/localhost|127\.0\.0\.1/.test(site), `NEXT_PUBLIC_SITE_URL = ${site || "(ว่าง)"}`,
  "ต้องเป็นที่อยู่เว็บจริง เช่น https://axiomsiam.com ไม่งั้นลิงก์ในอีเมลเปิดไม่ได้");

if (!to) {
  console.log(`\n${bad ? "\x1b[31m" : "\x1b[32m"}${bad ? `${bad} ข้อต้องแก้` : "ค่าครบ"}\x1b[0m — ใส่อีเมลต่อท้ายเพื่อส่งทดสอบจริง: npm run mail:test -- you@example.com\n`);
  process.exit(bad ? 1 : 0);
}
if (!key) { console.log("\n\x1b[31mส่งทดสอบไม่ได้: ยังไม่มี RESEND_API_KEY\x1b[0m\n"); process.exit(1); }

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from, to,
    subject: "ทดสอบระบบอีเมล — Axiom Siam",
    html: `<p>อีเมลทดสอบจากเซิร์ฟเวอร์ Axiom Siam ถ้าได้รับฉบับนี้ แปลว่าอีเมลยืนยันของลูกค้าส่งได้แล้ว</p><p>${site}</p>`,
  }),
}).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
const body = await res.text();
if (res.ok) {
  console.log(`\n\x1b[32m✓ Resend รับแล้ว\x1b[0m (${body}) — เปิดกล่องจดหมาย ${to} (ดูในจดหมายขยะด้วย)\n`);
} else {
  const hint = res.status === 401 || res.status === 403 && /api key/i.test(body) ? "API key ผิดหรือถูกลบ — สร้างใหม่ที่ resend.com → API Keys"
    : res.status === 403 ? "โดเมนของ EMAIL_FROM ยังไม่ได้ยืนยัน หรือใช้ onboarding@resend.dev ส่งไปอีเมลอื่น — resend.com → Domains"
    : res.status === 422 ? "EMAIL_FROM หรืออีเมลปลายทางรูปแบบไม่ถูกต้อง"
    : res.status === 0 ? "ต่อ api.resend.com ไม่ได้ — ตรวจอินเทอร์เน็ต/ไฟร์วอลล์ของเซิร์ฟเวอร์"
    : "ดูข้อความจาก Resend ด้านบน";
  console.log(`\n\x1b[31m✗ ส่งไม่สำเร็จ: HTTP ${res.status}\x1b[0m ${body}\n  ${hint}\n`);
}
process.exit(res.ok ? 0 : 1);
