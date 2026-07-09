#!/usr/bin/env node
/**
 * End-to-end smoke test: ออกแบบ → สั่งผลิต → ติดตามสถานะ
 *
 * Hits a RUNNING API (default http://localhost:4000) against a REAL database.
 * It only creates data; it cancels or leaves its own order behind and never
 * touches anyone else's rows.
 *
 *   cd platform
 *   npm run test:e2e
 *
 * Optional env:
 *   API=http://localhost:4000
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=...   → also tests the admin status flow
 *   KEEP=1                               → don't cancel the order at the end
 */

const API = (process.env.API ?? "http://localhost:4000").replace(/\/$/, "") + "/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const KEEP = process.env.KEEP === "1";

let pass = 0, fail = 0;
const results = [];

function ok(name, extra = "") {
  pass++; results.push(`  \x1b[32m✓\x1b[0m ${name}${extra ? ` \x1b[90m${extra}\x1b[0m` : ""}`);
}
function bad(name, why) {
  fail++; results.push(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${why}\x1b[0m`);
}
function check(name, cond, why = "") {
  cond ? ok(name) : bad(name, why || "assertion failed");
  return cond;
}
function eq(name, actual, expected) {
  const good = JSON.stringify(actual) === JSON.stringify(expected);
  good ? ok(name, `= ${JSON.stringify(actual)}`) : bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  return good;
}
const section = t => results.push(`\n\x1b[1m${t}\x1b[0m`);

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data };
}

/** the roster a user would type into the designer */
const ROSTER = [
  { playerName: "สมชาย", number: "10", size: "L" },
  { playerName: "สมหญิง", number: "7", size: "M" },
  { playerName: "อาทิตย์", number: "23", size: "XL" },
  { playerName: "ก้อง", number: "5", size: "L" },
  { playerName: "ไม่ระบุไซส์", number: "99", size: "M" }, // designer normalised "" → M
];
const LINES = [{ size: "M", qty: 2 }, { size: "L", qty: 2 }, { size: "XL", qty: 1 }];
const SPEC = { fabric: "B1", trim: "neck", reversible: false };

async function main() {
  console.log(`\n\x1b[1mAxiom E2E — ออกแบบ + สั่งออเดอร์\x1b[0m  \x1b[90m${API}\x1b[0m`);

  // ---------- 0. API alive ----------
  section("0. API");
  const health = await fetch(API.replace("/api/v1", "") + "/api/v1/health").catch(() => null);
  if (!health) {
    console.log(`\n\x1b[31m✗ ต่อ API ไม่ได้ที่ ${API}\x1b[0m\n  สตาร์ต API ก่อน:  npm run dev:api\n`);
    process.exit(1);
  }
  ok("API ตอบสนอง", `HTTP ${health.status}`);

  // ---------- 1. account ----------
  section("1. สมาชิก");
  const email = `e2e-${Date.now()}@axiom.test`;
  const password = "E2ePassw0rd!";

  const reg = await api("/auth/register", { method: "POST", body: { email, password, fullName: "ผู้ทดสอบ E2E" } });
  if (reg.status === 429) {
    console.log(results.join("\n"));
    console.log(
      "\n\x1b[33m⚠ โดน rate limit ของการสมัครสมาชิก (5 ครั้ง/ชม./IP)\x1b[0m\n" +
      "  สคริปต์นี้สมัคร 2 บัญชีต่อรอบ → รันได้ ~2 รอบต่อชั่วโมง\n" +
      "  วิธีแก้: รอสักครู่ หรือ restart API (ตัวนับเก็บใน memory)\n",
    );
    process.exit(1);
  }
  if (!check("สมัครสมาชิก", reg.ok, `HTTP ${reg.status}: ${JSON.stringify(reg.data)}`)) return finish();

  const login = await api("/auth/login", { method: "POST", body: { email, password } });
  if (!check("เข้าสู่ระบบ", login.ok && !!login.data.accessToken, `HTTP ${login.status}: ${JSON.stringify(login.data)}`)) return finish();
  const token = login.data.accessToken;

  // ---------- 2. pricing is public ----------
  section("2. ราคา (public)");
  const table = await api("/orders/price-table");
  check("ดึงตารางราคาได้โดยไม่ต้องล็อกอิน", table.ok);
  const tiers = (table.data.tiers ?? []).map(t => `${t.minQty}+:${t.price}`);
  ok("ขั้นราคา", tiers.join(" · "));

  const totalQty = LINES.reduce((s, l) => s + l.qty, 0);
  const quote = await api(`/orders/quote?totalQty=${totalQty}&fabric=${SPEC.fabric}&trim=${SPEC.trim}&reversible=false`);
  check("ขอราคาล่วงหน้าได้", quote.ok);
  eq("จำนวนรวม", quote.data.totalQty, 5);
  eq("ราคาขั้น (1–49)", quote.data.tierPrice, 300);
  eq("ราคา/ตัว (300 + B1 20 + คอ 10)", quote.data.unitPrice, 330);
  eq("ยอดสินค้า", quote.data.subtotal, 1650);
  eq("ค่าส่ง (ต่ำกว่า ฿3,500)", quote.data.shippingFee, 80);
  eq("ยอดรวม", quote.data.total, 1730);
  eq("ชำระก่อนผลิตเต็มจำนวน", quote.data.depositAmount, quote.data.total);

  // free shipping boundary
  const big = await api(`/orders/quote?totalQty=60&fabric=mesh&trim=none&reversible=false`);
  eq("60 ตัว → ขั้น ฿295", big.data.tierPrice, 295);
  eq("60 ตัว → ส่งฟรี", big.data.shippingFee, 0);

  // ---------- 3. design ----------
  section("3. ดีไซน์ (จำลองปุ่ม 'สั่งผลิตเลย')");
  const design = await api("/designs", {
    method: "POST", token,
    body: {
      name: "ทีม E2E (5 ตัว)",
      mode: "single",
      stateJson: { app: "axiom-roster", roster: ROSTER, template: { app: "axiom-designer", ...SPEC, size: "M" } },
      previewUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    },
  });
  if (!check("บันทึกดีไซน์", design.ok, JSON.stringify(design.data))) return finish();
  const designId = design.data.id;

  // ---------- 4. address ----------
  section("4. ที่อยู่จัดส่ง");
  const addr = await api("/auth/addresses", {
    method: "POST", token,
    body: { recipient: "ผู้ทดสอบ E2E", phone: "0800000000", line1: "123 ถนนทดสอบ", province: "กรุงเทพฯ", postalCode: "10110", isDefault: true },
  });
  if (!check("เพิ่มที่อยู่", addr.ok, JSON.stringify(addr.data))) return finish();
  const addressId = addr.data.id;

  // ---------- 5. guard rails ----------
  section("5. ระบบปฏิเสธข้อมูลผิด");
  const noLines = await api("/orders", { method: "POST", token, body: { designId, ...SPEC, lines: [], roster: [], shippingAddressId: addressId } });
  check("ไม่มีไซส์ → ถูกปฏิเสธ", noLines.status === 400, `ได้ HTTP ${noLines.status}`);

  const badSize = await api("/orders", { method: "POST", token, body: { designId, ...SPEC, lines: [{ size: "XXL", qty: 1 }], shippingAddressId: addressId } });
  check("ไซส์ที่ไม่มีจริง (XXL) → ถูกปฏิเสธ", badSize.status === 400, `ได้ HTTP ${badSize.status}`);

  const stolenAddr = await api("/orders", { method: "POST", token, body: { designId, ...SPEC, lines: LINES, shippingAddressId: "11111111-2222-4333-8444-555555555555" } });
  check("ที่อยู่ของคนอื่น → ถูกปฏิเสธ", stolenAddr.status === 400, `ได้ HTTP ${stolenAddr.status}`);

  const noAuth = await api("/orders", { method: "POST", body: { designId, ...SPEC, lines: LINES, shippingAddressId: addressId } });
  check("ไม่ล็อกอิน → 401", noAuth.status === 401, `ได้ HTTP ${noAuth.status}`);

  // ---------- 6. place the order ----------
  section("6. สั่งผลิต");
  const order = await api("/orders", {
    method: "POST", token,
    body: { designId, ...SPEC, lines: LINES, roster: ROSTER.map(r => ({ ...r, qty: 1 })), shippingAddressId: addressId, note: "ทดสอบอัตโนมัติ" },
  });
  if (!check("สร้างออเดอร์", order.ok, JSON.stringify(order.data))) return finish();
  const orderId = order.data.id;
  ok("เลขออเดอร์", order.data.orderNo);
  eq("ยอดรวมตรงกับที่เสนอราคาไว้", order.data.total, quote.data.total);
  eq("สถานะเริ่มต้น", order.data.status, "pending");

  // ---------- 7. read it back ----------
  section("7. อ่านออเดอร์กลับ");
  const got = await api(`/orders/${orderId}`, { token });
  if (!check("ดึงรายละเอียดออเดอร์", got.ok)) return finish();
  const o = got.data;

  eq("จำนวนบรรทัดไซส์", o.items.length, 3);
  const shirts = o.items.reduce((s, i) => s + i.qty, 0);
  eq("จำนวนเสื้อรวม = จำนวนรายชื่อ", shirts, ROSTER.length);

  const rosterRows = o.items.flatMap(i => i.roster ?? []);
  eq("บันทึกรายชื่อครบทุกคน", rosterRows.length, ROSTER.length);
  check("ชื่อไทยไม่เพี้ยน", rosterRows.some(r => r.playerName === "สมชาย"), "หาชื่อ 'สมชาย' ไม่เจอ");
  check("เบอร์เสื้อถูกเก็บ", rosterRows.some(r => r.number === "23"), "หาเบอร์ 23 ไม่เจอ");
  check("รายชื่อผูกกับไซส์ถูกต้อง", o.items.find(i => i.size === "L")?.roster?.length === 2, "ไซส์ L ควรมี 2 คน");
  check("สเปกถูกบันทึก", (o.fabricSummary ?? "").includes("B1"), `fabricSummary = ${o.fabricSummary}`);
  check("มีประวัติสถานะเริ่มต้น", (o.statusHistory ?? []).length >= 1);

  const mine = await api("/orders", { token });
  check("ออเดอร์โผล่ในรายการของฉัน", mine.ok && mine.data.some(x => x.id === orderId));

  // ---------- 7b. payments ----------
  section("7b. ชำระเงิน (Stripe)");
  const payStatus = await api("/payments/status");
  check("ถามสถานะระบบชำระเงินได้", payStatus.ok);
  if (!payStatus.data.enabled) {
    results.push("  \x1b[33m⚠ ข้าม — ยังไม่ได้ตั้ง STRIPE_SECRET_KEY ใน .env\x1b[0m");
  } else {
    ok("Stripe พร้อมใช้งาน", payStatus.data.livemode ? "\x1b[31mLIVE MODE\x1b[0m" : "test mode");
    if (payStatus.data.livemode) {
      results.push("  \x1b[31m✗ หยุด: กำลังใช้คีย์ LIVE — อย่ารัน e2e กับเงินจริง\x1b[0m");
      return finish();
    }
    const co = await api(`/payments/orders/${orderId}/checkout`, { method: "POST", token });
    check("สร้าง Checkout Session", co.ok, JSON.stringify(co.data));
    check("ได้ URL หน้าชำระเงินของ Stripe", /^https:\/\/checkout\.stripe\.com\//.test(co.data.url ?? ""), `url = ${co.data.url}`);
    eq("ยอดที่ส่งไป Stripe = ยอดออเดอร์", co.data.amount, quote.data.total);

    const st = await api(`/payments/orders/${orderId}/state`, { token });
    eq("ออเดอร์ยังไม่ถูกทำเป็น paid ก่อนจ่ายจริง", st.data.orderStatus, "pending");
    eq("มี payment รอชำระ", st.data.paymentStatus, "pending");

    const stealState = await api(`/payments/orders/${orderId}/state`, { token: "not.a.valid.token" });
    check("token ปลอมดูสถานะการชำระเงินไม่ได้", stealState.status === 401, `ได้ HTTP ${stealState.status}`);

    const badSig = await fetch(API + "/payments/webhook", {
      method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    check("webhook ที่ลายเซ็นผิด → ถูกปฏิเสธ", badSig.status === 400, `ได้ HTTP ${badSig.status}`);

    const noSig = await api("/payments/webhook", { method: "POST", body: { type: "checkout.session.completed" } });
    check("webhook ที่ไม่มีลายเซ็น → ถูกปฏิเสธ", noSig.status === 400, `ได้ HTTP ${noSig.status}`);

    const stillPending = await api(`/orders/${orderId}`, { token });
    eq("ออเดอร์ยัง pending หลัง webhook ปลอม", stillPending.data.status, "pending");
  }

  // ---------- 8. other users cannot read it ----------
  section("8. คนอื่นเปิดออเดอร์เราไม่ได้");
  const email2 = `e2e-b-${Date.now()}@axiom.test`;
  const reg2 = await api("/auth/register", { method: "POST", body: { email: email2, password, fullName: "คนอื่น" } });
  const login2 = reg2.ok ? await api("/auth/login", { method: "POST", body: { email: email2, password } }) : null;
  const token2 = login2?.data?.accessToken;

  if (!token2) {
    // without a valid second token the API answers 401 (no auth) instead of
    // 403 (wrong owner) — that would be a false failure, so say so plainly
    const why = reg2.status === 429
      ? "โดน rate limit สมัครสมาชิก (5/ชม./IP) — restart API แล้วรันใหม่"
      : `สมัคร/ล็อกอินผู้ใช้ที่สองไม่สำเร็จ (HTTP ${reg2.status})`;
    results.push(`  \x1b[33m⚠ ข้ามการทดสอบ 403 — ${why}\x1b[0m`);
  } else {
    const other = await api(`/orders/${orderId}`, { token: token2 });
    check("ผู้ใช้อื่น → 403", other.status === 403, `ได้ HTTP ${other.status}`);
  }

  // ---------- 9. admin flow ----------
  section("9. แอดมิน: เปลี่ยนสถานะ");
  let adminRan = false;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    results.push("  \x1b[33m⚠ ข้าม — ตั้ง ADMIN_EMAIL / ADMIN_PASSWORD เพื่อทดสอบส่วนนี้\x1b[0m");
  } else if (/^<.*>$/.test(ADMIN_PASSWORD)) {
    // "<รหัสผ่าน>" — the angle brackets were a placeholder, not part of the password
    bad("แอดมินเข้าสู่ระบบ", `ADMIN_PASSWORD ยังเป็น placeholder "${ADMIN_PASSWORD}" — เอาวงเล็บ < > ออก`);
  } else {
    const al = await api("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    // a bad admin password must not abort the run — we still need to clean up
    if (!check("แอดมินเข้าสู่ระบบ", al.ok, JSON.stringify(al.data))) return cleanup(orderId, order, token, false);
    adminRan = true;
    const at = al.data.accessToken;

    const listed = await api("/admin/orders?take=100", { token: at });
    check("ออเดอร์โผล่ในแอดมิน", listed.ok && listed.data.items.some(x => x.id === orderId));

    const skip = await api(`/admin/orders/${orderId}/status`, { method: "PATCH", token: at, body: { status: "shipped", trackingNo: "TH1" } });
    check("ข้ามขั้น pending → shipped ถูกปฏิเสธ", skip.status === 400, `ได้ HTTP ${skip.status}`);

    const paid = await api(`/admin/orders/${orderId}/status`, { method: "PATCH", token: at, body: { status: "paid", note: "e2e" } });
    check("pending → paid", paid.ok, JSON.stringify(paid.data));

    const afterPaid = await api(`/orders/${orderId}`, { token });
    check("ออกใบแจ้งหนี้อัตโนมัติเมื่อชำระเงิน", (afterPaid.data.invoices ?? []).length === 1,
      `invoices = ${JSON.stringify(afterPaid.data.invoices)}`);
    if (afterPaid.data.invoices?.[0]) {
      eq("ยอดใบแจ้งหนี้ = ยอดออเดอร์", afterPaid.data.invoices[0].amount, o.total);
    }

    await api(`/admin/orders/${orderId}/status`, { method: "PATCH", token: at, body: { status: "in_production" } });
    const noTrack = await api(`/admin/orders/${orderId}/status`, { method: "PATCH", token: at, body: { status: "shipped" } });
    check("จัดส่งโดยไม่ใส่เลขพัสดุ → ถูกปฏิเสธ", noTrack.status === 400, `ได้ HTTP ${noTrack.status}`);

    const shipped = await api(`/admin/orders/${orderId}/status`, { method: "PATCH", token: at, body: { status: "shipped", courier: "Flash", trackingNo: "TH-E2E-0001" } });
    check("จัดส่งพร้อมเลขพัสดุ", shipped.ok, JSON.stringify(shipped.data));

    const withShip = await api(`/orders/${orderId}`, { token });
    check("ลูกค้าเห็นเลขพัสดุ", withShip.data.shipments?.[0]?.trackingNo === "TH-E2E-0001",
      `shipments = ${JSON.stringify(withShip.data.shipments)}`);

    const backwards = await api(`/admin/orders/${orderId}/status`, { method: "PATCH", token: at, body: { status: "pending" } });
    check("ถอยสถานะกลับ → ถูกปฏิเสธ", backwards.status === 400, `ได้ HTTP ${backwards.status}`);

    const audit = await api("/admin/audit?take=50", { token: at });
    const mineAudit = (audit.data.items ?? []).filter(a => a.targetId === orderId);
    check("Audit trail บันทึกการเปลี่ยนสถานะออเดอร์", mineAudit.length > 0, "ไม่พบ audit ของออเดอร์นี้");
    check("Audit บันทึกอีเมลแอดมินที่ลงมือ", mineAudit[0]?.actorEmail === ADMIN_EMAIL,
      `actorEmail = ${mineAudit[0]?.actorEmail}`);
    check("Audit บันทึกทั้งครั้งที่สำเร็จและที่ถูกปฏิเสธ",
      mineAudit.some(a => a.ok) && mineAudit.some(a => !a.ok),
      `ok=${mineAudit.filter(a => a.ok).length} fail=${mineAudit.filter(a => !a.ok).length}`);

    const cust = await api("/admin/orders", { token }); // customer token
    check("ลูกค้าเปิดหน้าแอดมินไม่ได้ → 403", cust.status === 403, `ได้ HTTP ${cust.status}`);
  }
  // adminRan stays false when 2FA/creds fail, so cleanup can still cancel

  await cleanup(orderId, order, token, adminRan);
}

/**
 * Always runs, on every exit path — an aborted test must not leave a live
 * order behind. `advanced` = the admin moved it past `pending`, so the
 * customer-cancel route is no longer valid.
 */
async function cleanup(orderId, order, token, advanced) {
  section("10. เก็บกวาด");
  if (KEEP) {
    results.push(`  \x1b[33m⚠ KEEP=1 — ปล่อยออเดอร์ ${order.data.orderNo} ไว้ในระบบ\x1b[0m`);
  } else if (advanced) {
    results.push(`  \x1b[33m⚠ ออเดอร์เดินหน้าเกิน pending แล้ว ยกเลิกไม่ได้ — ลบด้วยมือถ้าต้องการ (${order.data.orderNo})\x1b[0m`);
  } else {
    const cancelled = await api(`/orders/${orderId}/cancel`, { method: "POST", token });
    check("ลูกค้ายกเลิกออเดอร์ที่ยังไม่จ่ายได้", cancelled.ok, JSON.stringify(cancelled.data));
    const twice = await api(`/orders/${orderId}/cancel`, { method: "POST", token });
    check("ยกเลิกซ้ำ → ถูกปฏิเสธ", twice.status === 400, `ได้ HTTP ${twice.status}`);
  }
  finish();
}

function finish() {
  console.log(results.join("\n"));
  console.log(`\n\x1b[1mสรุป:\x1b[0m \x1b[32m${pass} ผ่าน\x1b[0m` + (fail ? `, \x1b[31m${fail} ล้มเหลว\x1b[0m` : "") + "\n");
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error(results.join("\n"));
  console.error(`\n\x1b[31mError: ${e.message}\x1b[0m\n`);
  process.exit(1);
});
