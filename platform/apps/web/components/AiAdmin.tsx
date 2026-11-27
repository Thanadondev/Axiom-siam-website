"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

/**
 * Admin → ✨ AI: the advanced designer's AI patterns. What they cost (Claude and
 * Gemini bill per use, in US dollars), who uses them, and the switches: on/off,
 * which AI answers, a customer's designs a day, and a cap on what the whole
 * site spends a day.
 */

type Order = "claude>gemini" | "gemini>claude" | "claude" | "gemini";
type Cfg = { enabled: boolean; order: Order; dailyPerUser: number; dailyBudgetThb: number; thbPerUsd: number };
const ORDERS: { id: Order; label: string }[] = [
  { id: "claude>gemini", label: "Claude ก่อน · ถ้าใช้ไม่ได้ใช้ Gemini" },
  { id: "gemini>claude", label: "Gemini ก่อน · ถ้าใช้ไม่ได้ใช้ Claude" },
  { id: "claude", label: "Claude อย่างเดียว" },
  { id: "gemini", label: "Gemini อย่างเดียว" },
];
/** which AI a call went to, from the model it names */
const aiName = (model: string | null) => (!model ? "—" : model.startsWith("gemini") ? "Gemini" : model.startsWith("claude") ? "Claude" : model);
type Report = {
  config: Cfg;
  keySet: boolean;
  model: string;
  providers: { id: "claude" | "gemini"; model: string; keySet: boolean; env: string }[];
  today: { calls: number; ok: number; users: number; costUsd: number; overBudget: boolean };
  month: { calls: number; costUsd: number };
  days: { date: string; calls: number; ok: number; costUsd: number }[];
  topUsers: { userId: string | null; email: string; fullName: string | null; calls: number; costUsd: number }[];
  recent: {
    id: string; createdAt: string; prompt: string; model: string | null; ok: boolean; error: string | null; patterns: number;
    inputTokens: number; outputTokens: number; cacheRead: number; costUsd: number; ms: number;
    user: { email: string; fullName: string | null } | null;
  }[];
};

const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

export default function AiAdmin({ token }: { token: string }) {
  const [r, setR] = useState<Report | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const x = await apiFetch<Report>("/admin/ai", { token });
      setR(x); setCfg(x.config); setErr("");
    } catch (e: any) { setErr(e.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const rate = cfg?.thbPerUsd ?? 33;
  const thb = (usd: number) => "฿" + (usd * rate).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = (n: number) => "$" + n.toFixed(n < 1 ? 4 : 2);

  async function save() {
    if (!cfg) return;
    setBusy(true); setMsg(""); setErr("");
    try {
      await apiFetch("/admin/ai/settings", { method: "PATCH", token, body: JSON.stringify(cfg) });
      setMsg("บันทึกแล้ว · มีผลภายใน 30 วินาที");
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  if (!r || !cfg) return <div className="acard">{err ? <span style={{ color: "var(--err, #dc2626)" }}>{err}</span> : "กำลังโหลด…"}</div>;

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg({ ...cfg, [k]: v });
  const maxCost = Math.max(1e-9, ...r.days.map(d => d.costUsd));
  const spentThb = r.today.costUsd * rate;
  const live = cfg.enabled && r.keySet;

  return (
    <>
      <div className="acard">
        <h2 className="ah2">✨ AI ออกแบบลาย</h2>
        <p className="asub">
          ลูกค้าพิมพ์ลายที่อยากได้ในหน้าออกแบบขั้นสูง แล้วให้ AI เสนอลายให้ 3 แบบ คิดเงินตามการใช้จริง
          {" · "}
          สถานะ:{" "}
          <b style={{ color: live ? "var(--okc, #16a34a)" : "var(--err, #dc2626)" }}>
            {!r.keySet ? "AI ที่เลือกไว้ยังไม่มีคีย์ในเซิร์ฟเวอร์" : !cfg.enabled ? "ปิดอยู่" : r.today.overBudget ? "ใช้ครบงบวันนี้แล้ว (เปิดใหม่พรุ่งนี้)" : "เปิดให้ลูกค้าใช้"}
          </b>
        </p>
        <p className="asub" style={{ marginTop: 4 }}>
          {r.providers.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}
              {aiName(p.model)} <span className="dim">({p.model})</span>:{" "}
              {p.keySet ? <span style={{ color: "var(--okc, #16a34a)" }}>มีคีย์</span> : <span style={{ color: "var(--err, #dc2626)" }}>ยังไม่ได้ตั้ง {p.env}</span>}
            </span>
          ))}
        </p>
        <div className="kpigrid">
          <Kpi label="ค่าใช้จ่ายวันนี้" value={thb(r.today.costUsd)} sub={`${usd(r.today.costUsd)}${cfg.dailyBudgetThb > 0 ? ` · งบ ฿${cfg.dailyBudgetThb.toLocaleString("th-TH")}/วัน (${Math.min(100, Math.round((spentThb / cfg.dailyBudgetThb) * 100))}%)` : " · ไม่จำกัดงบ"}`} accent danger={r.today.overBudget} />
          <Kpi label="ออกแบบวันนี้" value={`${r.today.ok} ครั้ง`} sub={`เรียกทั้งหมด ${r.today.calls} · ไม่สำเร็จ ${r.today.calls - r.today.ok} · ลูกค้า ${r.today.users} คน`} />
          <Kpi label="30 วันล่าสุด" value={thb(r.month.costUsd)} sub={`${r.month.calls} ครั้ง · เฉลี่ย ${r.month.calls ? thb(r.month.costUsd / r.month.calls) : "฿0"}/ครั้ง`} />
        </div>
      </div>

      <div className="acard">
        <h2 className="ah2">ค่าใช้จ่ายรายวัน (30 วัน)</h2>
        {r.days.every(d => d.calls === 0) ? (
          <p className="asub">ยังไม่มีการใช้ AI ในช่วงนี้</p>
        ) : (
          <div className="spark">
            {r.days.map(d => (
              <div key={d.date} className="sparkbar" title={`${d.date}: ${thb(d.costUsd)} (${d.ok}/${d.calls} ครั้ง)`}>
                <div style={{ height: `${(d.costUsd / maxCost) * 100}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="acard">
        <h2 className="ah2">ตั้งค่า</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 14 }}>
          <input type="checkbox" checked={cfg.enabled} onChange={e => set("enabled", e.target.checked)} />
          เปิดให้ลูกค้าใช้ AI ออกแบบลาย
        </label>
        <div style={{ marginTop: 14, maxWidth: 420 }}>
          <label className="flabel" style={{ margin: "0 0 6px" }}>AI ที่ใช้ออกแบบ</label>
          <select className="ainput" value={cfg.order} onChange={e => set("order", e.target.value as Order)}>
            {ORDERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <p className="dim" style={{ marginTop: 4 }}>ตัวสำรองถูกเรียกเฉพาะตอนตัวแรกใช้ไม่ได้ (เครดิตหมด คีย์ผิด ระบบล่ม ยุ่ง) · ถ้า AI ปฏิเสธคำขอจะไม่ส่งต่อ</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 14 }}>
          <div>
            <label className="flabel" style={{ margin: "0 0 6px" }}>ลูกค้า 1 คนใช้ได้ (ครั้ง/วัน)</label>
            <input className="ainput" type="number" min={0} max={500} value={cfg.dailyPerUser} onChange={e => set("dailyPerUser", Number(e.target.value))} />
            <p className="dim" style={{ marginTop: 4 }}>นับเฉพาะครั้งที่ได้ลาย · 0 = ปิดสำหรับลูกค้าทุกคน</p>
          </div>
          <div>
            <label className="flabel" style={{ margin: "0 0 6px" }}>งบรวมทั้งเว็บ (บาท/วัน)</label>
            <input className="ainput" type="number" min={0} value={cfg.dailyBudgetThb} onChange={e => set("dailyBudgetThb", Number(e.target.value))} />
            <p className="dim" style={{ marginTop: 4 }}>ใช้ครบแล้วปิดอัตโนมัติถึงเที่ยงคืน · 0 = ไม่จำกัด</p>
          </div>
          <div>
            <label className="flabel" style={{ margin: "0 0 6px" }}>อัตราแลกเปลี่ยน (บาท/USD)</label>
            <input className="ainput" type="number" min={1} step="0.01" value={cfg.thbPerUsd} onChange={e => set("thbPerUsd", Number(e.target.value))} />
            <p className="dim" style={{ marginTop: 4 }}>Claude และ Gemini คิดเงินเป็นดอลลาร์ ใช้แปลงเพื่อแสดงผลและเทียบงบ</p>
          </div>
        </div>
        <button className="abtn solid" style={{ marginTop: 16 }} disabled={busy} onClick={save}>บันทึก</button>
        {msg && <span style={{ marginLeft: 12, color: "var(--okc, #16a34a)", fontWeight: 600 }}>{msg}</span>}
        {err && <span style={{ marginLeft: 12, color: "var(--err, #dc2626)" }}>{err}</span>}
      </div>

      <div className="acard">
        <h2 className="ah2">ลูกค้าที่ใช้มากที่สุด (30 วัน)</h2>
        {r.topUsers.length === 0 ? <p className="asub">ยังไม่มี</p> : (
          <div className="tablewrap">
            <table className="atable">
              <thead><tr><th>ลูกค้า</th><th>ครั้ง</th><th>ค่าใช้จ่าย</th></tr></thead>
              <tbody>
                {r.topUsers.map(u => (
                  <tr key={u.userId ?? "gone"}>
                    <td>{u.fullName ? <><b>{u.fullName}</b><br /><span className="dim">{u.email}</span></> : u.email}</td>
                    <td>{u.calls}</td>
                    <td>{thb(u.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="acard">
        <h2 className="ah2">การใช้งานล่าสุด</h2>
        {r.recent.length === 0 ? <p className="asub">ยังไม่มี</p> : (
          <div className="tablewrap">
            <table className="atable">
              <thead><tr><th>เวลา</th><th>ลูกค้า</th><th>คำขอ</th><th>AI</th><th>ผล</th><th>โทเคน (เข้า/แคช/ออก)</th><th>ค่าใช้จ่าย</th><th>เวลา</th></tr></thead>
              <tbody>
                {r.recent.map(x => (
                  <tr key={x.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dt(x.createdAt)}</td>
                    <td>{x.user?.fullName ?? x.user?.email ?? "—"}</td>
                    <td style={{ maxWidth: 260 }}>{x.prompt}</td>
                    <td title={x.model ?? ""}>{aiName(x.model)}</td>
                    <td>{x.ok ? <span style={{ color: "var(--okc, #16a34a)" }}>✓ {x.patterns} ลาย</span> : <span style={{ color: "var(--err, #dc2626)" }} title={x.error ?? ""}>✗ {x.error === "refusal" ? "ปฏิเสธ" : "ไม่สำเร็จ"}</span>}</td>
                    <td className="dim" style={{ whiteSpace: "nowrap" }}>{x.inputTokens.toLocaleString()} / {x.cacheRead.toLocaleString()} / {x.outputTokens.toLocaleString()}</td>
                    <td>{thb(x.costUsd)}</td>
                    <td className="dim">{(x.ms / 1000).toFixed(1)} วิ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
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
