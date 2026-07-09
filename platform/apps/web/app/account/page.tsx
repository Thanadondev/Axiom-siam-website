"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, type User } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";
import TwoFactorCard from "../../components/TwoFactorCard";

const ORDER_STATUS_TH: Record<string, string> = {
  pending: "รอชำระเงิน", paid: "ชำระแล้ว", approved: "อนุมัติแบบแล้ว", in_production: "กำลังผลิต",
  shipped: "จัดส่งแล้ว", delivered: "ได้รับแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", refunded: "คืนเงินแล้ว",
};

interface Address {
  id: string;
  label?: string | null;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

interface DesignItem { id: string; name: string; previewUrl?: string | null; mode: string; updatedAt: string; }

const emptyAddr = {
  label: "", recipient: "", phone: "", line1: "", line2: "",
  district: "", province: "", postalCode: "", country: "TH", isDefault: false,
};

export default function AccountPage() {
  const { user, token, loading, setUser } = useAuth(); // logout lives in the header user menu

  const [pf, setPf] = useState({ fullName: "", phone: "", companyName: "", bio: "", locale: "th" });
  const [pmsg, setPmsg] = useState("");
  const [perr, setPerr] = useState("");
  const [psaving, setPsaving] = useState(false);

  const [addrs, setAddrs] = useState<Address[]>([]);
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [af, setAf] = useState({ ...emptyAddr });
  const [aerr, setAerr] = useState("");
  const [designs, setDesigns] = useState<DesignItem[]>([]);

  useEffect(() => {
    if (user) setPf({ fullName: user.fullName || "", phone: user.phone || "", companyName: user.companyName || "", bio: user.bio || "", locale: user.locale || "th" });
  }, [user]);

  async function loadAddrs() {
    if (!token) return;
    try { setAddrs(await apiFetch<Address[]>("/auth/addresses", { token })); } catch { /* ignore */ }
  }
  useEffect(() => { if (token) loadAddrs(); /* eslint-disable-next-line */ }, [token]);

  async function loadDesigns() {
    if (!token) return;
    try { setDesigns(await apiFetch<DesignItem[]>("/designs", { token })); } catch { /* ignore */ }
  }
  useEffect(() => { if (token) loadDesigns(); /* eslint-disable-next-line */ }, [token]);
  async function delDesign(id: string) {
    if (!confirm("ลบดีไซน์นี้?")) return;
    try { await apiFetch(`/designs/${id}`, { method: "DELETE", token }); loadDesigns(); } catch { /* ignore */ }
  }

  // ---------- production orders ----------
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    apiFetch<any[]>("/orders", { token }).then(setOrders).catch(() => { /* orders API may not be running yet */ });
  }, [token]);

  // ---------- marketplace ----------
  const [purchases, setPurchases] = useState<any[]>([]);
  const [listings, setListings] = useState<{ items: any[]; earnings: { total: number; sales: number; commissionPct: number } } | null>(null);
  const baht = (n: number) => (n === 0 ? "ฟรี" : "฿" + Number(n).toLocaleString("th-TH"));
  async function loadMarket() {
    if (!token) return;
    try { setPurchases(await apiFetch<any[]>("/templates/me/purchases", { token })); } catch { /* ignore */ }
    try { setListings(await apiFetch<any>("/templates/me/listings", { token })); } catch { /* ignore */ }
  }
  useEffect(() => { if (token) loadMarket(); /* eslint-disable-next-line */ }, [token]);
  async function publishDesign(d: DesignItem) {
    if (!confirm(
      "⚠️ ข้อตกลง & ลิขสิทธิ์\n\n" +
      "เทมเพลตต้องเป็นผลงานที่คุณออกแบบเอง หรือมีสิทธิ์ใช้ถูกต้องตามกฎหมายเท่านั้น — ห้ามนำรูป/ลวดลาย/โลโก้/ตัวการ์ตูนที่มีลิขสิทธิ์หรือเครื่องหมายการค้าของผู้อื่นมาขายโดยไม่ได้รับอนุญาต\n\n" +
      "หากตรวจพบการละเมิด (แม้จะขายไปแล้ว) ทางเว็บไซต์ไม่มีส่วนรับผิดชอบต่อความเสียหาย/ค่าปรับ/คดีใดๆ ความรับผิดทั้งหมดเป็นของผู้เผยแพร่ และเว็บไซต์ขอสงวนสิทธิ์ถอดเทมเพลต ระงับบัญชี และยึด/อายัดรายได้ทั้งหมดที่เกิดจากการขายที่ผิดกฎหมาย\n\n" +
      "ยืนยันว่าคุณมีสิทธิ์ในผลงานนี้และยอมรับข้อตกลง?"
    )) return;
    const priceStr = prompt(`ตั้งราคาขายเทมเพลต "${d.name}" (บาท) — ใส่ 0 = แจกฟรี`, "199");
    if (priceStr === null) return;
    const price = Math.max(0, parseInt(priceStr, 10) || 0);
    const category = prompt("หมวด/กีฬา (เช่น ฟุตบอล, บาสเกตบอล, วิ่ง) — เว้นว่างได้", "") || undefined;
    try {
      const full = await apiFetch<{ stateJson: any; name: string }>(`/designs/${d.id}`, { token });
      await apiFetch("/templates", { method: "POST", token, body: JSON.stringify({ name: d.name, price, category, previewUrl: d.previewUrl, stateJson: full.stateJson, status: "published", agreedTerms: true }) });
      alert("เผยแพร่ขายในตลาดแล้ว ✓");
      loadMarket();
    } catch (e: any) { alert("เผยแพร่ไม่สำเร็จ: " + e.message); }
  }
  async function unpublish(id: string) {
    if (!confirm("เอาเทมเพลตนี้ออกจากตลาด?")) return;
    try { await apiFetch(`/templates/${id}`, { method: "DELETE", token }); loadMarket(); } catch { /* ignore */ }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setPerr(""); setPmsg(""); setPsaving(true);
    try {
      const u = await apiFetch<User>("/auth/profile", { method: "PATCH", token, body: JSON.stringify(pf) });
      setUser(u);
      setPmsg("บันทึกข้อมูลแล้ว ✓");
    } catch (e: any) { setPerr(e.message); } finally { setPsaving(false); }
  }

  function startNew() { setAf({ ...emptyAddr }); setAerr(""); setEditing("new"); }
  function startEdit(a: Address) {
    setAf({
      label: a.label || "", recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2 || "",
      district: a.district || "", province: a.province || "", postalCode: a.postalCode, country: a.country, isDefault: a.isDefault,
    });
    setAerr(""); setEditing(a.id);
  }

  async function saveAddr(e: React.FormEvent) {
    e.preventDefault();
    setAerr("");
    try {
      if (editing === "new") await apiFetch("/auth/addresses", { method: "POST", token, body: JSON.stringify(af) });
      else await apiFetch(`/auth/addresses/${editing}`, { method: "PATCH", token, body: JSON.stringify(af) });
      setEditing(null);
      await loadAddrs();
    } catch (e: any) { setAerr(e.message); }
  }

  async function delAddr(id: string) {
    if (!confirm("ลบที่อยู่นี้?")) return;
    try { await apiFetch(`/auth/addresses/${id}`, { method: "DELETE", token }); await loadAddrs(); } catch { /* ignore */ }
  }
  async function makeDefault(id: string) {
    try { await apiFetch(`/auth/addresses/${id}`, { method: "PATCH", token, body: JSON.stringify({ isDefault: true }) }); await loadAddrs(); } catch { /* ignore */ }
  }

  const setA = (k: keyof typeof af) => (e: React.ChangeEvent<HTMLInputElement>) => setAf({ ...af, [k]: e.target.value });

  if (loading) {
    return <AppShell><p className="asub">กำลังโหลด...</p></AppShell>;
  }
  if (!user) {
    return (
      <AppShell narrow>
        <div className="acard center">
          <h1 className="atitle">ยังไม่ได้เข้าสู่ระบบ</h1>
          <p className="asub">กรุณาเข้าสู่ระบบเพื่อดูโปรไฟล์</p>
          <Link href="/login" className="abtn solid block" style={{ marginTop: 18 }}>เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* header card */}
      <div className="acard">
        <div className="eyebrow">บัญชีของฉัน</div>
        <h1 className="atitle">{user.fullName || user.email}</h1>
        <p className="asub">{user.email}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <span className="chip">บทบาท: {user.role}</span>
          <span className={`chip${user.isVerified ? " on" : ""}`}>{user.isVerified ? "✅ ยืนยันอีเมลแล้ว" : "⏳ ยังไม่ยืนยันอีเมล"}</span>
        </div>
      </div>

      {/* my designs */}
      <div className="acard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="eyebrow">ดีไซน์ของฉัน</div>
          <Link href="/design" className="abtn ghost" style={{ padding: "8px 16px", fontSize: 13 }}>+ ออกแบบใหม่</Link>
        </div>
        {designs.length === 0 ? (
          <p className="asub" style={{ marginTop: 12 }}>ยังไม่มีดีไซน์ที่บันทึก — กด "ออกแบบใหม่" แล้วกดเซฟในหน้าดีไซเนอร์</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
            {designs.map((d) => (
              <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--soft)" }}>
                <div style={{ position: "relative", background: "#fff", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {/\(\d+\s*ตัว\)/.test(d.name) && (
                    <span style={{ position: "absolute", top: 6, left: 6, background: "#2563eb", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>🧾 ออเดอร์ทีม</span>
                  )}
                  {d.previewUrl ? <img src={d.previewUrl} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "#94a3b8", fontSize: 12 }}>ไม่มีตัวอย่าง</span>}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                  <div className="asub" style={{ fontSize: 11 }}>{d.mode === "reversible" ? "สองด้าน" : "ธรรมดา"} · {new Date(d.updatedAt).toLocaleDateString("th-TH")}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    <Link href={`/design?design=${d.id}`} className="linkbtn">เปิด</Link>
                    <Link href={`/order/new?design=${d.id}`} className="linkbtn" style={{ color: "var(--brand)" }}>🧵 สั่งผลิต</Link>
                    <button onClick={() => publishDesign(d)} className="linkbtn" style={{ color: "var(--brand)" }}>ขายในตลาด</button>
                    <button onClick={() => delDesign(d.id)} className="linkbtn" style={{ color: "#ef4444" }}>ลบ</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TwoFactorCard />

      {/* production orders */}
      {orders.length > 0 && (
        <div className="acard">
          <div className="eyebrow">ออเดอร์สั่งผลิต</div>
          <div className="tablewrap">
            <table className="atable" style={{ minWidth: 480 }}>
              <thead><tr><th>เลขออเดอร์</th><th>สเปก</th><th>ยอดรวม</th><th>สถานะ</th><th></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><b>{o.orderNo}</b><div className="dim">{new Date(o.createdAt).toLocaleDateString("th-TH")}</div></td>
                    <td className="dim">{o.fabricSummary}</td>
                    <td><b>฿{o.total.toLocaleString("th-TH")}</b></td>
                    <td><span className={`tag ${o.status === "cancelled" || o.status === "refunded" ? "red" : o.status === "completed" ? "green" : "blue"}`}>{ORDER_STATUS_TH[o.status] ?? o.status}</span></td>
                    <td><Link className="minibtn" href={`/orders/${o.id}`}>ดูรายละเอียด</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* purchased templates (owned assets) */}
      {purchases.length > 0 && (
        <div className="acard">
          <div className="eyebrow">เทมเพลตที่ซื้อไว้</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
            {purchases.map((p) => (
              <div key={p.purchaseId} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--soft)" }}>
                <div style={{ background: "#fff", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {p.previewUrl ? <img src={p.previewUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div className="asub" style={{ fontSize: 11 }}>{baht(p.price)}</div>
                  <Link href={`/design?template=${p.id}`} className="linkbtn" style={{ display: "inline-block", marginTop: 6 }}>เปิดใช้</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* my marketplace listings + earnings */}
      {listings && listings.items.length > 0 && (
        <div className="acard">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div className="eyebrow">เทมเพลตที่ฉันขาย</div>
            <div className="asub" style={{ fontSize: 12.5 }}>รายได้สะสม <b style={{ color: "var(--brand)" }}>{baht(listings.earnings.total)}</b> · ขายแล้ว {listings.earnings.sales} ครั้ง · หัก {listings.earnings.commissionPct}%</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
            {listings.items.map((t) => (
              <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--soft)" }}>
                <div style={{ background: "#fff", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {t.previewUrl ? <img src={t.previewUrl} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                  <div className="asub" style={{ fontSize: 11 }}>{baht(t.price)} · {t.status === "published" ? "กำลังขาย" : t.status} · ขาย {t.salesCount}</div>
                  <button onClick={() => unpublish(t.id)} className="linkbtn" style={{ color: "#ef4444", marginTop: 6 }}>เอาออก</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* profile edit */}
      <form className="acard" onSubmit={saveProfile}>
        <div className="eyebrow">ข้อมูลส่วนตัว</div>
        <label className="flabel">ชื่อ-นามสกุล</label>
        <input className="ainput" value={pf.fullName} onChange={(e) => setPf({ ...pf, fullName: e.target.value })} />
        <div className="row2">
          <div>
            <label className="flabel">เบอร์โทร</label>
            <input className="ainput" value={pf.phone} onChange={(e) => setPf({ ...pf, phone: e.target.value })} />
          </div>
          <div>
            <label className="flabel">ภาษา</label>
            <select className="aselect" value={pf.locale} onChange={(e) => setPf({ ...pf, locale: e.target.value })}>
              <option value="th">ไทย</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <label className="flabel">ชื่อบริษัท / ทีม</label>
        <input className="ainput" value={pf.companyName} onChange={(e) => setPf({ ...pf, companyName: e.target.value })} />
        <label className="flabel">แนะนำตัว (แสดงบนหน้าโปรไฟล์ดีไซเนอร์ของคุณ)</label>
        <textarea className="ainput" rows={3} maxLength={500} placeholder="เช่น ออกแบบชุดกีฬาสไตล์มินิมอล ประสบการณ์ 5 ปี"
          value={pf.bio} onChange={(e) => setPf({ ...pf, bio: e.target.value })} />
        {perr && <div className="err">{perr}</div>}
        {pmsg && <div className="ok">{pmsg}</div>}
        <button className="abtn solid" style={{ marginTop: 18 }} disabled={psaving}>{psaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</button>
      </form>

      {/* addresses */}
      <div className="acard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="eyebrow">ที่อยู่จัดส่ง</div>
          {editing === null && <button onClick={startNew} className="abtn ghost" style={{ padding: "8px 16px", fontSize: 13 }}>+ เพิ่มที่อยู่</button>}
        </div>

        {addrs.length === 0 && editing === null && <p className="asub" style={{ marginTop: 12 }}>ยังไม่มีที่อยู่จัดส่ง</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {addrs.map((a) => (
            <div key={a.id} className="addr">
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {a.recipient}{a.label ? <span className="asub" style={{ fontWeight: 400 }}> · {a.label}</span> : null}
                {a.isDefault && <span className="chip on" style={{ marginLeft: 8 }}>ค่าเริ่มต้น</span>}
              </div>
              <div className="asub" style={{ marginTop: 4 }}>
                {a.phone}<br />
                {a.line1}{a.line2 ? ` ${a.line2}` : ""}<br />
                {[a.district, a.province, a.postalCode].filter(Boolean).join(" ")} {a.country}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                {!a.isDefault && <button onClick={() => makeDefault(a.id)} className="linkbtn">ตั้งเป็นค่าเริ่มต้น</button>}
                <button onClick={() => startEdit(a)} className="linkbtn">แก้ไข</button>
                <button onClick={() => delAddr(a.id)} className="linkbtn" style={{ color: "#ef4444" }}>ลบ</button>
              </div>
            </div>
          ))}
        </div>

        {editing !== null && (
          <form onSubmit={saveAddr} style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{editing === "new" ? "เพิ่มที่อยู่ใหม่" : "แก้ไขที่อยู่"}</div>
            <div className="row2">
              <div>
                <label className="flabel">ชื่อผู้รับ *</label>
                <input className="ainput" required value={af.recipient} onChange={setA("recipient")} />
              </div>
              <div>
                <label className="flabel">เบอร์โทร *</label>
                <input className="ainput" required value={af.phone} onChange={setA("phone")} />
              </div>
            </div>
            <label className="flabel">ที่อยู่ (บ้านเลขที่ ถนน) *</label>
            <input className="ainput" required value={af.line1} onChange={setA("line1")} />
            <label className="flabel">ที่อยู่ (เพิ่มเติม)</label>
            <input className="ainput" value={af.line2} onChange={setA("line2")} />
            <div className="row2">
              <div>
                <label className="flabel">อำเภอ/เขต</label>
                <input className="ainput" value={af.district} onChange={setA("district")} />
              </div>
              <div>
                <label className="flabel">จังหวัด</label>
                <input className="ainput" value={af.province} onChange={setA("province")} />
              </div>
            </div>
            <div className="row2">
              <div>
                <label className="flabel">รหัสไปรษณีย์ *</label>
                <input className="ainput" required value={af.postalCode} onChange={setA("postalCode")} />
              </div>
              <div>
                <label className="flabel">ป้ายกำกับ (บ้าน/ออฟฟิศ)</label>
                <input className="ainput" value={af.label} onChange={setA("label")} />
              </div>
            </div>
            <label className="flabel" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={af.isDefault} onChange={(e) => setAf({ ...af, isDefault: e.target.checked })} />
              ตั้งเป็นที่อยู่เริ่มต้น
            </label>
            {aerr && <div className="err">{aerr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="abtn solid">บันทึกที่อยู่</button>
              <button type="button" onClick={() => setEditing(null)} className="abtn ghost">ยกเลิก</button>
            </div>
          </form>
        )}
      </div>

    </AppShell>
  );
}
