"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";

interface Detail {
  id: string; name: string; description?: string | null; category?: string | null;
  tags: string[]; price: number; previewUrl?: string | null; salesCount: number;
  designer: { id: string; fullName?: string | null }; owned: boolean;
}
const baht = (n: number) => (n === 0 ? "ฟรี" : "฿" + n.toLocaleString("th-TH"));

export default function TemplateDetail() {
  const id = String(useParams().id);
  const router = useRouter();
  const { user, token } = useAuth();
  const [t, setT] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => apiFetch<Detail>(`/templates/${id}`, { token: token || undefined }).then(setT).catch(() => setT(null));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, token]);

  async function buy() {
    if (!user || !token) { router.push("/login"); return; }
    setBusy(true); setMsg("");
    try {
      await apiFetch(`/templates/${id}/buy`, { method: "POST", token });
      setMsg("ซื้อสำเร็จ ✓ เปิดใช้ในดีไซเนอร์ได้เลย");
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (!t) return <AppShell><p className="asub">กำลังโหลด…</p></AppShell>;
  const isOwner = user && t.designer.id === user.id;

  return (
    <AppShell>
      <Link href="/templates" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>← กลับไปตลาดลาย</Link>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <div className="acard" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ background: "#fff", minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
            {t.previewUrl ? <img src={t.previewUrl} alt={t.name} style={{ maxWidth: "100%", height: "auto" }} /> : <span className="asub">ไม่มีตัวอย่าง</span>}
          </div>
        </div>
        <div className="acard">
          {t.category && <div className="eyebrow">{t.category}</div>}
          <h1 className="atitle" style={{ marginBottom: 4 }}>{t.name}</h1>
          <p className="asub">โดย {t.designer.fullName || "ดีไซเนอร์"}{t.salesCount ? ` · ขายแล้ว ${t.salesCount}` : ""}</p>
          {t.description && <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>{t.description}</p>}
          {t.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
              {t.tags.map((x) => <span key={x} className="chip" style={{ pointerEvents: "none" }}>#{x}</span>)}
            </div>
          )}
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--brand)", margin: "14px 0" }}>{baht(t.price)}</div>

          {t.owned || isOwner ? (
            <Link href={`/design?template=${t.id}`} className="abtn solid block">✓ เปิดใช้ในดีไซเนอร์</Link>
          ) : (
            <button className="abtn solid block" onClick={buy} disabled={busy}>{busy ? "กำลังดำเนินการ…" : `ซื้อเทมเพลตนี้ · ${baht(t.price)}`}</button>
          )}
          {msg && <p className="asub" style={{ marginTop: 10, color: msg.includes("สำเร็จ") ? "#16a34a" : "#ef4444" }}>{msg}</p>}
          <p className="asub" style={{ fontSize: 11, marginTop: 12 }}>ซื้อครั้งเดียว เป็นเจ้าของถาวร · เปิดแก้ไข/ใส่ชื่อ-เบอร์/สั่งผลิตต่อได้ในดีไซเนอร์</p>
        </div>
      </div>
    </AppShell>
  );
}
