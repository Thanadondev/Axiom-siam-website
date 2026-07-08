# Axiom Siam Co.,Ltd. — Sportswear Manufacturing Platform

โรงงานผลิตเสื้อผ้ากีฬา OEM/ODM — เว็บไซต์ + ระบบสมาชิก + โปรแกรมออกแบบเสื้อ (Designer) ครบวงจร

## โครงสร้าง

```
platform/                     # โมโนเรโป (npm workspaces)
  apps/
    web/                      # เว็บหน้าบ้าน (Next.js 14, App Router)
      app/                    # หน้า landing, account, login, design ฯลฯ
      public/designer/        # Designer — เอดิเตอร์เวกเตอร์ (Fabric.js) ฝังผ่าน iframe
    api/                      # หลังบ้าน (NestJS 10 — auth, studio/designs, quotes)
  packages/db/                # Prisma schema + client (PostgreSQL)
  docker-compose.yml          # Postgres + Redis สำหรับ dev
portfolio/                    # ไฟล์ผลงานตัวอย่าง (.svg)
Axiom-Siam-*.docx / .pptx     # เอกสารสถาปัตยกรรม + pitch deck
```

## ฟีเจอร์หลัก

- **Landing 3D** เลื่อนดูได้ + 2 ธีม (ขาว-น้ำเงิน / ดำ-มิ้นต์) + portfolio ผลงานจริง
- **ระบบสมาชิก** — สมัคร/เข้าสู่ระบบ (JWT), ลืม/รีเซ็ตรหัส, ยืนยันอีเมล, โปรไฟล์, ที่อยู่
- **Designer** — เอดิเตอร์เวกเตอร์สไตล์ Illustrator บนทรงเสื้อจริงขนาดจริง: รูปทรง/ปากกา/ข้อความ/รูปภาพ, สีตัว-ขลิบ, ลาย sublimation, ฟอนต์, layer, export PNG/SVG ขนาดจริง (มม.)
- **New Order (Wizard)** — รีออเดอร์ทีม: วางรายชื่อ → วางชื่อ-เบอร์อัตโนมัติ (9 รูปแบบ) → สร้าง ZIP ทั้งทีม / บันทึกเข้าบัญชี
- **ระบบผ้า** — 3 ชนิด (mesh/B1/C1) × 4 ระดับขลิบ × 4 ไซซ์, เส้นตัดเลเซอร์, จัดวางตาม export

## เริ่มใช้งาน (dev)

```bash
cd platform
cp apps/api/.env.example apps/api/.env   # ตั้งค่า env ตามตัวอย่าง
docker compose up -d                      # Postgres + Redis
npm install
npm run dev                               # web (:3000) + api (:3001)
```

> หมายเหตุ: ไฟล์วิดีโออ้างอิง (`platform/video/*.mp4`) และไฟล์ทดสอบไม่ถูกเก็บใน git (ดู `.gitignore`) — สำรองแยกต่างหาก
