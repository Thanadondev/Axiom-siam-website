"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import StoreHeader from "../../components/StoreHeader";
import RackScene from "../../components/RackScene";
import KitThumb from "../../components/KitThumb";
import { KITS } from "../../lib/kits";
import "../app.css"; // UserMenu styles
import "../home.css";

function Rack() {
  const router = useRouter();
  const sp = useSearchParams();
  const start = Math.max(0, KITS.findIndex(k => k.id === sp.get("kit")));
  const [idx, setIdx] = useState(start);
  const [flat, setFlat] = useState(false);
  const wheelAt = useRef(0);
  const n = KITS.length;
  const k = KITS[idx];

  const go = useCallback((i: number) => setIdx(((i % n) + n) % n), [n]);
  const open = useCallback((i: number) => router.push(`/shop/${KITS[i].id}`), [router]);

  // keep the URL on the shirt being looked at, so back/refresh/share land here
  useEffect(() => {
    const url = `/shop?kit=${KITS[idx].id}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, go]);

  const onWheel = (e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 18) return;
    const now = Date.now();
    if (now - wheelAt.current < 520) return;
    wheelAt.current = now;
    go(idx + (d > 0 ? 1 : -1));
  };

  const t = k.theme;
  return (
    <div
      className="ax"
      style={{
        background: t.bg, color: t.ink, display: "flex", flexDirection: "column",
        transition: "background-color 720ms ease, color 520ms ease",
        ["--ax-ink" as any]: t.ink, ["--ax-mute" as any]: t.soft, ["--ax-line-2" as any]: t.rail,
        ["--ax-accent" as any]: t.accent, ["--ax-accent-ink" as any]: t.accentInk,
      }}
    >
      <StoreHeader nav={[{ href: "/", label: "หน้าแรก" }, { href: "/templates", label: "ตลาดลาย" }, { href: "/design", label: "ออกแบบขั้นสูง" }]} />

      <div className="ax-wrap" style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, paddingTop: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="ax-mono" style={{ color: t.ink }}>Axiom teamwear</span>
          <span style={{ fontSize: 14, color: t.soft }}>{n} ทรงเสื้อ สำหรับทุกสนาม</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right" }}>
          <span className="ax-mono" style={{ color: t.ink }}>Season 2026</span>
          <span className="ax-mono" style={{ color: t.soft, letterSpacing: "0.08em" }}>{k.paletteLabel}</span>
        </div>
      </div>

      <section aria-label="ราวเสื้อ" onWheel={onWheel} style={{ position: "relative", flex: 1, minHeight: "min(62vh, 640px)" }}>
        {!flat ? (
          <RackScene kits={KITS} index={idx} onSelect={go} onOpen={open} onFail={() => setFlat(true)} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(8px,2vw,28px)", padding: "0 24px", overflowX: "auto" }}>
            {KITS.map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => (i === idx ? open(i) : go(i))}
                aria-label={i === idx ? `${x.name} — เข้าห้องออกแบบ` : `เลือก${x.name}`}
                style={{ flex: "none", border: 0, background: "transparent", padding: 0, width: i === idx ? "clamp(200px,24vw,320px)" : "clamp(90px,10vw,150px)", opacity: i === idx ? 1 : 0.55, transition: "all 600ms cubic-bezier(.22,1,.36,1)" }}
              >
                <KitThumb kit={x} number={x.defaults.number} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="เลือกทรงเสื้อ" className="ax-wrap" style={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 24, paddingBottom: 36 }}>
        <div style={{ flex: "1 1 380px", minWidth: 0, display: "flex", alignItems: "flex-end", gap: 18 }}>
          <span className="ax-mono" style={{ paddingBottom: 10, color: t.soft }} aria-live="polite">
            {String(idx + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <h1 className="ax-display" style={{ fontSize: "clamp(48px, 5vw, 80px)" }}>{k.en}</h1>
            <p style={{ margin: 0, maxWidth: 460, fontSize: 15, lineHeight: 1.6, color: t.soft }}>{k.name} · {k.note}</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={() => go(idx - 1)} aria-label="ทรงก่อนหน้า" style={roundBtn(t.soft, t.ink)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10.5 3.5-4.5 4.5 4.5 4.5" /></svg>
          </button>
          <Link href={`/shop/${k.id}`} className="ax-btn solid">ออกแบบตัวนี้</Link>
          <button type="button" onClick={() => go(idx + 1)} aria-label="ทรงถัดไป" style={roundBtn(t.soft, t.ink)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5.5 3.5 4.5 4.5-4.5 4.5" /></svg>
          </button>
        </div>

        <nav aria-label="ลำดับทรงเสื้อ" style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {KITS.map((x, i) => (
              <button key={x.id} type="button" onClick={() => go(i)} aria-label={x.name} aria-pressed={i === idx}
                style={{ width: 44, height: 44, padding: 0, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ display: "block", height: 6, borderRadius: 3, transition: "all 600ms cubic-bezier(.22,1,.36,1)", width: i === idx ? 26 : 6, background: i === idx ? t.ink : t.soft }} />
              </button>
            ))}
          </div>
          <span className="ax-mono" style={{ color: t.soft, letterSpacing: "0.08em" }}>คลิกเสื้อ · ลูกศร · ล้อเมาส์</span>
        </nav>
      </section>
    </div>
  );
}

function roundBtn(border: string, ink: string): React.CSSProperties {
  return { width: 48, height: 48, borderRadius: "50%", border: `1px solid ${border}`, background: "transparent", color: ink, display: "flex", alignItems: "center", justifyContent: "center" };
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="ax" />}>
      <Rack />
    </Suspense>
  );
}
