# Axiom Siam — Platform (Monorepo)

เว็บไซต์ + แพลตฟอร์มสั่งผลิตเสื้อกีฬาออนไลน์ ครบวงจร
ตามเอกสารออกแบบระบบ `Axiom-Siam-System-Design-v1.1.docx`

> **สถานะ: Phase 0 — โครงระบบพร้อมแล้ว** ✅
> ต่อไป: Phase 1 (Auth → หน้าเว็บ → Designer → บันทึกดีไซน์ → ขอใบเสนอราคา)

---

## 🧱 Tech Stack

| ส่วน | เทคโนโลยี |
|------|-----------|
| Web (frontend) | Next.js 14 + React + TypeScript |
| API (backend) | NestJS + TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache / Queue | Redis |
| Storage | S3-compatible (Cloudflare R2 / AWS S3) |
| Payments | Stripe (ต่างประเทศ) + Omise/Opn (ไทย: PromptPay) |

## 📁 โครงสร้างโปรเจกต์

```
platform/
├── apps/
│   ├── web/            # Next.js — เว็บไซต์ + หน้า Designer
│   └── api/            # NestJS — REST API /api/v1
├── packages/
│   └── db/             # Prisma schema + client (@axiom/db)
│       └── prisma/schema.prisma   # ← โครงฐานข้อมูลทั้งหมด
├── docker-compose.yml  # Postgres + Redis (dev)
├── .github/workflows/ci.yml
├── .env.example
└── package.json        # npm workspaces
```

## 🚀 เริ่มต้นใช้งาน (Local Setup)

**ต้องมี:** Node.js 20+, Docker, npm

```bash
# 1) ตั้งค่า env
cp .env.example .env        # แล้วแก้ค่าตามต้องการ

# 2) เปิดฐานข้อมูล + redis
docker compose up -d

# 3) ติดตั้ง dependencies
npm install

# 4) สร้างตารางในฐานข้อมูล + seed ข้อมูลตั้งต้น
npm run db:migrate          # สร้าง migration แรกจาก schema
npm run db:seed             # ไซส์ / ผ้า / สินค้า / สีตัวอย่าง

# 5) รันแยกสองหน้าต่าง
npm run dev:api             # http://localhost:4000/api/v1/health
npm run dev:web             # http://localhost:3000
```

## 🗺️ Sitemap / โครงหน้าจอ (สำหรับ Phase 1)

**เว็บสาธารณะ**
- `/` หน้าแรก (3D hero)
- `/about` เกี่ยวกับเรา · `/services` บริการ · `/portfolio` ผลงาน · `/process` ขั้นตอน · `/contact` ติดต่อ

**บัญชีผู้ใช้**
- `/login` · `/register` · `/verify` · `/reset-password`
- `/account` โปรไฟล์/ที่อยู่ · `/account/designs` ดีไซน์ที่บันทึก · `/account/orders` คำสั่งซื้อ

**ออกแบบ & สั่งซื้อ**
- `/design` ระบบออกแบบเสื้อ (ต่อยอดจาก prototype เดิม)
- `/cart` ตะกร้า · `/checkout` ชำระเงิน · `/orders/:id` ติดตามสถานะ

**แอดมิน**
- `/admin` แดชบอร์ด · orders · production board · content/portfolio · quote requests

## 🧰 คำสั่งที่ใช้บ่อย

| คำสั่ง | หน้าที่ |
|--------|---------|
| `npm run up` / `npm run down` | เปิด/ปิด docker (postgres+redis) |
| `npm run db:migrate` | สร้าง/อัปเดตตาราง (Prisma migrate) |
| `npm run db:studio` | เปิด Prisma Studio ดู/แก้ข้อมูล |
| `npm run db:seed` | เติมข้อมูลตั้งต้น |
| `npm run dev:web` / `dev:api` | รัน frontend / backend |

## 🔐 Environment Variables

ดูรายการทั้งหมดใน `.env.example` (DB, Redis, JWT, S3, Email, Stripe, Omise, OAuth)
**อย่า commit ไฟล์ `.env` จริง**

## 📌 Roadmap ถัดไป

- **Phase 1 (MVP):** Auth + หน้าเว็บ + Designer + บันทึกดีไซน์ + ขอใบเสนอราคา
- **Phase 2:** ตะกร้า + คำสั่งซื้อ + ชำระเงิน + ติดตามพื้นฐาน
- **Phase 3:** Production board + แจ้งเตือน + Roster + ใบเสร็จ/คืนเงิน + Admin
- **Phase 4:** LINE + หลายสกุลเงิน + analytics + performance

(รายละเอียดทีละขั้นในเอกสารออกแบบระบบ หมวด 12)
