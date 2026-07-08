# แผนพัฒนา Admin Dashboard — Axiom Siam Platform

> สถานะ: **วางแผน (ยังไม่เริ่มสร้าง)** · อัปเดต 8 ก.ค. 2026

## หลักการ & สิทธิ์ (RBAC)
- ใช้ role **`admin`** (มีใน enum `Role` แล้ว) — โครงพร้อม: `RolesGuard` + `@Roles("admin")` + `JwtAuthGuard`
- **API:** สร้าง module `admin` ทุก endpoint ป้องกันด้วย `@UseGuards(JwtAuthGuard, RolesGuard) @Roles("admin")`
- **Frontend:** เส้นทาง `/admin/*` — เช็ค `user.role === "admin"` ไม่ใช่ → redirect
- ตั้ง admin คนแรก: อัปเดต `role` ในตาราง users โดยตรง (SQL) หรือ seed script

---

## Phase 1 — MVP (ทำก่อน)

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

## Phase 2 — ต่อยอด
- **ออเดอร์/การผลิต:** จัดการ Order + OrderItem + สถานะการผลิต, Invoice, Shipment, Refund (model มีในสคีมาแล้ว)
- **ตั้งค่าระบบ:** % ค่าคอม, เวอร์ชันเงื่อนไข, หมวดหมู่, เทมเพลตแนะนำ (featured flag)
- **Catalog:** จัดการ Product / Fabric / Size / Color
- **แจ้งเตือน:** อีเมลถึงดีไซเนอร์เมื่อขายได้/ถูกถอด, ถึง admin เมื่อมีรายงาน

## Phase 3 — ขั้นสูง
- Analytics เชิงลึก (funnel, conversion, cohort), export CSV
- Audit trail viewer (ทุกการกระทำของ admin), rate-limit, 2FA admin
- ระบบตรวจจับภาพซ้ำ/ลิขสิทธิ์อัตโนมัติ (image hashing)

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
