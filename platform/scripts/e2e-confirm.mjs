/**
 * Orders need a confirmed email, so an e2e account confirms its own after signing up.
 *
 *   API_LOG=<the API's console output file>  → the real link: read from the log
 *                                              (dev, no RESEND_API_KEY), sent to /auth/verify-email
 *   otherwise                                 → is_verified set straight in the dev database
 *                                              (DATABASE_URL from .env; @axiom.test accounts only)
 */
import { readFileSync } from "node:fs";

const E2E_DOMAIN = "@axiom.test";
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** every confirm link the API logged for this address, oldest first ([] when there's no log) */
export function loggedLinks(email) {
  const file = process.env.API_LOG;
  if (!file) return [];
  // eslint-disable-next-line no-control-regex
  const text = readFileSync(file, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  const re = new RegExp(`\\[verify-email\\] → ${escape(email)} : (\\S+)`, "g");
  return [...text.matchAll(re)].map(m => new URL(m[1]).searchParams.get("token")).filter(Boolean);
}

/** waits a moment for the API to write the line (its console is buffered) */
export async function waitForLink(email, count) {
  for (let i = 0; i < 20; i++) {
    const links = loggedLinks(email);
    if (links.length >= count) return links;
    await new Promise(r => setTimeout(r, 150));
  }
  return loggedLinks(email);
}

/** confirms the account; returns how ("link" | "db"), or throws */
export async function confirmEmail(api, email) {
  if (process.env.API_LOG) {
    const raw = (await waitForLink(email, 1)).at(-1);
    if (!raw) throw new Error(`ไม่พบลิงก์ยืนยันของ ${email} ใน ${process.env.API_LOG}`);
    const r = await api("/auth/verify-email", { method: "POST", body: { token: raw } });
    if (!r.ok) throw new Error(`ยืนยันอีเมลไม่สำเร็จ: HTTP ${r.status} ${JSON.stringify(r.data)}`);
    return "link";
  }
  if (process.env.NODE_ENV === "production") throw new Error("ปฏิเสธ: NODE_ENV=production");
  if (!email.endsWith(E2E_DOMAIN)) throw new Error(`ยืนยันตรงในฐานข้อมูลได้เฉพาะบัญชี ${E2E_DOMAIN}`);
  if (!process.env.DATABASE_URL) throw new Error("ไม่มี DATABASE_URL — รันผ่าน npm (โหลด .env ให้) หรือใส่ API_LOG");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const { count } = await prisma.user.updateMany({ where: { email, isVerified: false }, data: { isVerified: true } });
    if (!count) throw new Error(`ไม่พบบัญชี ${email} ที่ยังไม่ยืนยัน`);
  } finally { await prisma.$disconnect(); }
  return "db";
}

/**
 * The site launches with bibs only (apps/api/src/orders/launch.ts): without OPEN_ALL=1 the API
 * refuses a jersey, and a designer design without its print file, which is right — say so and stop
 * there; the rest of the flow needs the API (and this script) run with OPEN_ALL=1.
 */
const LAUNCH_REFUSALS = ["เปิดสั่งผลิตเฉพาะเอี๊ยม", "แบบนี้ยังไม่มีไฟล์ผลิต"];
export function bibsOnlyRefusal(res) {
  const msg = String(res.data?.message ?? "");
  return process.env.OPEN_ALL !== "1" && res.status === 400 && LAUNCH_REFUSALS.some(m => msg.includes(m));
}
export const OPEN_ALL_HINT = "ข้ามส่วนที่เหลือ — ช่วงนี้เปิดเฉพาะ Bib: รัน API ด้วย OPEN_ALL=1 แล้วรันสคริปต์นี้ด้วย OPEN_ALL=1";
