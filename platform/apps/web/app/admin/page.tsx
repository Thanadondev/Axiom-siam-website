"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../components/AppShell";
import SlipReview from "../../components/SlipReview";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api";
import { STEPS, SHIP_STEP } from "../../lib/production-steps";

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");
const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

type Tab = "dash" | "payments" | "orders" | "market" | "reports" | "users" | "payouts" | "quotes" | "terms" | "catalog" | "analytics" | "audit" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "dash", label: "📊 ภาพรวม" },
  { id: "payments", label: "🧾 ตรวจสลิป" },
  { id: "orders", label: "🧵 ออเดอร์ผลิต" },
  { id: "market", label: "🛍️ ตลาดลาย" },
  { id: "reports", label: "🚩 รายงานละเมิด" },
  { id: "users", label: "👤 สมาชิก" },
  { id: "payouts", label: "💸 จ่ายดีไซเนอร์" },
  { id: "quotes", label: "📩 ขอราคา" },
  { id: "terms", label: "📜 log ยอมรับ" },
  { id: "catalog", label: "🎨 ผ้า/ไซส์/สี" },
  { id: "analytics", label: "📈 วิเคราะห์เชิงลึก" },
  { id: "audit", label: "🕵️ Audit trail" },
  { id: "settings", label: "⚙️ ตั้งค่า" },
];

const FABRIC_TH: Record<string, string> = { mesh: "Mesh (ตาข่าย)", B1: "B1", C1: "C1" };
const TRIM_TH: Record<string, string> = { none: "ไม่มีขลิบ", neck: "ขลิบคอ", neckarm: "ขลิบคอ+แขน", full: "ขลิบเต็ม" };

const ORDER_STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน", paid: "ชำระแล้ว", approved: "อนุมัติแบบแล้ว", in_production: "กำลังผลิต",
  shipped: "จัดส่งแล้ว", delivered: "ได้รับแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", refunded: "คืนเงินแล้ว",
};
/** allowed transitions — mirrors the API guard so the UI only offers valid moves */
const NEXT_STATUS: Record<string, string[]> = {
  pending: ["paid", "cancelled"],
  paid: ["approved", "in_production", "cancelled", "refunded"],
  approved: ["in_production", "cancelled", "refunded"],
  in_production: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["completed"],
  completed: [], cancelled: [], refunded: [],
};

const REASON_TH: Record<string, string> = {
  copyright: "ละเมิดลิขสิทธิ์", trademark: "ละเมิดเครื่องหมายการค้า", illegal: "เนื้อหาผิดกฎหมาย", other: "อื่นๆ",
};
const RSTATUS_TH: Record<string, string> = {
  open: "รอตรวจ", reviewing: "กำลังตรวจ", actioned: "ดำเนินการแล้ว", dismissed: "ยกเลิกรายงาน",
};

export default function AdminPage() {
  const { user, token, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("dash");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [stats, setStats] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [topD, setTopD] = useState<any[]>([]);
  const [topT, setTopT] = useState<any[]>([]);
  const [topC, setTopC] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [termsLog, setTermsLog] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [oStatus, setOStatus] = useState("");
  const [uq, setUq] = useState("");
  const [cfg, setCfg] = useState<any>(null); // { pricing, market }
  const [saved, setSaved] = useState("");
  const [funnel, setFunnel] = useState<any>(null);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [auditQ, setAuditQ] = useState("");
  const [fabricsC, setFabricsC] = useState<any[]>([]);
  const [sizesC, setSizesC] = useState<any[]>([]);
  const [colorsC, setColorsC] = useState<any[]>([]);

  const isAdmin = user?.role === "admin";

  const call = useCallback(
    async <T,>(path: string, opts: any = {}): Promise<T | null> => {
      try {
        return await apiFetch<T>(path, { token, ...opts });
      } catch (e: any) {
        setErr(e.message);
        return null;
      }
    },
    [token],
  );

  const loadTab = useCallback(
    async (t: Tab) => {
      if (!token || !isAdmin) return;
      setErr("");
      if (t === "dash") {
        const [s, ss, td, tt, tc] = await Promise.all([
          call<any>("/admin/stats"), call<any[]>("/admin/sales-series?days=30"), call<any[]>("/admin/top-designers"),
          call<any[]>("/admin/top-templates"), call<any[]>("/admin/top-categories"),
        ]);
        if (s) setStats(s);
        if (ss) setSeries(ss);
        if (td) setTopD(td);
        if (tt) setTopT(tt);
        if (tc) setTopC(tc);
      } else if (t === "orders") {
        const r = await call<any>(`/admin/orders?take=100${oStatus ? `&status=${oStatus}` : ""}`);
        if (r) setOrders(r.items);
      } else if (t === "market") {
        const r = await call<any>("/admin/templates?take=100");
        if (r) setTemplates(r.items);
      } else if (t === "reports") {
        const r = await call<any>("/admin/reports?take=100");
        if (r) setReports(r.items);
      } else if (t === "users") {
        const r = await call<any>(`/admin/users?take=100${uq ? `&q=${encodeURIComponent(uq)}` : ""}`);
        if (r) setUsers(r.items);
      } else if (t === "payouts") {
        const [p, l] = await Promise.all([call<any[]>("/admin/payouts/pending"), call<any[]>("/admin/payouts")]);
        if (p) setPending(p);
        if (l) setPayouts(l);
      } else if (t === "quotes") {
        const r = await call<any>("/admin/quotes?take=100");
        if (r) setQuotes(r.items);
      } else if (t === "terms") {
        const r = await call<any>("/admin/terms-log?take=100");
        if (r) setTermsLog(r.items);
      } else if (t === "settings") {
        const r = await call<any>("/admin/settings");
        if (r) setCfg(r);
      } else if (t === "analytics") {
        const [f, m, c] = await Promise.all([
          call<any>("/admin/funnel"), call<any[]>("/admin/monthly-revenue?months=12"), call<any[]>("/admin/cohorts?months=6"),
        ]);
        if (f) setFunnel(f);
        if (m) setMonthly(m);
        if (c) setCohorts(c);
      } else if (t === "audit") {
        const r = await call<any>(`/admin/audit?take=100${auditQ ? `&q=${encodeURIComponent(auditQ)}` : ""}`);
        if (r) setAudit(r.items);
      } else if (t === "catalog") {
        const [f, s, c] = await Promise.all([
          call<any[]>("/admin/catalog/fabrics"), call<any[]>("/admin/catalog/sizes"), call<any[]>("/admin/catalog/colors"),
        ]);
        if (f) setFabricsC(f);
        if (s) setSizesC(s);
        if (c) setColorsC(c);
      }
    },
    [token, isAdmin, call, uq, oStatus, auditQ],
  );

  /** CSV download — needs the bearer token, so fetch as a blob then click it */
  async function downloadCsv(kind: string) {
    if (!token) return;
    setBusy(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${base}/api/v1/admin/export/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `axiom-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!loading && isAdmin) loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAdmin, tab, token]);

  // ---------- actions ----------
  async function patchTemplate(id: string, body: any) {
    setBusy(true);
    await call(`/admin/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await loadTab("market");
    setBusy(false);
  }
  async function takedown(id: string) {
    const reason = prompt("เหตุผลในการถอด (จะบันทึกไว้เป็นหลักฐาน):", "ละเมิดลิขสิทธิ์");
    if (reason === null) return;
    if (!confirm("ถอดเทมเพลตนี้ + อายัดรายได้ของดีไซเนอร์จากเทมเพลตนี้?")) return;
    await patchTemplate(id, { takedown: true, takedownReason: reason, earningsFrozen: true });
  }
  async function restore(id: string) {
    if (!confirm("นำกลับมาขาย + ปลดอายัดรายได้?")) return;
    await patchTemplate(id, { takedown: false, status: "published", earningsFrozen: false });
  }
  async function resolveReport(id: string, status: string) {
    const adminNote = prompt(`บันทึกผลการตรวจ (${RSTATUS_TH[status]}):`, "") ?? undefined;
    setBusy(true);
    await call(`/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote }) });
    await loadTab("reports");
    setBusy(false);
  }
  async function patchUser(id: string, body: any) {
    setBusy(true);
    await call(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await loadTab("users");
    setBusy(false);
  }
  async function suspend(u: any) {
    if (u.suspendedAt) {
      if (!confirm(`ปลดระงับบัญชี ${u.email}?`)) return;
      return patchUser(u.id, { suspended: false });
    }
    const reason = prompt(`เหตุผลที่ระงับ ${u.email}:`, "ละเมิดเงื่อนไขการใช้งาน");
    if (reason === null) return;
    return patchUser(u.id, { suspended: true, suspendReason: reason });
  }
  async function pay(d: any) {
    if (!confirm(`ยืนยันว่าจ่าย ${baht(d.amount)} ให้ ${d.name} (${d.email}) แล้ว?\n\nระบบจะบันทึกรอบจ่ายนี้และตัดยอดค้าง`)) return;
    const note = prompt("โน้ต (เลขอ้างอิงการโอน ฯลฯ):", "") ?? undefined;
    setBusy(true);
    const r = await call<any>("/admin/payouts", { method: "POST", body: JSON.stringify({ designerId: d.designerId, note }) });
    if (r) alert(r.message);
    await loadTab("payouts");
    setBusy(false);
  }
  /** money received outside the slip flow — recorded with its amount, never a bare status change */
  async function recordPayment(o: any) {
    const due = o.balance?.outstanding ?? o.total;
    const amt = prompt(`ยอดที่รับจริงของ ${o.orderNo} (ค้าง ${baht(due)}):`, String(o.balance?.due || due));
    if (!amt) return;
    const method = prompt("ช่องทาง: cash (เงินสด) / transfer (โอนนอกระบบ) / cheque (เช็ค) / other", "transfer");
    if (!method) return;
    const ref = prompt("เลขอ้างอิง (ถ้ามี):", "") ?? undefined;
    const note = prompt("หมายเหตุ — ใครรับเงิน รับเมื่อไหร่ (จำเป็น):", "");
    if (!note) return;
    setBusy(true);
    const r = await call<any>(`/admin/orders/${o.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount: Number(amt.replace(/[^\d]/g, "")), method: method.trim(), ref: ref || undefined, note }),
    });
    if (r) { alert(r.message); await loadTab("orders"); }
    setBusy(false);
  }
  /** money given back — closes the order as "คืนเงินแล้ว" only when all of it is back */
  async function recordRefund(o: any) {
    const held = (o.balance?.paid ?? 0) - (o.balance?.refunded ?? 0);
    const amt = prompt(`ยอดที่คืนให้ลูกค้า ${o.orderNo} (รับไว้ ${baht(held)}):`, String(held));
    if (!amt) return;
    const amount = Number(amt.replace(/[^\d]/g, ""));
    const reason = prompt("เหตุผลที่คืนเงิน (ลูกค้าจะเห็น):", "");
    if (!reason) return;
    const method = prompt("ช่องทาง: transfer (โอนคืน) / cash (เงินสด) / other", "transfer");
    if (!method) return;
    const ref = prompt("เลขอ้างอิงการโอนคืน (ถ้ามี):", "") ?? undefined;
    const close = amount === held && confirm(`คืนครบ ${baht(held)} แล้ว — ปิดออเดอร์เป็น "คืนเงินแล้ว" เลยไหม?`);
    setBusy(true);
    const r = await call<any>(`/admin/orders/${o.id}/refunds`, {
      method: "POST",
      body: JSON.stringify({ amount, reason, method: method.trim(), ref: ref || undefined, close }),
    });
    if (r) { alert(r.message); await loadTab("orders"); }
    setBusy(false);
  }
  async function setOrderStatus(o: any, status: string) {
    if (!status) return;
    let courier: string | undefined, trackingNo: string | undefined;
    if (status === "shipped") {
      // the API rejects "shipped" without a tracking number
      const t = prompt(`เลขพัสดุของ ${o.orderNo}:`, "");
      if (!t) return;
      trackingNo = t;
      courier = prompt("ขนส่ง (Kerry / Flash / ไปรษณีย์ไทย / J&T):", "Flash") ?? undefined;
    }
    const note = prompt(`หมายเหตุ (${ORDER_STATUS_TH[status]}) — เว้นว่างได้:`, "") ?? undefined;
    setBusy(true);
    const r = await call<any>(`/admin/orders/${o.id}/status`, { method: "PATCH", body: JSON.stringify({ status, note, courier, trackingNo }) });
    if (r) await loadTab("orders");
    setBusy(false);
  }

  // ---------- catalog ----------
  async function catAdd(kind: "fabrics" | "sizes" | "colors") {
    let body: any;
    if (kind === "fabrics") {
      const code = prompt("รหัสผ้า (เช่น D1):"); if (!code) return;
      const name = prompt("ชื่อผ้า:", code) || code;
      body = { code, name, priceAdj: Number(prompt("ส่วนเพิ่ม (บาท/ตัว):", "0") || 0) };
    } else if (kind === "sizes") {
      const code = prompt("รหัสไซส์ (เช่น XXL):"); if (!code) return;
      body = { code, label: prompt("ชื่อเต็ม:", code) || code, sortOrder: Number(prompt("ลำดับ:", "99") || 99) };
    } else {
      const hex = prompt("รหัสสี (#RRGGBB):", "#2563EB"); if (!hex) return;
      body = { hex, cmyk: prompt("ค่า CMYK:", "C0 M0 Y0 K0") || "C0 M0 Y0 K0", name: prompt("ชื่อสี:", "") || undefined };
    }
    setBusy(true);
    await call(`/admin/catalog/${kind}`, { method: "POST", body: JSON.stringify(body) });
    await loadTab("catalog");
    setBusy(false);
  }
  async function catDel(kind: "fabrics" | "sizes" | "colors", id: string, label: string) {
    if (!confirm(`ลบ "${label}"?`)) return;
    setBusy(true);
    const r = await call<any>(`/admin/catalog/${kind}/${id}`, { method: "DELETE" });
    if (r?.message) alert(r.message);
    await loadTab("catalog");
    setBusy(false);
  }
  async function catPatch(kind: "fabrics" | "sizes" | "colors", id: string, body: any) {
    setBusy(true);
    await call(`/admin/catalog/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await loadTab("catalog");
    setBusy(false);
  }

  // ---------- settings ----------
  async function savePricing() {
    setBusy(true); setSaved("");
    const r = await call<any>("/admin/settings/pricing", { method: "PATCH", body: JSON.stringify(cfg.pricing) });
    if (r) { setCfg((c: any) => ({ ...c, pricing: r })); setSaved("บันทึกราคาแล้ว ✓"); }
    setBusy(false);
  }
  async function saveMarket() {
    setBusy(true); setSaved("");
    const r = await call<any>("/admin/settings/market", { method: "PATCH", body: JSON.stringify(cfg.market) });
    if (r) { setCfg((c: any) => ({ ...c, market: r })); setSaved("บันทึกตลาดลายแล้ว ✓"); }
    setBusy(false);
  }
  async function saveBank() {
    setBusy(true); setSaved("");
    const r = await call<any>("/admin/settings/bank", { method: "PATCH", body: JSON.stringify(cfg.bank) });
    if (r) { setCfg((c: any) => ({ ...c, bank: r })); setSaved("บันทึกบัญชีรับเงินแล้ว ✓"); }
    setBusy(false);
  }
  const setB = (k: string, v: any) => setCfg((c: any) => ({ ...c, bank: { ...c.bank, [k]: v } }));
  const setP = (k: string, v: any) => setCfg((c: any) => ({ ...c, pricing: { ...c.pricing, [k]: v } }));
  const setTier = (i: number, k: "minQty" | "price", v: number) =>
    setCfg((c: any) => ({ ...c, pricing: { ...c.pricing, tiers: c.pricing.tiers.map((t: any, j: number) => j === i ? { ...t, [k]: v } : t) } }));
  const setMap = (group: "fabric" | "trim" | "garment", k: string, v: number) =>
    setCfg((c: any) => ({ ...c, pricing: { ...c.pricing, [group]: { ...c.pricing[group], [k]: v } } }));

  async function setQuote(id: string, body: { status?: string; adminNote?: string }) {
    setBusy(true);
    await call(`/admin/quotes/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await loadTab("quotes");
    setBusy(false);
  }
  async function quoteNote(q: any) {
    const adminNote = prompt("โน้ตภายใน (ผู้ติดต่อ / ราคาที่เสนอ / นัดหมาย):", q.adminNote ?? "");
    if (adminNote === null) return;
    await setQuote(q.id, { adminNote });
  }

  // ---------- gates ----------
  if (loading) return <AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>;
  if (!user)
    return (
      <AppShell narrow>
        <div className="acard">
          <h1 className="atitle">ต้องเข้าสู่ระบบ</h1>
          <p className="asub">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
          <Link className="abtn solid" href="/login">เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  if (!isAdmin)
    return (
      <AppShell narrow>
        <div className="acard">
          <div className="eyebrow">403</div>
          <h1 className="atitle">ไม่มีสิทธิ์เข้าถึง</h1>
          <p className="asub">บัญชีของคุณไม่ใช่ผู้ดูแลระบบ</p>
          <Link className="abtn ghost" href="/account">กลับไปบัญชีของฉัน</Link>
        </div>
      </AppShell>
    );

  const maxGross = Math.max(1, ...series.map(s => s.gross));

  return (
    <AppShell wide>
      <div className="acard">
        <div className="eyebrow">ADMIN</div>
        <h1 className="atitle">ผู้ดูแลระบบ</h1>
        <p className="asub">จัดการสมาชิก ตลาดลาย รายงานละเมิด และการจ่ายเงินดีไซเนอร์</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 4px" }}>
          {TABS.map(t => (
            <button key={t.id} className={`chip${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "reports" && stats?.queue?.openReports > 0 ? ` (${stats.queue.openReports})` : ""}
            </button>
          ))}
          <Link className="chip" href="/admin/production" style={{ borderColor: "var(--brand)" }}>🏭 บอร์ดผลิต</Link>
        </div>
        {err && <p style={{ color: "var(--err, #dc2626)", fontSize: 13, marginTop: 12 }}>⚠ {err}</p>}
      </div>

      {/* ---------------- DASHBOARD ---------------- */}
      {tab === "dash" && stats && (
        <>
          <div className="acard">
            <h2 className="ah2">ภาพรวม</h2>
            <div className="kpigrid">
              <Kpi label="สมาชิกทั้งหมด" value={stats.users.total.toLocaleString()} sub={`+${stats.users.new7} ใน 7 วัน · +${stats.users.new30} ใน 30 วัน`} />
              <Kpi label="รายได้แพลตฟอร์ม" value={baht(stats.sales.platformRevenue)} sub={`จากยอดขายรวม ${baht(stats.sales.gross)}`} accent />
              <Kpi label="ยอดขายเทมเพลต" value={stats.sales.count.toLocaleString() + " ครั้ง"} sub={`เผยแพร่ ${stats.templates.published}/${stats.templates.total} ลาย`} />
              <Kpi label="ค้างจ่ายดีไซเนอร์" value={baht(stats.sales.unpaidToDesigners)} sub={`จ่ายแล้วรวม ${baht(stats.sales.designerEarnings - stats.sales.unpaidToDesigners)}`} />
              <Kpi label="รายงานรอตรวจ" value={String(stats.queue.openReports)} sub="🚩 ต้องดำเนินการ" danger={stats.queue.openReports > 0} />
              <Kpi label="ขอราคาใหม่" value={String(stats.queue.newQuotes)} sub={`ออเดอร์ค้าง ${stats.queue.pendingOrders} · ระงับบัญชี ${stats.users.suspended}`} />
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">ยอดขาย 30 วันล่าสุด</h2>
            {series.every(s => s.gross === 0) ? (
              <p className="asub">ยังไม่มียอดขายในช่วงนี้</p>
            ) : (
              <div className="spark">
                {series.map(s => (
                  <div key={s.date} className="sparkbar" title={`${s.date}: ${baht(s.gross)} (${s.sales} ครั้ง)`}>
                    <div style={{ height: `${(s.gross / maxGross) * 100}%` }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
            <div className="acard" style={{ marginTop: 0 }}>
              <h2 className="ah2">ดีไซเนอร์ทำรายได้สูงสุด</h2>
              {topD.length === 0 ? <p className="asub">ยังไม่มีข้อมูล</p> : (
                <Table head={["ดีไซเนอร์", "ขายได้", "รายได้"]}>
                  {topD.map(d => (
                    <tr key={d.id}>
                      <td><Link className="dlink" href={`/admin/users/${d.id}`}>{d.name}</Link><div className="dim">{d.email}</div></td>
                      <td>{d.sales}</td><td><b>{baht(d.earnings)}</b></td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>

            <div className="acard" style={{ marginTop: 0 }}>
              <h2 className="ah2">ลายขายดี</h2>
              {topT.length === 0 ? <p className="asub">ยังไม่มีข้อมูล</p> : (
                <Table head={["ลาย", "ขาย", "ยอดขาย"]}>
                  {topT.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                          {t.previewUrl && <img src={t.previewUrl} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />}
                          <div><Link className="dlink" href={`/templates/${t.id}`} target="_blank">{t.name}</Link><div className="dim">{t.category ?? "-"}</div></div>
                        </div>
                      </td>
                      <td>{t.sales}</td><td><b>{baht(t.gross)}</b></td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">หมวดหมู่ที่ขายดี</h2>
            {topC.length === 0 ? <p className="asub">ยังไม่มีข้อมูล</p> : (
              <div style={{ marginTop: 12 }}>
                {topC.map(c => {
                  const max = Math.max(1, ...topC.map(x => x.gross));
                  return (
                    <div key={c.category} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <b>{c.category}</b>
                        <span className="dim">{c.sales} ครั้ง · {baht(c.gross)}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: "var(--border)", marginTop: 4 }}>
                        <div style={{ width: `${(c.gross / max) * 100}%`, height: "100%", borderRadius: 4, background: "var(--brand)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------- ORDERS ---------------- */}
      {/* ---------------- SLIP REVIEW ---------------- */}
      {/* approving a slip changes revenue, so refresh the dashboard's numbers too */}
      {tab === "payments" && token && <SlipReview token={token} onChange={() => loadTab("dash")} />}

      {tab === "orders" && (
        <div className="acard">
          <h2 className="ah2">ออเดอร์สั่งผลิต ({orders.length})</h2>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "12px 0 4px" }}>
            <button className={`chip${oStatus === "" ? " on" : ""}`} onClick={() => setOStatus("")}>ทั้งหมด</button>
            {Object.keys(ORDER_STATUS_TH).map(s => (
              <button key={s} className={`chip${oStatus === s ? " on" : ""}`} onClick={() => setOStatus(s)}>{ORDER_STATUS_TH[s]}</button>
            ))}
          </div>
          {orders.length === 0 ? <p className="asub">ไม่มีออเดอร์ในสถานะนี้</p> : (
            <Table head={["เลขออเดอร์", "ลูกค้า", "สเปก / จำนวน", "ยอดรวม", "สถานะ", "เปลี่ยนสถานะ"]}>
              {orders.map(o => {
                const qty = o.items.reduce((s: number, i: any) => s + i.qty, 0);
                // "ชำระแล้ว" comes from an approved slip or a recorded payment, not from here
                // "ชำระแล้ว" / "คืนเงินแล้ว" come from recording the money, not from here
                const next = (NEXT_STATUS[o.status] ?? []).filter((s: string) => s !== "paid" && s !== "refunded");
                const held = o.balance ? o.balance.paid - o.balance.refunded : 0;
                const owes = o.balance ? o.balance.outstanding > 0 : o.status === "pending";
                return (
                  <tr key={o.id}>
                    <td><b>{o.orderNo}</b><div className="dim">{dt(o.createdAt)}</div></td>
                    <td>{o.user.fullName ?? "-"}<div className="dim">{o.user.email}</div></td>
                    <td className="dim">{o.fabricSummary}<div>{qty} ตัว · {o.items.map((i: any) => `${i.size}×${i.qty}`).join(", ")}</div></td>
                    <td>
                      <b>{baht(o.total)}</b>
                      {o.balance && o.balance.outstanding > 0 && o.status !== "cancelled" && (
                        <div className="dim" style={{ color: "#b45309" }}>ค้าง {baht(o.balance.outstanding)}</div>
                      )}
                      {o.balance?.refunded > 0 && <div className="dim">คืนแล้ว {baht(o.balance.refunded)}</div>}
                    </td>
                    <td><span className={`tag ${o.status === "cancelled" || o.status === "refunded" ? "red" : o.status === "completed" ? "green" : "blue"}`}>{ORDER_STATUS_TH[o.status]}</span>
                      {o.status === "in_production" && o.productionStep > 0 && <div className="dim" style={{ marginTop: 4 }}>ขั้น {o.productionStep}/{SHIP_STEP} · {STEPS[o.productionStep - 1]?.th}</div>}</td>
                    <td>
                      <div className="rowbtns">
                        {next.length === 0 ? <span className="dim">ปิดแล้ว</span> : (
                          <select className="ainput mini" value="" disabled={busy} onChange={e => setOrderStatus(o, e.target.value)}>
                            <option value="">เลือก…</option>
                            {next.map(s => <option key={s} value={s}>{ORDER_STATUS_TH[s]}</option>)}
                          </select>
                        )}
                        {owes && !["cancelled", "refunded", "completed"].includes(o.status) && (
                          <button className="minibtn" disabled={busy} onClick={() => recordPayment(o)}>💰 บันทึกรับเงิน</button>
                        )}
                        {held > 0 && !["refunded", "cancelled"].includes(o.status) && (
                          <button className="minibtn danger" disabled={busy} onClick={() => recordRefund(o)}>↩ คืนเงิน</button>
                        )}
                        <Link className="minibtn" href={`/orders/${o.id}`} target="_blank">ดู</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </div>
      )}

      {/* ---------------- MARKETPLACE ---------------- */}
      {tab === "market" && (
        <div className="acard">
          <h2 className="ah2">เทมเพลตทั้งหมด ({templates.length})</h2>
          <Table head={["ลาย", "ดีไซเนอร์", "ราคา", "ขาย", "สถานะ", "จัดการ"]}>
            {templates.map(t => (
              <tr key={t.id}>
                <td>
                  <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                    {t.previewUrl && <img src={t.previewUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />}
                    <div><b>{t.name}</b>{t.featured && <span className="tag blue"> ⭐ แนะนำ</span>}<div className="dim">{t.category ?? "-"}</div></div>
                  </div>
                </td>
                <td>{t.designer.fullName ?? t.designer.email}<div className="dim">{t.designer.email}</div></td>
                <td>{baht(t.price)}</td>
                <td>{t.salesCount}{t._count.reports > 0 && <span className="tag red"> 🚩{t._count.reports}</span>}</td>
                <td>
                  {t.takedownAt ? <span className="tag red">ถูกถอด</span> : <span className={`tag ${t.status === "published" ? "green" : ""}`}>{t.status}</span>}
                  {t.earningsFrozen && <div><span className="tag red">อายัดรายได้</span></div>}
                  {t.takedownReason && <div className="dim">{t.takedownReason}</div>}
                </td>
                <td>
                  <div className="rowbtns">
                    <button className="minibtn" disabled={busy} onClick={() => patchTemplate(t.id, { featured: !t.featured })}>{t.featured ? "เลิกแนะนำ" : "แนะนำ"}</button>
                    {t.takedownAt
                      ? <button className="minibtn" disabled={busy} onClick={() => restore(t.id)}>คืนสภาพ</button>
                      : <button className="minibtn danger" disabled={busy} onClick={() => takedown(t.id)}>ถอด</button>}
                    <Link className="minibtn" href={`/templates/${t.id}`} target="_blank">ดู</Link>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {/* ---------------- REPORTS ---------------- */}
      {tab === "reports" && (
        <div className="acard">
          <h2 className="ah2">คิวรายงานละเมิด ({reports.length})</h2>
          {reports.length === 0 ? <p className="asub">ยังไม่มีรายงาน 🎉</p> : (
            <Table head={["ลาย", "เหตุผล", "ผู้รายงาน", "เมื่อ", "สถานะ", "จัดการ"]}>
              {reports.map(r => (
                <tr key={r.id}>
                  <td><b>{r.template.name}</b><div className="dim">โดย {r.template.designer.email} · ขายแล้ว {r.template.salesCount}</div></td>
                  <td><span className="tag red">{REASON_TH[r.reason] ?? r.reason}</span>{r.detail && <div className="dim">{r.detail}</div>}</td>
                  <td>{r.reporter?.email ?? <i className="dim">ไม่ระบุตัวตน</i>}</td>
                  <td className="dim">{dt(r.createdAt)}</td>
                  <td><span className={`tag ${r.status === "open" ? "red" : r.status === "actioned" ? "green" : ""}`}>{RSTATUS_TH[r.status]}</span>{r.adminNote && <div className="dim">{r.adminNote}</div>}</td>
                  <td>
                    <div className="rowbtns">
                      {!r.template.takedownAt && <button className="minibtn danger" disabled={busy} onClick={() => takedown(r.template.id)}>ถอดลาย</button>}
                      {r.status === "open" && <button className="minibtn" disabled={busy} onClick={() => resolveReport(r.id, "actioned")}>ดำเนินการแล้ว</button>}
                      {r.status === "open" && <button className="minibtn" disabled={busy} onClick={() => resolveReport(r.id, "dismissed")}>ยกเลิก</button>}
                      <Link className="minibtn" href={`/templates/${r.template.id}`} target="_blank">ดู</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* ---------------- USERS ---------------- */}
      {tab === "users" && (
        <div className="acard">
          <h2 className="ah2">สมาชิก ({users.length})</h2>
          <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>
            <input className="ainput" placeholder="ค้นหา อีเมล / ชื่อ / บริษัท" value={uq}
              onChange={e => setUq(e.target.value)} onKeyDown={e => e.key === "Enter" && loadTab("users")} style={{ maxWidth: 320 }} />
            <button className="abtn ghost" onClick={() => loadTab("users")}>ค้นหา</button>
          </div>
          <Table head={["ผู้ใช้", "สิทธิ์", "งาน", "สมัครเมื่อ", "จัดการ"]}>
            {users.map(u => (
              <tr key={u.id} style={u.suspendedAt ? { opacity: 0.6 } : undefined}>
                <td>
                  <Link className="dlink" href={`/admin/users/${u.id}`}>{u.fullName || u.email}</Link>
                  {u.suspendedAt && <span className="tag red"> ถูกระงับ</span>}
                  <div className="dim">{u.email}{u.companyName ? ` · ${u.companyName}` : ""}</div>
                </td>
                <td>
                  <select className="ainput mini" value={u.role} disabled={busy || u.id === user.id} onChange={e => patchUser(u.id, { role: e.target.value })}>
                    {["customer", "staff", "production", "admin"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="dim">ดีไซน์ {u._count.designs} · ออเดอร์ {u._count.orders}<br />ลายขาย {u._count.marketTemplates} · ซื้อ {u._count.templatePurchases}</td>
                <td className="dim">{dt(u.createdAt)}</td>
                <td>
                  <button className={`minibtn${u.suspendedAt ? "" : " danger"}`} disabled={busy || u.id === user.id} onClick={() => suspend(u)}>
                    {u.suspendedAt ? "ปลดระงับ" : "ระงับ"}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {/* ---------------- PAYOUTS ---------------- */}
      {tab === "payouts" && (
        <>
          <div className="acard">
            <h2 className="ah2">ยอดค้างจ่ายดีไซเนอร์</h2>
            <p className="asub">รายได้จากลายที่ถูกอายัด (ละเมิดลิขสิทธิ์) จะไม่ถูกนับในยอดนี้</p>
            {pending.length === 0 ? <p className="asub">ไม่มียอดค้างจ่าย ✅</p> : (
              <Table head={["ดีไซเนอร์", "อีเมล", "ขายได้", "ยอดค้าง", ""]}>
                {pending.map(d => (
                  <tr key={d.designerId}>
                    <td><b>{d.name}</b></td><td className="dim">{d.email}</td><td>{d.sales}</td>
                    <td><b style={{ color: "var(--brand)" }}>{baht(d.amount)}</b></td>
                    <td><button className="minibtn solid" disabled={busy} onClick={() => pay(d)}>บันทึกว่าจ่ายแล้ว</button></td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
          <div className="acard">
            <h2 className="ah2">ประวัติการจ่าย</h2>
            {payouts.length === 0 ? <p className="asub">ยังไม่มีประวัติ</p> : (
              <Table head={["วันที่", "ดีไซเนอร์", "จำนวนรายการ", "ยอดจ่าย", "โน้ต"]}>
                {payouts.map(p => (
                  <tr key={p.id}>
                    <td className="dim">{dt(p.paidAt)}</td>
                    <td>{p.designer.fullName ?? p.designer.email}<div className="dim">{p.designer.email}</div></td>
                    <td>{p.salesCount}</td><td><b>{baht(p.amount)}</b></td><td className="dim">{p.note ?? "-"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </>
      )}

      {/* ---------------- QUOTES ---------------- */}
      {tab === "quotes" && (
        <div className="acard">
          <h2 className="ah2">คำขอราคา ({quotes.length})</h2>
          {quotes.length === 0 ? <p className="asub">ยังไม่มีคำขอราคา</p> : (
            <Table head={["ผู้ติดต่อ", "ข้อความ", "โน้ตภายใน", "เมื่อ", "สถานะ"]}>
              {quotes.map(q => (
                <tr key={q.id}>
                  <td><b>{q.name}</b><div className="dim">{q.email ?? "-"} · {q.phone ?? "-"}</div></td>
                  <td style={{ maxWidth: 280 }}>{q.message ?? <i className="dim">-</i>}{q.designId && <div className="dim">ดีไซน์ #{String(q.designId).slice(0, 8)}</div>}</td>
                  <td style={{ maxWidth: 200 }}>
                    {q.adminNote ? <div style={{ fontSize: 12.5 }}>{q.adminNote}</div> : <span className="dim">—</span>}
                    <button className="minibtn" style={{ marginTop: 5 }} disabled={busy} onClick={() => quoteNote(q)}>{q.adminNote ? "แก้โน้ต" : "+ โน้ต"}</button>
                  </td>
                  <td className="dim">{dt(q.createdAt)}</td>
                  <td>
                    <select className="ainput mini" value={q.status} disabled={busy} onChange={e => setQuote(q.id, { status: e.target.value })}>
                      <option value="new">ใหม่</option><option value="contacted">ติดต่อแล้ว</option><option value="closed">ปิดงาน</option>
                    </select>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* ---------------- TERMS LOG ---------------- */}
      {tab === "terms" && (
        <div className="acard">
          <h2 className="ah2">Log การยอมรับเงื่อนไข ({termsLog.length})</h2>
          <p className="asub">หลักฐานว่าผู้ใช้กดยอมรับข้อตกลงลิขสิทธิ์ตอนเผยแพร่ขาย — เก็บวันเวลา, IP และเบราว์เซอร์</p>
          {termsLog.length === 0 ? <p className="asub">ยังไม่มีข้อมูล</p> : (
            <Table head={["ผู้ใช้", "ประเภท", "เวอร์ชัน", "อ้างอิง", "IP", "เมื่อ"]}>
              {termsLog.map(l => (
                <tr key={l.id}>
                  <td><b>{l.user.fullName ?? "-"}</b><div className="dim">{l.user.email}</div></td>
                  <td className="dim">{l.kind}</td>
                  <td>{l.version}</td>
                  <td className="dim">{l.ref ? String(l.ref).slice(0, 8) : "-"}</td>
                  <td className="dim">{l.ip ?? "-"}<div className="dim" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.userAgent ?? ""}</div></td>
                  <td className="dim">{dt(l.acceptedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
      {/* ---------------- ANALYTICS ---------------- */}
      {tab === "analytics" && (
        <>
          <div className="acard">
            <h2 className="ah2">ดาวน์โหลดข้อมูล (CSV)</h2>
            <p className="asub">เปิดใน Excel ได้ทันที (รองรับภาษาไทย) · สูงสุด 5,000 แถวล่าสุด</p>
            <div className="rowbtns" style={{ marginTop: 12 }}>
              {[["orders", "ออเดอร์"], ["sales", "ยอดขายลาย"], ["users", "สมาชิก"], ["payouts", "การจ่ายเงิน"], ["audit", "Audit trail"]].map(([k, label]) => (
                <button key={k} className="minibtn" disabled={busy} onClick={() => downloadCsv(k)}>⬇ {label}</button>
              ))}
            </div>
          </div>

          {funnel && (
            <div className="acard">
              <h2 className="ah2">Funnel — สมาชิกเดินไปถึงไหน</h2>
              <div style={{ marginTop: 14 }}>
                {funnel.stages.map((s: any) => (
                  <div key={s.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <b>{s.label}</b>
                      <span className="dim">{s.count.toLocaleString()} คน · {s.pct}%</span>
                    </div>
                    <div style={{ height: 22, borderRadius: 6, background: "var(--border)", marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${s.pct}%`, height: "100%", background: "var(--brand)", transition: ".3s" }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="dim">ซื้อเทมเพลตจากตลาดลาย: {funnel.buyers.count} คน ({funnel.buyers.pct}%)</p>
            </div>
          )}

          <div className="acard">
            <h2 className="ah2">รายได้รายเดือน (12 เดือน)</h2>
            {monthly.every(m => m.templateGross === 0 && m.orderGross === 0) ? <p className="asub">ยังไม่มีรายได้</p> : (
              <>
                <div className="spark" style={{ height: 150 }}>
                  {monthly.map(m => {
                    const max = Math.max(1, ...monthly.map(x => x.templateGross + x.orderGross));
                    const tot = m.templateGross + m.orderGross;
                    return (
                      <div key={m.month} className="sparkbar" title={`${m.month}: ลาย ฿${m.templateGross.toLocaleString()} · ออเดอร์ ฿${m.orderGross.toLocaleString()}`}>
                        <div style={{ height: `${(tot / max) * 100}%`, display: "flex", flexDirection: "column-reverse" }}>
                          <div style={{ height: `${tot ? (m.orderGross / tot) * 100 : 0}%`, background: "var(--brand)" }} />
                          <div style={{ height: `${tot ? (m.templateGross / tot) * 100 : 0}%`, background: "var(--brand-glow)", opacity: .6 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                  <span className="dim">▇ ออเดอร์ผลิต</span>
                  <span className="dim" style={{ opacity: .7 }}>▇ ตลาดลาย</span>
                </div>
                <Table head={["เดือน", "ออเดอร์", "ยอดออเดอร์ (หักคืนเงิน)", "ขายลาย", "ยอดขายลาย", "รายได้แพลตฟอร์ม"]}>
                  {monthly.filter(m => m.orders || m.templateSales).map(m => (
                    <tr key={m.month}>
                      <td><b>{m.month}</b></td><td>{m.orders}</td>
                      <td>{baht(m.orderGross)}{m.orderRefunds > 0 && <div className="dim">คืน {baht(m.orderRefunds)}</div>}</td>
                      <td>{m.templateSales}</td><td>{baht(m.templateGross)}</td><td><b style={{ color: "var(--brand)" }}>{baht(m.platformRevenue)}</b></td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </div>

          <div className="acard">
            <h2 className="ah2">Cohort — สมัครเดือนไหน แล้วสั่งซื้อจริงกี่ %</h2>
            {cohorts.length === 0 ? <p className="asub">ยังไม่มีข้อมูล</p> : (
              <Table head={["เดือนที่สมัคร", "สมัคร", "เคยสั่งผลิต", "%", "เคยซื้อลาย", "%"]}>
                {cohorts.map(c => (
                  <tr key={c.cohort}>
                    <td><b>{c.cohort}</b></td><td>{c.signups}</td>
                    <td>{c.ordered}</td><td><span className={`tag ${c.orderedPct >= 20 ? "green" : ""}`}>{c.orderedPct}%</span></td>
                    <td>{c.bought}</td><td><span className={`tag ${c.boughtPct >= 20 ? "green" : ""}`}>{c.boughtPct}%</span></td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </>
      )}

      {/* ---------------- AUDIT TRAIL ---------------- */}
      {tab === "audit" && (
        <div className="acard">
          <h2 className="ah2">Audit trail ({audit.length})</h2>
          <p className="asub">ทุกการกระทำที่เปลี่ยนข้อมูลของผู้ดูแลระบบ · อ่านอย่างเดียว ลบไม่ได้จากหน้านี้ · ข้อมูลอ่อนไหวถูกปิดบัง</p>
          <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <input className="ainput" placeholder="ค้นหา อีเมลผู้ทำ / path / target id" value={auditQ}
              onChange={e => setAuditQ(e.target.value)} onKeyDown={e => e.key === "Enter" && loadTab("audit")} style={{ maxWidth: 340 }} />
            <button className="abtn ghost" onClick={() => loadTab("audit")}>ค้นหา</button>
            <button className="minibtn" disabled={busy} onClick={() => downloadCsv("audit")}>⬇ CSV</button>
          </div>
          {audit.length === 0 ? <p className="asub">ยังไม่มีบันทึก — ลองแก้อะไรสักอย่างในแอดมินแล้วกลับมาดู</p> : (
            <Table head={["เมื่อ", "ผู้ทำ", "การกระทำ", "เป้าหมาย", "ผล", "IP"]}>
              {audit.map(a => (
                <tr key={a.id}>
                  <td className="dim">{dt(a.createdAt)}</td>
                  <td>{a.actorEmail ?? <i className="dim">—</i>}</td>
                  <td><b>{a.action}</b><div className="dim">{a.method} {a.path}</div></td>
                  <td className="dim">{a.targetId ? String(a.targetId).slice(0, 8) : "—"}</td>
                  <td><span className={`tag ${a.ok ? "green" : "red"}`}>{a.ok ? `ok ${a.status ?? ""}` : `fail ${a.status ?? ""}`}</span></td>
                  <td className="dim">{a.ip ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* ---------------- CATALOG ---------------- */}
      {tab === "catalog" && (
        <>
          <div className="acard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h2 className="ah2">ชนิดผ้า ({fabricsC.length})</h2>
              <button className="minibtn solid" disabled={busy} onClick={() => catAdd("fabrics")}>+ เพิ่มผ้า</button>
            </div>
            <p className="asub">ผ้าที่มีดีไซน์ใช้อยู่จะถูกปิดใช้งานแทนการลบ เพื่อไม่ให้งานเก่าพัง</p>
            <Table head={["รหัส", "ชื่อ", "ส่วนเพิ่ม", "สถานะ", ""]}>
              {fabricsC.map(f => (
                <tr key={f.id}>
                  <td><b>{f.code}</b></td><td>{f.name}</td><td>{baht(f.priceAdj)}</td>
                  <td><span className={`tag ${f.isActive ? "green" : "red"}`}>{f.isActive ? "ใช้งาน" : "ปิด"}</span></td>
                  <td><div className="rowbtns">
                    <button className="minibtn" disabled={busy} onClick={() => catPatch("fabrics", f.id, { isActive: !f.isActive })}>{f.isActive ? "ปิด" : "เปิด"}</button>
                    <button className="minibtn danger" disabled={busy} onClick={() => catDel("fabrics", f.id, f.code)}>ลบ</button>
                  </div></td>
                </tr>
              ))}
            </Table>
          </div>

          <div className="acard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h2 className="ah2">ไซส์ ({sizesC.length})</h2>
              <button className="minibtn solid" disabled={busy} onClick={() => catAdd("sizes")}>+ เพิ่มไซส์</button>
            </div>
            <Table head={["รหัส", "ชื่อ", "อก (ซม.)", "ยาว (ซม.)", "ลำดับ", ""]}>
              {sizesC.map(s => (
                <tr key={s.id}>
                  <td><b>{s.code}</b></td><td>{s.label}</td><td>{s.widthCm ?? "-"}</td><td>{s.heightCm ?? "-"}</td><td>{s.sortOrder}</td>
                  <td><button className="minibtn danger" disabled={busy} onClick={() => catDel("sizes", s.id, s.code)}>ลบ</button></td>
                </tr>
              ))}
            </Table>
          </div>

          <div className="acard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h2 className="ah2">สี ({colorsC.length})</h2>
              <button className="minibtn solid" disabled={busy} onClick={() => catAdd("colors")}>+ เพิ่มสี</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginTop: 14 }}>
              {colorsC.map(c => (
                <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ background: c.hex, height: 46 }} />
                  <div style={{ padding: "7px 9px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name || c.hex}</div>
                    <div className="dim" style={{ fontSize: 10.5 }}>{c.hex} · {c.cmyk}</div>
                    <button className="minibtn danger" style={{ marginTop: 6 }} disabled={busy} onClick={() => catDel("colors", c.id, c.name || c.hex)}>ลบ</button>
                  </div>
                </div>
              ))}
            </div>
            {colorsC.length === 0 && <p className="asub">ยังไม่มีสีในระบบ</p>}
          </div>
        </>
      )}

      {/* ---------------- SETTINGS ---------------- */}
      {tab === "settings" && cfg && (
        <>
          <div className="acard">
            <h2 className="ah2">ราคาสั่งผลิต</h2>
            <p className="asub">แก้แล้วมีผลกับออเดอร์ใหม่ทันที · ออเดอร์เก่าใช้ราคาที่แช่แข็งไว้ ไม่กระทบ</p>

            <h3 className="flabel" style={{ marginTop: 18 }}>ขั้นราคาตามจำนวน (บาท/ตัว)</h3>
            <div className="tablewrap">
              <table className="atable" style={{ minWidth: 320 }}>
                <thead><tr><th>สั่งตั้งแต่ (ตัว)</th><th>ราคา/ตัว</th></tr></thead>
                <tbody>
                  {cfg.pricing.tiers.map((t: any, i: number) => (
                    <tr key={i}>
                      <td><input className="ainput mini" type="number" min={1} value={t.minQty} onChange={e => setTier(i, "minQty", Number(e.target.value))} /></td>
                      <td><input className="ainput mini" type="number" min={0} value={t.price} onChange={e => setTier(i, "price", Number(e.target.value))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="dim" style={{ marginTop: 6 }}>ระบบจะเลือกขั้นที่ "สั่งตั้งแต่" สูงสุดที่ยังไม่เกินจำนวนจริง</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
              <div>
                <h3 className="flabel" style={{ margin: 0 }}>ส่วนเพิ่มตามชนิดผ้า (บาท/ตัว)</h3>
                {Object.keys(cfg.pricing.fabric).map(k => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{FABRIC_TH[k] ?? k}</span>
                    <input className="ainput mini" type="number" min={0} style={{ width: 90 }} value={cfg.pricing.fabric[k]} onChange={e => setMap("fabric", k, Number(e.target.value))} />
                  </div>
                ))}
              </div>
              <div>
                <h3 className="flabel" style={{ margin: 0 }}>ส่วนเพิ่มตามขลิบ (บาท/ตัว)</h3>
                {Object.keys(cfg.pricing.trim).map(k => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{TRIM_TH[k] ?? k}</span>
                    <input className="ainput mini" type="number" min={0} style={{ width: 90 }} value={cfg.pricing.trim[k]} onChange={e => setMap("trim", k, Number(e.target.value))} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <h3 className="flabel" style={{ margin: 0 }}>ราคาตามชนิดสินค้า เทียบกับเสื้อ (บาท/ตัว · ติดลบ = ถูกกว่าเสื้อ)</h3>
              {[["hoodie", "เสื้อฮู้ด"], ["shorts", "กางเกงกีฬา"]].map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, maxWidth: 360 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
                  <input className="ainput mini" type="number" style={{ width: 90 }} value={cfg.pricing.garment?.[k] ?? 0} onChange={e => setMap("garment", k, Number(e.target.value))} />
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginTop: 20 }}>
              <NumField label="เสื้อ 2 ด้าน +฿" value={cfg.pricing.reversible} onChange={v => setP("reversible", v)} />
              <NumField label="ค่าส่ง (บาท)" value={cfg.pricing.shippingFlat} onChange={v => setP("shippingFlat", v)} />
              <NumField label="ส่งฟรีเมื่อครบ (บาท)" value={cfg.pricing.freeShippingOver} onChange={v => setP("freeShippingOver", v)} />
              <NumField label="สั่งขั้นต่ำ (ตัว)" value={cfg.pricing.minQty} onChange={v => setP("minQty", v)} />
              <NumField label="ชำระก่อนผลิต (%)" value={cfg.pricing.depositPct} onChange={v => setP("depositPct", v)} />
            </div>
            <button className="abtn solid" style={{ marginTop: 18 }} disabled={busy} onClick={savePricing}>บันทึกราคา</button>
          </div>

          <div className="acard">
            <h2 className="ah2">ตลาดลาย</h2>
            <p className="asub">ค่าคอมมิชชันจะถูกแช่แข็งลงในแต่ละรายการขาย — เปลี่ยนแล้วไม่กระทบยอดขายเดิม</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginTop: 14 }}>
              <NumField label="ค่าคอมแพลตฟอร์ม (%)" value={cfg.market.commissionPct}
                onChange={v => setCfg((c: any) => ({ ...c, market: { ...c.market, commissionPct: v } }))} />
              <div>
                <label className="flabel" style={{ margin: "0 0 6px" }}>เวอร์ชันข้อตกลง</label>
                <input className="ainput" value={cfg.market.termsVersion}
                  onChange={e => setCfg((c: any) => ({ ...c, market: { ...c.market, termsVersion: e.target.value } }))} />
              </div>
            </div>
            <p className="dim" style={{ marginTop: 8 }}>ดีไซเนอร์ได้ {100 - (cfg.market.commissionPct || 0)}% · เปลี่ยนเวอร์ชันข้อตกลงเมื่อแก้เนื้อหาหน้า /terms เพื่อให้ log แยกเวอร์ชันได้</p>
            <button className="abtn solid" style={{ marginTop: 16 }} disabled={busy} onClick={saveMarket}>บันทึกตลาดลาย</button>
          </div>

          {/* ---------------- BANK / PAYMENTS ---------------- */}
          {cfg.bank && (
            <div className="acard">
              <h2 className="ah2">บัญชีรับเงิน</h2>
              <p className="asub">
                ลูกค้าจะเห็นข้อมูลนี้ในหน้าออเดอร์ และ QR จะถูกสร้างจากพร้อมเพย์ที่ใส่ไว้ —
                ตรวจให้แน่ใจก่อนบันทึก เพราะเงินจะวิ่งเข้าบัญชีนี้จริง
              </p>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 14 }}>
                <input type="checkbox" checked={!!cfg.bank.enabled} onChange={e => setB("enabled", e.target.checked)} />
                เปิดรับชำระเงิน (ถ้าปิด ลูกค้าจะเห็นข้อความให้ติดต่อทีมงานแทน)
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 14 }}>
                <div>
                  <label className="flabel" style={{ margin: "0 0 6px" }}>ธนาคาร</label>
                  <input className="ainput" placeholder="เช่น กสิกรไทย" value={cfg.bank.bankName ?? ""} onChange={e => setB("bankName", e.target.value)} />
                </div>
                <div>
                  <label className="flabel" style={{ margin: "0 0 6px" }}>เลขบัญชี</label>
                  <input className="ainput" placeholder="xxx-x-xxxxx-x" value={cfg.bank.accountNo ?? ""} onChange={e => setB("accountNo", e.target.value)} />
                </div>
                <div>
                  <label className="flabel" style={{ margin: "0 0 6px" }}>ชื่อบัญชี</label>
                  <input className="ainput" placeholder="บจก. แอกซิออม สยาม" value={cfg.bank.accountName ?? ""} onChange={e => setB("accountName", e.target.value)} />
                </div>
                <div>
                  <label className="flabel" style={{ margin: "0 0 6px" }}>พร้อมเพย์ (สร้าง QR)</label>
                  <input className="ainput" placeholder="เบอร์ / เลขบัตร / e-wallet" value={cfg.bank.promptpayId ?? ""} onChange={e => setB("promptpayId", e.target.value)} />
                </div>
                <div>
                  <label className="flabel" style={{ margin: "0 0 6px" }}>ประเภทพร้อมเพย์</label>
                  <select className="ainput" value={cfg.bank.promptpayType ?? "phone"} onChange={e => setB("promptpayType", e.target.value)}>
                    <option value="phone">เบอร์โทร</option>
                    <option value="natid">เลขบัตรประชาชน</option>
                    <option value="ewallet">e-wallet (15 หลัก)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="flabel" style={{ margin: "0 0 6px" }}>ข้อความใต้ QR</label>
                <input className="ainput" value={cfg.bank.note ?? ""} onChange={e => setB("note", e.target.value)} />
              </div>

              <p className="dim" style={{ marginTop: 10 }}>
                เว้นพร้อมเพย์ว่างได้ ถ้าไม่อยากให้มี QR — ลูกค้าจะโอนเข้าเลขบัญชีแทน
              </p>
              <button className="abtn solid" style={{ marginTop: 16 }} disabled={busy} onClick={saveBank}>บันทึกบัญชีรับเงิน</button>
            </div>
          )}

          {saved && <div className="acard" style={{ color: "var(--okc, #16a34a)", fontWeight: 600 }}>{saved}</div>}
        </>
      )}
    </AppShell>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="flabel" style={{ margin: "0 0 6px" }}>{label}</label>
      <input className="ainput" type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function Kpi({ label, value, sub, accent, danger }: { label: string; value: string; sub?: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="kpi">
      <div className="kpilabel">{label}</div>
      <div className="kpivalue" style={danger ? { color: "var(--err, #dc2626)" } : accent ? { color: "var(--brand)" } : undefined}>{value}</div>
      {sub && <div className="kpisub">{sub}</div>}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="tablewrap">
      <table className="atable">
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
