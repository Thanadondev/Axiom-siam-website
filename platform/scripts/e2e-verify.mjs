#!/usr/bin/env node
/**
 * End-to-end: สั่งผลิตได้เฉพาะบัญชีที่ยืนยันอีเมลแล้ว
 *   สมัคร → สั่งไม่ได้ (403) → ขอลิงก์ใหม่ → ลิงก์เก่าใช้ไม่ได้ → ขอเกิน 3 ครั้ง/ชม. (429) → ยืนยัน → สั่งได้
 *
 * Hits a RUNNING API against a REAL dev database. Creates an @axiom.test account and cancels
 * its own order; `npm run test:e2e:purge` clears it. Never touches the demo or real accounts.
 *
 *   cd platform
 *   API_LOG=<the API's console output> npm run test:e2e:verify   # all cases (the links come from the log)
 *   npm run test:e2e:verify                                       # without it the link cases are skipped
 *   REPORT_JSON=out.json …                                        # the results as JSON too
 *
 * The link can be sent again 3 times an hour per account (counted in the database), and each run
 * makes a new account, so runs don't wait on each other. Sign-ups are 5 an hour per IP.
 */
import { writeFileSync } from "node:fs";
import { confirmEmail, loggedLinks, waitForLink } from "./e2e-confirm.mjs";

const API = (process.env.API ?? "http://localhost:4000").replace(/\/$/, "");
const HAVE_LOG = !!process.env.API_LOG;
const RESENDS = 3; // the API's RESEND_VERIFY_PER_HOUR

const results = [];
const record = (id, name, status, detail = "") => {
  results.push({ id, name, status, detail });
  const mark = { pass: "\x1b[32m✓", fail: "\x1b[31m✗", skip: "\x1b[33m–" }[status];
  console.log(`  ${mark}\x1b[0m ${id} ${name}${detail && status !== "pass" ? `\n      \x1b[90m${detail}\x1b[0m` : detail ? ` \x1b[90m(${detail})\x1b[0m` : ""}`);
  return status === "pass";
};
const check = (id, name, cond, detail = "") => record(id, name, cond ? "pass" : "fail", detail);
const skip = (id, name, why) => record(id, name, "skip", why);

async function api(path, { method = "GET", token, body, raw, headers = {} } = {}) {
  const res = await fetch(API + "/api/v1" + path, {
    method,
    headers: { ...(raw ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}
const show = r => `HTTP ${r.status} ${JSON.stringify(r.data)}`;
function fakeZip() { const b = Buffer.alloc(32 * 1024, 7); b.write("PK\u0003\u0004", 0, "latin1"); return b; }

async function main() {
  console.log(`\n\x1b[1mAxiom E2E — ยืนยันอีเมลก่อนสั่งผลิต\x1b[0m  \x1b[90m${API}${HAVE_LOG ? "" : " · ไม่มี API_LOG: ข้ามเคสที่ต้องใช้ลิงก์จริง"}\x1b[0m\n`);
  const email = `e2e-verify-${Date.now()}@axiom.test`, password = "E2ePassw0rd!";

  // ---- setup: a new account with an address and an uploaded zip
  const reg = await api("/auth/register", { method: "POST", body: { email, password, fullName: "ผู้ทดสอบยืนยันอีเมล E2E" } });
  if (!check("V01", "สมัครสมาชิกใหม่", reg.ok, reg.ok ? "" : show(reg))) return;
  const token = (await api("/auth/login", { method: "POST", body: { email, password } })).data.accessToken;
  if (!check("V02", "เข้าสู่ระบบได้ทั้งที่ยังไม่ยืนยันอีเมล", !!token)) return;
  const me0 = await api("/auth/me", { token });
  check("V03", "บัญชีใหม่ยังไม่ยืนยัน (isVerified = false)", me0.data.isVerified === false, `isVerified = ${me0.data.isVerified}`);
  const addr = await api("/auth/addresses", { method: "POST", token, body: { recipient: "ผู้ทดสอบ", phone: "0800000000", line1: "1 ถนนทดสอบ", province: "กรุงเทพฯ", postalCode: "10110", isDefault: true } });
  const up = await api("/order-files", { method: "POST", token, raw: fakeZip(), headers: { "Content-Type": "application/zip", "X-File-Name": encodeURIComponent("E2E VERIFY R bib.zip") } });
  if (!addr.ok || !up.ok) { check("V00", "เตรียมที่อยู่และไฟล์ zip", false, `${show(addr)} / ${show(up)}`); return; }
  const orderBody = { fileId: up.data.id, product: "bib_r", lines: [{ size: "M", qty: 10 }], shippingAddressId: addr.data.id };

  // ---- the gate
  const refused = await api("/orders", { method: "POST", token, body: orderBody });
  check("V04", "ยังไม่ยืนยัน สั่งผลิตไม่ได้ (403 email_unverified)", refused.status === 403 && refused.data.code === "email_unverified", show(refused));
  check("V05", "ข้อความแจ้งเป็นภาษาไทย", refused.data.message === "กรุณายืนยันอีเมลก่อนสั่งผลิต", refused.data.message);
  const mine0 = await api("/orders", { token });
  check("V06", "ไม่มีออเดอร์เกิดขึ้นจากครั้งที่ถูกปฏิเสธ", Array.isArray(mine0.data) ? mine0.data.length === 0 : (mine0.data.items ?? []).length === 0, show(mine0));

  // ---- send the link again
  const anon = await api("/auth/resend-verify", { method: "POST" });
  check("V07", "ไม่ล็อกอิน ขอลิงก์ใหม่ไม่ได้ (401)", anon.status === 401, show(anon));

  const signupLinks = HAVE_LOG ? await waitForLink(email, 1) : [];
  if (HAVE_LOG) check("V08", "สมัครแล้วได้ลิงก์ยืนยัน 1 ลิงก์", signupLinks.length === 1, `${signupLinks.length} ลิงก์`);
  else skip("V08", "สมัครแล้วได้ลิงก์ยืนยัน 1 ลิงก์", "ไม่มี API_LOG");

  const again = await api("/auth/resend-verify", { method: "POST", token });
  const resent = again.ok && again.data.sent === true;
  check("V09", "ขอลิงก์ใหม่ได้ ({sent: true})", resent, show(again));

  if (HAVE_LOG && resent) {
    const links = await waitForLink(email, 2);
    check("V10", "ลิงก์ใหม่ไม่ซ้ำกับลิงก์เดิม", links.length === 2 && links[0] !== links[1], `${links.length} ลิงก์`);
    const old = await api("/auth/verify-email", { method: "POST", body: { token: links[0] } });
    check("V11", "ลิงก์ที่ส่งไปก่อนใช้ไม่ได้แล้ว (400)", old.status === 400, show(old));
    const stillNot = await api("/auth/me", { token });
    check("V12", "ลิงก์เก่าไม่ได้ทำให้บัญชียืนยัน", stillNot.data.isVerified === false);
  } else {
    for (const [id, name] of [["V10", "ลิงก์ใหม่ไม่ซ้ำกับลิงก์เดิม"], ["V11", "ลิงก์ที่ส่งไปก่อนใช้ไม่ได้แล้ว (400)"], ["V12", "ลิงก์เก่าไม่ได้ทำให้บัญชียืนยัน"]])
      skip(id, name, HAVE_LOG ? "ขอลิงก์ใหม่ไม่ได้ (V09)" : "ไม่มี API_LOG");
  }

  const bogus = await api("/auth/verify-email", { method: "POST", body: { token: "x".repeat(43) } });
  check("V13", "ลิงก์ปลอมใช้ไม่ได้ (400)", bogus.status === 400, show(bogus));

  // ---- how often: 3 resends an hour per account; the call without a sign-in (V07) didn't count
  const more = [];
  for (let i = 1; i < RESENDS; i++) more.push(await api("/auth/resend-verify", { method: "POST", token }));
  check("V14", `ขอลิงก์ใหม่ได้ครบ ${RESENDS} ครั้ง (ครั้งที่ไม่ล็อกอินไม่นับ)`, more.every(r => r.ok && r.data.sent === true), more.map(r => r.status).join(", "));
  const over = await api("/auth/resend-verify", { method: "POST", token });
  const secs = Number(/(\d+)/.exec(String(over.data.message))?.[1]);
  check("V15", `ขอครั้งที่ ${RESENDS + 1} ในชั่วโมงเดียวกันถูกปฏิเสธ (429)`, over.status === 429, show(over));
  check("V16", "429 บอกเวลาที่ต้องรอ (วินาที + header Retry-After)", over.status === 429 && secs > 3500 && secs <= 3600 && over.headers.get("retry-after") === String(secs), `${over.data.message} · Retry-After ${over.headers.get("retry-after")}`);
  if (HAVE_LOG) {
    const n = (await waitForLink(email, RESENDS + 1)).length;
    await new Promise(r => setTimeout(r, 500)); // a mail it shouldn't have sent would be in the log by now
    check("V17", "ครั้งที่ถูกปฏิเสธไม่ได้ส่งอีเมล", n === RESENDS + 1 && loggedLinks(email).length === n, `ลิงก์ใน log ${loggedLinks(email).length} (สมัคร 1 + ขอใหม่ ${RESENDS})`);
  } else skip("V17", "ครั้งที่ถูกปฏิเสธไม่ได้ส่งอีเมล", "ไม่มี API_LOG");

  // ---- confirm with the newest link
  let how;
  try { how = await confirmEmail(api, email); } catch (e) { check("V18", "ยืนยันด้วยลิงก์ล่าสุดได้", false, String(e.message)); return; }
  check("V18", "ยืนยันด้วยลิงก์ล่าสุดได้", true, how === "link" ? "ลิงก์จริงจาก log" : "ตั้งในฐานข้อมูล (ไม่มี API_LOG)");
  if (how === "link") {
    const reuse = await api("/auth/verify-email", { method: "POST", body: { token: loggedLinks(email).at(-1) } });
    check("V19", "ลิงก์เดิมใช้ซ้ำไม่ได้ (400)", reuse.status === 400, show(reuse));
  } else skip("V19", "ลิงก์เดิมใช้ซ้ำไม่ได้ (400)", "ไม่มี API_LOG");
  const me1 = await api("/auth/me", { token });
  check("V20", "บัญชียืนยันแล้ว (isVerified = true) ใช้ token เดิมได้เลย", me1.data.isVerified === true, `isVerified = ${me1.data.isVerified}`);

  const before = loggedLinks(email).length;
  const already = await api("/auth/resend-verify", { method: "POST", token });
  await new Promise(r => setTimeout(r, 500));
  check("V21", "ยืนยันแล้ว ขอลิงก์ใหม่ไม่ส่งอะไรเพิ่ม ({already: true})", already.ok && already.data.already === true && loggedLinks(email).length === before, show(already));

  // ---- the same zip orders now (the refusal didn't use it up)
  const order = await api("/orders", { method: "POST", token, body: orderBody });
  check("V22", "ยืนยันแล้วสั่งผลิตได้ ด้วยไฟล์ zip เดิมที่ถูกปฏิเสธไปก่อน", order.ok && !!order.data.id, order.ok ? order.data.orderNo ?? order.data.id : show(order));
  if (order.ok) check("V23", "ยกเลิกออเดอร์ทดสอบ (เก็บกวาด)", (await api(`/orders/${order.data.id}/cancel`, { method: "POST", token })).ok);
}

main()
  .catch(e => record("ERR", "สคริปต์หยุดกลางทาง", "fail", e?.stack ?? String(e)))
  .finally(() => {
    const n = s => results.filter(r => r.status === s).length;
    console.log(`\n${n("fail") ? "\x1b[31m" : "\x1b[32m"}${n("pass")} ผ่าน · ${n("fail")} ไม่ผ่าน · ${n("skip")} ข้าม\x1b[0m  (ล้างข้อมูล: npm run test:e2e:purge -- --yes)\n`);
    if (process.env.REPORT_JSON) writeFileSync(process.env.REPORT_JSON, JSON.stringify({ api: API, at: new Date().toISOString(), results }, null, 2));
    process.exit(n("fail") ? 1 : 0);
  });
