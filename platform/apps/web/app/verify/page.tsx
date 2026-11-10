"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";

function VerifyInner() {
  const token = useSearchParams().get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("กำลังยืนยันอีเมล...");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("ไม่พบโทเคนสำหรับยืนยันอีเมล"); return; }
    (async () => {
      try {
        const r = await apiFetch<{ message: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
        setStatus("ok"); setMessage(r.message);
      } catch (e: any) {
        setStatus("error"); setMessage(e.message);
      }
    })();
  }, [token]);

  const icon = status === "ok" ? "✅" : status === "error" ? "⚠️" : "⏳";

  return (
    <div className="acard center">
      <div style={{ fontSize: 44, marginBottom: 6 }}>{icon}</div>
      <div className="eyebrow">ยืนยันอีเมล</div>
      <h1 className="atitle">{status === "ok" ? "ยืนยันสำเร็จ" : status === "error" ? "ยืนยันไม่สำเร็จ" : "กำลังยืนยัน..."}</h1>
      <p className="asub">{message}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
        <Link href="/account" className="abtn solid">ไปที่บัญชีของฉัน</Link>
        <Link href="/" className="abtn ghost">กลับหน้าแรก</Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <AppShell auth>
      <Suspense fallback={<div className="acard"><p className="asub">กำลังโหลด...</p></div>}>
        <VerifyInner />
      </Suspense>
    </AppShell>
  );
}
