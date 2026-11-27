# _take-to-new — ของที่ยกไปโปรเจกต์ใหม่

คัดมาเฉพาะ Designer + DB + API ที่ตรงกับสเปกในสไลด์ (8 โมดูล) · รวบเมื่อ 24 ก.ค. 2569

## โครงสร้าง

| โฟลเดอร์ | คืออะไร | ตรงกับสไลด์ |
|---|---|---|
| `designer/engine/` | ตัว editor ทั้งชุด (index.html, editor.js, sizes.js, palette.js) — เปิดเป็น iframe ได้เลย | Module 03 Design |
| `designer/embed/design-page.tsx` | ตัวอย่างหน้าเว็บที่ฝัง editor + คุยผ่าน postMessage + เซฟผ่าน API `/designs` | Module 03 |
| `designer/fonts-route/route.ts` | API proxy โหลดฟอนต์ TTF จาก Google (จำเป็นตอน export SVG) — **ต้องเอาไปวางในเว็บใหม่ที่ path `/api/fonts/[family]`** | Module 03 |
| `designer/support/` | ชุดสี 28 สีเทียบงานปริ้นจริง (DTP-28color), clipPath ทรงเสื้อ, prototype เก่า | Module 03 |
| `db/` | Prisma schema 33 ตาราง + migrations + seed | ทุกโมดูล |
| `api/src/auth/` | สมัคร/ล็อกอิน/Google/ยืนยันอีเมล/2FA/rate-limit | Module 02 |
| `api/src/catalog/` + `market/` | สินค้า ผ้า/ไซส์/สี + ตลาดเทมเพลต + คอมมิชชัน | Module 04 |
| `api/src/studio/` | เซฟดีไซน์ + ใบเสนอราคา (คู่กับ designer) | Module 03 |
| `api/src/payments/` | PromptPay QR, สลิป+กันซ้ำ, ใบแจ้งหนี้ | Module 05 |
| `api/src/orders/` | ราคาขั้นบันได, state machine สถานะ, จัดส่ง | Module 05–06 |
| `api/src/admin/` + `settings/` + `notify/` | หลังบ้าน + ตั้งค่า + แจ้งเตือน | Module 07 |
| `web-reference/lib/` | logic ฝั่งหน้าเว็บที่มีเทสต์ (garment-options, order-draft) + api client เดิม | อ้างอิง |
| `models/` | jersey.glb, tank.glb | Module 01/04 |
| `scripts/e2e-order.mjs` | เทสต์ยิง flow สั่งซื้อครบวงจร — ใช้ตรวจระบบใหม่ | ทุกโมดูล |
| `docs/` | PROGRESS, ADMIN-PLAN, System Design | — |

## Designer ต้องการอะไรบ้างถึงจะรันได้

1. เสิร์ฟโฟลเดอร์ `designer/engine/` เป็น static (เดิมอยู่ที่ `/designer/index.html`)
2. มี route `/api/fonts/[family]` (ไฟล์ให้แล้ว) — ไม่มีอันนี้ export SVG จะแปลงฟอนต์ไม่ได้
3. หน้า parent ฝัง iframe + ฟัง postMessage (ดูตัวอย่างใน `embed/design-page.tsx`)
4. endpoint เซฟดีไซน์: `POST/GET /designs` (โค้ดอยู่ `api/src/studio/`) — ช่วงแรกยังไม่ทำก็ได้ editor ใช้งาน/export ได้ปกติ แค่เซฟเข้าบัญชีไม่ได้
5. โลโก้ `logo-mark-blue.png` (ใส่ไว้ใน engine แล้ว)
6. ไลบรารีโหลดจาก CDN: fabric.js 5.3.0, jszip, opentype.js — ต้องมีเน็ตตอนใช้

## ห้ามลืม

- **ห้ามเอา `.env` เดิมไปใช้** — สร้างใหม่จาก `env.example` แล้ว rotate ทุก key (JWT, Resend, Google OAuth)
- เปลี่ยนรหัสบัญชีทดสอบ test@test.com (เคยหลุดในแชต)
- DB: `npx prisma migrate dev` จาก `db/prisma/` แล้วรัน seed
- อย่า commit โฟลเดอร์นี้ทั้งก้อนลง git ใหม่ — เลือกวางตามโครงโปรเจกต์ใหม่
