# แผนพัฒนา Admin Dashboard — Axiom Siam Platform

> สถานะ: **เฟส 1 + เฟส 2 เสร็จแล้ว** · อัปเดต 9 ก.ค. 2026
>
> เหลือ: ระบบชำระเงินจริง (Omise/Stripe) · เฟส 3 (analytics เชิงลึก, audit trail, 2FA, image hashing)

## หลักการ & สิทธิ์ (RBAC)
- ใช้ role **`admin`** (มีใน enum `Role` แล้ว) — โครงพร้อม: `RolesGuard` + `@Roles("admin")` + `JwtAuthGuard`
- **API:** สร้าง module `admin` ทุก endpoint ป้องกันด้วย `@UseGuards(JwtAuthGuard, RolesGuard) @Roles("admin")`
- **Frontend:** เส้นทาง `/admin/*` — เช็ค `user.role === "admin"` ไม่ใช่ → redirect
- ตั้ง admin คนแรก: อัปเดต `role` ในตาราง users โดยตรง (SQL) หรือ seed script

---

## Phase 1 — ✅ เสร็จครบแล้ว

### 1. Dashboard ภาพรวม + รายงานยอดขาย/รายได้
- **ดู:** สมาชิกทั้งหมด / ใหม่ (7วัน,30วัน), ยอดขายตลาดลาย (จำนวน+บาท), รายได้แพลตฟอร์ม (ผลรวม platformFee), รายได้ดีไซเนอร์ค้างจ่าย, quote ค้าง, เทมเพลตทั้งหมด/รอตรวจ
- **กราฟ:** ยอดขายรายวัน/เดือน, top templates, top designers, top categories
- **API:** `GET /admin/stats`, `GET /admin/sales?range=`
- **หน้า:** `/admin` (การ์ด KPI + กราฟ Chart.js/recharts)

### 2. ตรวจตลาดลาย (Moderation) + คิวรายงานละเมิด
- **ดู/ทำ:** เทมเพลตทั้งหมด (filter สถานะ/หมวด/ดีไซเนอร์), **ถอด/ระงับ** (unlist), ดูยอดขาย/รายได้ต่อเทมเพลต
- **คิวรายงาน:** รายการที่ผู้ใช้กด "รายงานละเมิด" → ตรวจ → ถอด + (ถ้าจำเป็น) ยึดรายได้ + ระงับบัญชี
- **log:** ดู `TermsAcceptance` (หลักฐานยอมรับเงื่อนไข) ต่อเทมเพลต/ผู้ใช้
- **ต้องเพิ่ม (prereq):** model `TemplateReport` + ปุ่ม "รายงาน" หน้า `/templates/[id]`
- **API:** `GET/PATCH /admin/templates`, `GET /admin/reports`, `PATCH /admin/reports/:id`, `POST /admin/templates/:id/takedown`
- **หน้า:** `/admin/marketplace`, `/admin/reports`

### 3. จัดการสมาชิก
- **ดู/ทำ:** ค้นหา, ดูโปรไฟล์ + ดีไซน์/การซื้อ/รายได้, ตั้ง role (customer/staff/production/admin), **ระงับ/แบน** บัญชี
- **ต้องเพิ่ม (prereq):** field `suspendedAt DateTime?` ใน User + เช็คใน login
- **API:** `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id` (role/suspend)
- **หน้า:** `/admin/users`, `/admin/users/[id]`

### 4. จ่ายเงินดีไซเนอร์ (Payout) + Quote
- **Payout:** สรุปรายได้ดีไซเนอร์ค้างจ่าย (ผลรวม designerEarning ที่ยังไม่จ่าย) → **กด "จ่ายแล้ว"** (บันทึกรอบจ่าย)
- **ต้องเพิ่ม (prereq):** model `DesignerPayout` (designerId, amount, periodFrom/To, paidAt, note) หรือ flag `paidOut` + `payoutId` ใน TemplatePurchase
- **Quote:** ดูคำขอราคาที่เข้ามา (จากปุ่ม "ขอราคา"), เปลี่ยนสถานะ, บันทึกโน้ต
- **API:** `GET /admin/payouts`, `POST /admin/payouts`, `GET /admin/quotes`, `PATCH /admin/quotes/:id`
- **หน้า:** `/admin/payouts`, `/admin/quotes`

---

## Phase 2 — ✅ เสร็จแล้ว
- ✅ **ออเดอร์/การผลิต:** Orders API + เครื่องคิดราคาขั้นบันได, state machine สถานะ, ประวัติสถานะ, Shipment + เลขพัสดุ (บังคับกรอกตอนกด "จัดส่งแล้ว"), แท็บ 🧵 ออเดอร์ผลิต
- ✅ **ใบแจ้งหนี้:** ออกอัตโนมัติเมื่อสถานะเป็น `paid` (idempotent) + หน้า `/orders/[id]/invoice` พิมพ์/บันทึก PDF ได้ (แยก VAT 7%)
- ✅ **ตั้งค่าระบบ:** ตาราง `settings` + แท็บ ⚙️ ตั้งค่า — ขั้นราคา, ส่วนเพิ่มผ้า/ขลิบ, ค่าส่ง, ส่งฟรีเมื่อครบ, % ชำระก่อนผลิต, % ค่าคอม, เวอร์ชันข้อตกลง (cache 30 วิ + fallback default)
- ✅ **เทมเพลตแนะนำ (featured):** ปุ่มในแท็บตลาดลาย + เรียงขึ้นก่อนในตลาด
- ✅ **Catalog:** แท็บ 🎨 ผ้า/ไซส์/สี — CRUD (ผ้าที่มีดีไซน์ใช้อยู่จะถูกปิดใช้งานแทนการลบ) + `GET /catalog` สาธารณะ
- ✅ **แจ้งเตือน:** 🔔 กระดิ่งบน header (นับที่ยังไม่อ่าน, poll ทุก 60 วิ) — แจ้งลูกค้าเมื่อสถานะออเดอร์เปลี่ยน, แจ้งดีไซเนอร์เมื่อขายลายได้, แจ้ง admin เมื่อมีออเดอร์ใหม่/รายงานละเมิด · เขียนลง `notifications` + log อีเมล (MailService ยังเป็น stub — ต่อ Resend ทีหลัง)

## Phase 2 — ยังไม่ทำ
- Refund flow (model มีแล้ว), Product CRUD (ยังไม่ได้ใช้จริง)
- ส่งอีเมลจริง (ต่อ Resend เข้ากับ MailService)

## Phase 3 — ✅ เสร็จแล้ว
- ✅ **Analytics เชิงลึก:** funnel (สมัคร→ออกแบบ→สั่ง→จ่าย), รายได้รายเดือน 12 เดือน (แยกตลาดลาย/ออเดอร์ผลิต), cohort ตามเดือนที่สมัคร
- ✅ **Export CSV:** ออเดอร์ / ยอดขายลาย / สมาชิก / การจ่ายเงิน / audit — มี BOM ให้ Excel อ่านไทยได้ และ**กัน CSV formula injection**
- ✅ **Audit trail:** interceptor บันทึกทุก request ที่เปลี่ยนข้อมูลในแอดมิน (ใคร/ทำอะไร/เป้าหมาย/IP/สำเร็จหรือไม่) ปิดบัง password/token/secret · แท็บ 🕵️ ค้นหาได้
- ✅ **Rate limit:** sliding window ไม่ใช้ dependency — login 10/5นาที, สมัคร 5/ชม., ขอรีเซ็ตรหัส 5/15นาที, รายงานละเมิด 10/ชม. (ตอบ 429 + Retry-After)
- ✅ **2FA (TOTP):** RFC 6238 เขียนเองด้วย node:crypto (ผ่าน test vectors ของ RFC), รหัสสำรอง 8 รหัส (เก็บเป็น hash, ใช้ได้ครั้งเดียว), บังคับตอน login เมื่อเปิดใช้
- ✅ **ตรวจจับภาพซ้ำ:** sha256 ของภาพพรีวิวตอนเผยแพร่ → ถ้าตรงกับลายของดีไซเนอร์คนอื่น สร้างรายงานอัตโนมัติ + แจ้งแอดมิน

> ข้อจำกัดที่ต้องรู้: การตรวจจับภาพซ้ำจับได้เฉพาะ **ภาพที่เหมือนกันทุกไบต์** ถ้าย่อ/เปลี่ยนสี/บันทึกใหม่จะจับไม่ได้ — ต้องใช้ perceptual hash (pHash/dHash) ซึ่งต้องมี image decoder เพิ่ม
>
> rate limit เก็บใน memory ของ process เดียว ถ้า scale หลาย instance ต้องเปลี่ยนไปใช้ Redis (โครงรองรับไว้แล้ว)

---

## สรุป DB ที่ต้องเพิ่มก่อนสร้าง Admin
| ต้องเพิ่ม | ใช้กับ |
|---|---|
| `TemplateReport` (รายงานละเมิด) | Phase 1 – moderation |
| `User.suspendedAt` (ระงับบัญชี) | Phase 1 – users |
| `DesignerPayout` หรือ `TemplatePurchase.paidOut` | Phase 1 – payout |
| `MarketTemplate.featured` (Bool) | Phase 2 – featured |
| `TermsAcceptance` | ✅ มีแล้ว |

## ลำดับแนะนำ
1) เพิ่ม prereq models + admin guard/module skeleton
2) Dashboard (เห็นภาพรวมก่อน)
3) Moderation + reports (สำคัญด้านกฎหมาย/ลิขสิทธิ์)
4) Users
5) Payout + Quote
