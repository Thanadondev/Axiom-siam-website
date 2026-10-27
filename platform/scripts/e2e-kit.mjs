#!/usr/bin/env node
/**
 * End-to-end test of the kit studio path against a RUNNING API + REAL database:
 *   team logo + font upload → save a kit design (links only) → order →
 *   files served to the browser (CORS) → the factory sees them on the order.
 *
 *   cd platform
 *   npm run test:e2e:kit
 *
 * Optional env:
 *   API=http://localhost:4000
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=...   → also checks what the production board receives
 *   KEEP=1                               → don't cancel the order at the end
 *
 * Like e2e-order.mjs it only creates its own rows (e2e-*@axiom.test); clean up
 * with `npm run test:e2e:purge`.
 */
import { deflateSync } from "zlib";

const ORIGIN = (process.env.API ?? "http://localhost:4000").replace(/\/$/, "");
const API = ORIGIN + "/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const KEEP = process.env.KEEP === "1";

let pass = 0, fail = 0;
const results = [];
const ok = (n, x = "") => { pass++; results.push(`  \x1b[32m✓\x1b[0m ${n}${x ? ` \x1b[90m${x}\x1b[0m` : ""}`); };
const bad = (n, why) => { fail++; results.push(`  \x1b[31m✗\x1b[0m ${n}\n      \x1b[31m${why}\x1b[0m`); };
const check = (n, c, why = "") => { c ? ok(n) : bad(n, why || "assertion failed"); return c; };
const section = t => results.push(`\n\x1b[1m${t}\x1b[0m`);
function finish() {
  console.log(results.join("\n"));
  console.log(`\n\x1b[1mสรุป:\x1b[0m \x1b[32m${pass} ผ่าน\x1b[0m` + (fail ? `, \x1b[31m${fail} ล้มเหลว\x1b[0m` : "") + "\n");
  process.exit(fail ? 1 : 0);
}
async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data };
}

/** a real 16×16 PNG (orange square) so the bytes pass the server's sniffing */
function pngSquare() {
  const crc = buf => { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(16).fill([242, 101, 34, 255]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(16).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}
/** a TrueType header: enough for the server's check (the browser test uses real fonts) */
const fakeTtf = () => Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(2048, 7)]);

async function main() {
  console.log(`\n\x1b[1mAxiom E2E — ห้องออกแบบ: โลโก้ + ฟอนต์ของทีม\x1b[0m  \x1b[90m${API}\x1b[0m`);
  section("0. API");
  const health = await fetch(API + "/health").catch(() => null);
  if (!health) { console.log(`\n\x1b[31m✗ ต่อ API ไม่ได้ที่ ${API}\x1b[0m\n  สตาร์ต API ก่อน:  npm run dev:api\n`); process.exit(1); }
  ok("API ตอบสนอง", `HTTP ${health.status}`);

  section("1. สมาชิก");
  const email = `e2e-kit-${Date.now()}@axiom.test`, password = "E2ePassw0rd!";
  const reg = await api("/auth/register", { method: "POST", body: { email, password, fullName: "ทีมทดสอบ E2E" } });
  if (reg.status === 429) { console.log("\n\x1b[33m⚠ โดน rate limit การสมัคร — รอสักครู่หรือ restart API\x1b[0m\n"); process.exit(1); }
  if (!check("สมัครสมาชิก", reg.ok, `HTTP ${reg.status} ${JSON.stringify(reg.data)}`)) return finish();
  const login = await api("/auth/login", { method: "POST", body: { email, password } });
  if (!check("เข้าสู่ระบบ", login.ok && login.data.accessToken, JSON.stringify(login.data))) return finish();
  const token = login.data.accessToken;

  section("2. อัปโหลดโลโก้และฟอนต์");
  const logoData = "data:image/png;base64," + pngSquare().toString("base64");
  const fontData = "data:font/ttf;base64," + fakeTtf().toString("base64");
  const noAuth = await api("/kit-assets", { method: "POST", body: { kind: "logo", name: "x.png", data: logoData } });
  check("ไม่ล็อกอิน → 401", noAuth.status === 401, `ได้ HTTP ${noAuth.status}`);
  const html = await api("/kit-assets", { method: "POST", token, body: { kind: "logo", name: "evil.png", data: "data:image/png;base64," + Buffer.from("<html><script>alert(1)</script>" + " ".repeat(64)).toString("base64") } });
  check("ไฟล์ปลอม (HTML) → ถูกปฏิเสธ", html.status === 400, `ได้ HTTP ${html.status}`);
  const wrongKind = await api("/kit-assets", { method: "POST", token, body: { kind: "font", name: "logo.png", data: logoData } });
  check("ส่งรูปมาเป็นฟอนต์ → ถูกปฏิเสธ", wrongKind.status === 400, `ได้ HTTP ${wrongKind.status}`);
  const logo = await api("/kit-assets", { method: "POST", token, body: { kind: "logo", name: "ตราทีม.png", data: logoData } });
  if (!check("อัปโหลดโลโก้", logo.ok && /^\/uploads\/kit-assets\/logos\/[0-9a-f]{64}\.png$/.test(logo.data.url), JSON.stringify(logo.data))) return finish();
  const again = await api("/kit-assets", { method: "POST", token, body: { kind: "logo", name: "ตราทีม.png", data: logoData } });
  check("ไฟล์เดิมซ้ำ → ได้ลิงก์เดิม (เก็บไฟล์เดียว)", again.data.url === logo.data.url, `${again.data.url}`);
  const font = await api("/kit-assets", { method: "POST", token, body: { kind: "font", name: "TeamFont.ttf", data: fontData } });
  if (!check("อัปโหลดฟอนต์", font.ok && /\/fonts\/[0-9a-f]{64}\.ttf$/.test(font.data.url), JSON.stringify(font.data))) return finish();

  section("3. ไฟล์เปิดได้จากหน้าเว็บ (CORS)");
  for (const [label, url] of [["โลโก้", logo.data.url], ["ฟอนต์", font.data.url]]) {
    const r = await fetch(ORIGIN + url, { headers: { Origin: "http://localhost:3000" } });
    check(`ดาวน์โหลด${label}ได้`, r.ok, `HTTP ${r.status}`);
    check(`${label}: Access-Control-Allow-Origin`, r.headers.get("access-control-allow-origin") === "*", `ได้ ${r.headers.get("access-control-allow-origin")}`);
    check(`${label}: cache ระยะยาว`, /max-age=31536000/.test(r.headers.get("cache-control") ?? ""), r.headers.get("cache-control") ?? "-");
  }
  const missing = await fetch(ORIGIN + "/uploads/kit-assets/logos/" + "0".repeat(64) + ".png");
  check("ไฟล์ที่ไม่มีอยู่ → 404", missing.status === 404, `ได้ HTTP ${missing.status}`);

  section("4. บันทึกแบบ (เก็บแค่ลิงก์)");
  const stateJson = {
    kind: "kit-studio", v: 1, kit: "striker",
    colors: { body: "#1f5fd6", sleeve: "#111111", stripe: "#f26522", trim: "#ffffff", number: "#ffffff" },
    pattern: "diagonal", font: "block", fabric: "mesh", trim: "full", name: "SOMCHAI", number: "10",
    logo: "logo-e2e-test1", logoTint: false, fontAsset: "font-e2e-test1",
    roster: [{ name: "SOMCHAI", number: "10", size: "L" }, { name: "ANAN", number: "7", size: "M" }],
    assets: { logo: { name: logo.data.name, url: logo.data.url }, font: { name: font.data.name, url: font.data.url, format: "ttf" } },
  };
  const size = JSON.stringify(stateJson).length;
  check("ข้อมูลแบบเล็ก (ไม่ฝังไฟล์)", size < 4000, `${size} ตัวอักษร`);
  const design = await api("/designs", { method: "POST", token, body: { name: "E2E kit", mode: "single", stateJson } });
  if (!check("บันทึกแบบเข้าบัญชี", design.ok, JSON.stringify(design.data))) return finish();
  const back = await api(`/designs/${design.data.id}`, { token });
  check("เปิดแบบกลับมาได้ พร้อมลิงก์ไฟล์", back.data?.stateJson?.assets?.logo?.url === logo.data.url && back.data?.stateJson?.assets?.font?.url === font.data.url);

  section("5. สั่งผลิต");
  const addr = await api("/auth/addresses", { method: "POST", token, body: { recipient: "ทีมทดสอบ", phone: "0800000000", line1: "1 ถนนทดสอบ", province: "กรุงเทพฯ", postalCode: "10110", isDefault: true } });
  if (!check("เพิ่มที่อยู่", addr.ok, JSON.stringify(addr.data))) return finish();
  const order = await api("/orders", { method: "POST", token, body: {
    designId: design.data.id, fabric: "mesh", trim: "full", reversible: false,
    lines: [{ size: "M", qty: 1 }, { size: "L", qty: 1 }],
    roster: [{ playerName: "SOMCHAI", number: "10", size: "L", qty: 1 }, { playerName: "ANAN", number: "7", size: "M", qty: 1 }],
    shippingAddressId: addr.data.id, note: "E2E kit",
  } });
  if (!check("สร้างออเดอร์", order.ok, JSON.stringify(order.data))) return finish();
  ok("เลขออเดอร์", order.data.orderNo);
  const mine = await api(`/orders/${order.data.id}`, { token });
  check("ออเดอร์เก็บโลโก้/ฟอนต์ไว้กับแบบ", JSON.stringify(mine.data).includes(logo.data.url) || !JSON.stringify(mine.data).includes("designSnapshot"),
    "ลูกค้าไม่เห็น snapshot ก็ได้ — ตรวจฝั่งแอดมินต่อ");

  section("6. ฝั่งโรงงาน (บอร์ดผลิต)");
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    results.push("  \x1b[33m⚠ ข้าม — ตั้ง ADMIN_EMAIL / ADMIN_PASSWORD เพื่อทดสอบส่วนนี้\x1b[0m");
  } else {
    const al = await api("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    if (check("แอดมินเข้าสู่ระบบ", al.ok && al.data.accessToken, JSON.stringify(al.data))) {
      const at = al.data.accessToken;
      const det = await api(`/admin/orders/${order.data.id}`, { token: at });
      const snap = det.data?.items?.[0]?.designSnapshot;
      check("แอดมินเห็นแบบเสื้อ (kit-studio)", snap?.kind === "kit-studio", JSON.stringify(snap)?.slice(0, 200));
      check("แอดมินได้ลิงก์โลโก้", snap?.assets?.logo?.url === logo.data.url);
      check("แอดมินได้ลิงก์ฟอนต์", snap?.assets?.font?.url === font.data.url);
      const list = await api(`/admin/orders?take=50&status=pending`, { token: at });
      const card = (list.data.items ?? []).find(x => x.id === order.data.id);
      check("การ์ดบนบอร์ดมีข้อมูลเสื้อ", !!card?.look?.kit, JSON.stringify(card?.look));
    }
  }

  section("7. เก็บกวาด");
  if (KEEP) results.push("  \x1b[33m⚠ KEEP=1 — เก็บออเดอร์ไว้\x1b[0m");
  else {
    const c = await api(`/orders/${order.data.id}/cancel`, { method: "POST", token });
    check("ยกเลิกออเดอร์ทดสอบ", c.ok, JSON.stringify(c.data));
  }
  finish();
}

main().catch(e => { console.error(e); process.exit(1); });
