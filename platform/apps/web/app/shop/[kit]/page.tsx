"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import LockerScene, { type LockerHandle, type LockerView } from "../../../components/LockerScene";
import KitThumb from "../../../components/KitThumb";
import SwatchPicker, { usePalette } from "../../../components/SwatchPicker";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { variantQuery } from "../../../lib/garment-options";
import { DRAFT_KEY, emptyQty } from "../../../lib/order-draft";
import {
  kitById, isBottom, restoreConfig, defaultConfig, parseRoster, cleanName, cleanNumber,
  kitParts, kitFabrics, kitTrims, kitPriceGarment, PATTERNS, FONTS, FABRIC_OPTIONS, QUICK_SWATCHES, SIZES,
  type Kit, type KitConfig, type PartId, type RosterRow, type Size,
} from "../../../lib/kits";
import { importLogo, importFont, listAssets, deleteAsset, LOGO_ACCEPT, FONT_ACCEPT, fontFamilyOf, registerFont, type KitAsset } from "../../../lib/kit-assets";
import { useKitAssets, uploadDesignAssets } from "../../../lib/use-kit-assets";
import "../../app.css"; // UserMenu + SwatchPicker base styles
import "../../home.css";

type Tab = "color" | "pattern" | "logo" | "name" | "order";
const TABS: { id: Tab; label: string }[] = [
  { id: "color", label: "สี" },
  { id: "pattern", label: "ลาย" },
  { id: "logo", label: "โลโก้" },
  { id: "name", label: "ชื่อ-เบอร์" },
  { id: "order", label: "ไซซ์และสั่งผลิต" },
];

interface Quote { unitPrice: number; subtotal: number; shippingFee: number; total: number; depositAmount: number; depositPct: number }

const storeKey = (id: string) => `axiom-kit-studio:${id}`;
const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");

export default function KitStudioPage() {
  const id = String(useParams().kit ?? "");
  const kit = kitById(id);
  if (!kit) {
    return (
      <div className="ax" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <h1 className="ax-display" style={{ fontSize: 56 }}>ไม่พบทรงเสื้อนี้</h1>
          <Link href="/shop" className="ax-btn solid">กลับไปที่ราวเสื้อ</Link>
        </div>
      </div>
    );
  }
  return <Studio key={kit.id} kit={kit} />;
}

function Studio({ kit }: { kit: Kit }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const palette = usePalette();
  const scene = useRef<LockerHandle>(null);

  const [cfg, setCfg] = useState<KitConfig>(() => defaultConfig(kit));
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("color");
  const parts = useMemo(() => kitParts(kit), [kit]);
  const fabricOptions = useMemo(() => FABRIC_OPTIONS.filter(f => kitFabrics(kit).includes(f.id)), [kit]);
  const trimOptions = useMemo(() => kitTrims(kit), [kit]);
  const [partIdx, setPartIdx] = useState(0);
  const [view, setView] = useState<LockerView>("front");
  const [onMannequin, setOnMannequin] = useState(true);
  const [photo, setPhoto] = useState(false);
  const [flat, setFlat] = useState(false);
  const [hexDraft, setHexDraft] = useState("");
  const [rosterText, setRosterText] = useState("");
  const [qty, setQty] = useState<Record<Size, number>>(() => ({ ...emptyQty(), M: 10, L: 5 }));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "order">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // the team's own files on this device
  const [myLogos, setMyLogos] = useState<KitAsset[]>([]);
  const [myFonts, setMyFonts] = useState<KitAsset[]>([]);
  const [fontFams, setFontFams] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<"" | "logo" | "font">("");
  const [assetMsg, setAssetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listAssets("logo").then(setMyLogos);
    listAssets("font").then(async fs => {
      setMyFonts(fs);
      const fams: Record<string, string> = {};
      for (const f of fs) { const fam = await registerFont(f); if (fam) fams[f.id] = fam; }
      setFontFams(fams);
    });
  }, []);

  async function onLogoFile(file?: File | null) {
    if (!file) return;
    setImporting("logo"); setAssetMsg(null);
    try {
      const a = await importLogo(file);
      setMyLogos(l => [a, ...l]);
      setCfg(c => ({ ...c, logo: a.id }));
      setAssetMsg({ ok: true, text: a.cleaned ? "นำเข้าโลโก้แล้ว · ลบพื้นหลังสีขาวให้อัตโนมัติ" : "นำเข้าโลโก้แล้ว" });
    } catch (e: any) { setAssetMsg({ ok: false, text: e.message || "นำเข้าโลโก้ไม่สำเร็จ" }); }
    finally { setImporting(""); if (logoInput.current) logoInput.current.value = ""; }
  }

  async function onFontFile(file?: File | null) {
    if (!file) return;
    setImporting("font"); setAssetMsg(null);
    try {
      const a = await importFont(file);
      setMyFonts(l => [a, ...l]);
      setFontFams(m => ({ ...m, [a.id]: fontFamilyOf(a.id) }));
      setCfg(c => ({ ...c, fontAsset: a.id }));
      setAssetMsg({ ok: true, text: "นำเข้าฟอนต์แล้ว · ใช้กับชื่อและเบอร์ทั้งหน้าและหลัง" });
    } catch (e: any) { setAssetMsg({ ok: false, text: e.message || "นำเข้าฟอนต์ไม่สำเร็จ" }); }
    finally { setImporting(""); if (fontInput.current) fontInput.current.value = ""; }
  }

  async function removeAsset(a: KitAsset) {
    await deleteAsset(a.id);
    if (a.kind === "logo") { setMyLogos(l => l.filter(x => x.id !== a.id)); setCfg(c => (c.logo === a.id ? { ...c, logo: "axiom" } : c)); }
    else { setMyFonts(l => l.filter(x => x.id !== a.id)); setCfg(c => (c.fontAsset === a.id ? { ...c, fontAsset: undefined } : c)); }
  }

  // restore this kit's last setup on this device
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey(kit.id));
      if (raw) {
        const saved = JSON.parse(raw);
        setCfg(restoreConfig(kit, saved.cfg));
        if (typeof saved.roster === "string") setRosterText(saved.roster);
        if (saved.qty) setQty(q => ({ ...q, ...saved.qty }));
      }
    } catch { /* private mode or a broken blob: start from the defaults */ }
    setLoaded(true);
  }, [kit]);

  // …and keep remembering it
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(storeKey(kit.id), JSON.stringify({ cfg, roster: rosterText, qty })); } catch { /* quota / private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [cfg, rosterText, qty, loaded, kit.id]);

  const roster = useMemo(() => parseRoster(rosterText), [rosterText]);
  const sizeCounts = useMemo(() => {
    if (!roster.length) return qty;
    const q = emptyQty();
    for (const r of roster) q[r.size]++;
    return q;
  }, [roster, qty]);
  const totalQty = SIZES.reduce((n, s) => n + sizeCounts[s], 0);

  // live price from the same endpoint checkout uses
  useEffect(() => {
    if (totalQty === 0) { setQuote(null); setQuoteErr(false); return; }
    const t = setTimeout(() => {
      apiFetch<Quote>(`/orders/quote?totalQty=${totalQty}&fabric=${cfg.fabric}&trim=${cfg.trim}&reversible=false&garment=${kitPriceGarment(kit)}`)
        .then(q => { setQuote(q); setQuoteErr(false); })
        .catch(() => { setQuote(null); setQuoteErr(true); });
    }, 250);
    return () => clearTimeout(t);
  }, [totalQty, cfg.fabric, cfg.trim, kit]);

  const resolved = useKitAssets(cfg);
  const look = useMemo(() => ({
    colors: cfg.colors, pattern: cfg.pattern, trim: cfg.trim, fabric: cfg.fabric,
    name: cfg.name.trim(), number: cfg.number, font: cfg.font,
    logo: resolved.logo, logoTint: resolved.logoTint, fontFamily: resolved.fontFamily,
  }), [cfg, resolved.logo, resolved.logoTint, resolved.fontFamily]);

  const part = parts[Math.min(partIdx, parts.length - 1)];
  const cur = cfg.colors[part.id];
  const swatchName = QUICK_SWATCHES.find(s => s.hex === cur)?.name
    ?? palette.find(s => s.c.toLowerCase() === cur)?.k
    ?? cur.toUpperCase();
  const setColor = (pid: PartId, hex: string) => setCfg(c => ({ ...c, colors: { ...c.colors, [pid]: hex.toLowerCase() } }));
  const goPart = (i: number) => { const n = parts.length; setPartIdx(((i % n) + n) % n); setHexDraft(""); };

  const onHex = (v: string) => {
    setHexDraft(v);
    const h = (v.startsWith("#") ? v : "#" + v).trim();
    if (/^#[0-9a-f]{6}$/i.test(h)) setColor(part.id, h);
  };
  const hexOffChart = !QUICK_SWATCHES.some(s => s.hex === cur) && palette.length > 0 && !palette.some(s => s.c.toLowerCase() === cur);

  function preview(): string | undefined {
    try { return scene.current?.capture(900, 900) ?? undefined; } catch { return undefined; }
  }

  async function saveToAccount(name?: string): Promise<string> {
    // the team's logo/font go to the server once; the design keeps the links
    const assets = token ? await uploadDesignAssets(resolved, token) : undefined;
    const res = await apiFetch<{ id: string }>("/designs", {
      method: "POST",
      token,
      body: JSON.stringify({
        name: name ?? `${kit.name} · ${cfg.name.trim() || kit.code}`,
        mode: "single",
        // the team's logo/font files go with the design, so the factory prints exactly this
        stateJson: { ...cfg, name: cfg.name.trim(), roster, assets },
        previewUrl: preview(),
      }),
    });
    return res.id;
  }

  async function onSave() {
    setMsg(null);
    if (!user || !token) {
      setMsg({ ok: true, text: "บันทึกไว้ในเครื่องนี้แล้ว · เข้าสู่ระบบเพื่อเก็บเข้าบัญชี" });
      return;
    }
    setBusy("save");
    try {
      await saveToAccount();
      setMsg({ ok: true, text: "บันทึกแบบเข้าบัญชีแล้ว ดูได้ที่หน้าบัญชีของฉัน" });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "บันทึกไม่สำเร็จ" });
    } finally { setBusy(""); }
  }

  async function onOrder() {
    setMsg(null);
    if (totalQty === 0) { setMsg({ ok: false, text: "ใส่จำนวนอย่างน้อย 1 ตัวก่อนสั่งผลิต" }); return; }
    if (!user || !token) { router.push(`/login?next=${encodeURIComponent(`/shop/${kit.id}`)}`); return; }
    setBusy("order");
    try {
      const designId = await saveToAccount(`${kit.name} · ${totalQty} ตัว`);
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
          designId, fabric: cfg.fabric, trim: cfg.trim, reversible: false,
          roster: roster as RosterRow[], qty: roster.length ? undefined : qty,
        }));
      } catch { /* private mode: checkout still opens, just without the prefill */ }
      router.push(`/checkout?design=${designId}`);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "สั่งผลิตไม่สำเร็จ" });
      setBusy("");
    }
  }

  function savePhoto() {
    const url = scene.current?.capture(1920, 1080);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `axiom-${kit.id}-${cfg.number || "kit"}.png`;
    a.click();
  }

  const advancedHref = `/design?kit=${kit.id}${variantQuery({ bodyColor: cfg.colors.body, trimColor: cfg.colors.trim, size: "M", trim: cfg.trim })}`;

  return (
    <div className="ax ax-studio">
      <header className="ax-sbar">
        <Link href={`/shop?kit=${kit.id}`} className="ax-sbrand" aria-label="กลับไปที่ราวเสื้อ">
          <span aria-hidden="true">A</span>
          <span>AXIOM / STUDIO</span>
        </Link>
        <div className="ax-sbar-right">
          <Link href="/account">แบบของฉัน</Link>
          <span className="sep" aria-hidden="true" />
          <button type="button" className="ax-sq hot" onClick={onSave} disabled={busy !== ""}>
            {busy === "save" ? "กำลังบันทึก…" : "บันทึกแบบ"}
          </button>
        </div>
      </header>

      <div className="ax-sbody">
        <section className={`ax-sstage${photo ? " photo" : ""}`} aria-label="ห้องแสดงเสื้อ">
          {!flat ? (
            <LockerScene ref={scene} kit={kit} look={look} view={view} mannequin={onMannequin} onFail={() => setFlat(true)} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <KitThumb kit={kit} colors={cfg.colors} pattern={cfg.pattern} number={cfg.number} label={kit.name} style={{ width: "min(46%, 420px)" }} />
              <p className="ax-mono" style={{ textAlign: "center", padding: "0 20px" }}>เบราว์เซอร์นี้แสดง 3D ไม่ได้ · ยังปรับแต่งและสั่งผลิตได้ตามปกติ</p>
            </div>
          )}

          {!photo && (
            <>
              <div className="ax-sover ax-stitle">
                <span style={{ fontSize: 15, color: "#e3e1dc" }}>{kit.name} · {kit.code}</span>
                <h1>ทำให้เป็น<br />ของทีม.</h1>
                <span className="bar" aria-hidden="true" />
                <span className="ax-tagline">ONE KIT.<br />EVERY PLAYER.<br />YOURS.</span>
              </div>
              <div className="ax-sover ax-sghost" aria-hidden="true">
                <b>{kit.code}</b>
                <span style={{ fontSize: 16, letterSpacing: "0.2em" }}>{kit.en.toUpperCase()}</span>
              </div>
            </>
          )}

          <div className="ax-sover ax-scontrols">
            <div className="group">
              {!photo && !flat && (
                <>
                  {(["front", "side", "back"] as LockerView[]).map(v => (
                    <button key={v} type="button" className="ax-sq" aria-pressed={view === v} onClick={() => setView(v)}>
                      {v === "front" ? "ด้านหน้า" : v === "side" ? "ด้านข้าง" : "ด้านหลัง"}
                    </button>
                  ))}
                  <span className="ax-vsep" aria-hidden="true" />
                  <button type="button" className="ax-sq" aria-pressed={onMannequin} onClick={() => setOnMannequin(m => !m)}>
                    {onMannequin ? "แขวนบนไม้แขวน" : "สวมบนหุ่น"}
                  </button>
                  <span className="ax-vsep" aria-hidden="true" />
                </>
              )}
              {!flat && <button type="button" className="ax-sq" aria-pressed={photo} onClick={() => setPhoto(p => !p)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                {photo ? "ออกจากโหมดถ่ายภาพ" : "โหมดถ่ายภาพ"}
              </button>}
              {photo && <button type="button" className="ax-sq hot" onClick={savePhoto}>บันทึกภาพ PNG</button>}
            </div>
            {!flat && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ax-mute)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                ลากเพื่อหมุน · เลื่อนเพื่อซูม
              </span>
            )}
          </div>
        </section>

        {!photo && (
          <aside className="ax-panel" aria-label="แผงปรับแต่ง" id="studio-panel">
            {tab === "color" && (
              <>
                <div className="ax-phead">
                  <span className="ax-label" style={{ margin: 0 }}>{String(partIdx + 1).padStart(2, "0")} / สี</span>
                  <div className="arrows">
                    <button type="button" className="ax-icon" aria-label="ส่วนก่อนหน้า" onClick={() => goPart(partIdx - 1)}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10.5 3.5-4.5 4.5 4.5 4.5" /></svg>
                    </button>
                    <button type="button" className="ax-icon" aria-label="ส่วนถัดไป" onClick={() => goPart(partIdx + 1)}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5.5 3.5 4.5 4.5-4.5 4.5" /></svg>
                    </button>
                  </div>
                  <span className="prog" aria-hidden="true" style={{ width: `${((partIdx + 1) / parts.length) * 100}%` }} />
                </div>
                <div>
                  <h2>{part.label}</h2>
                  <p className="ax-psub">{part.hint}</p>
                </div>
                <div>
                  <div className="ax-swatches" role="group" aria-label={`สีของ${part.label}`}>
                    {QUICK_SWATCHES.map(s => (
                      <button key={s.hex} type="button" className="ax-sw" aria-label={s.name} aria-pressed={cur === s.hex} style={{ background: s.hex }} onClick={() => { setColor(part.id, s.hex); setHexDraft(""); }} />
                    ))}
                  </div>
                  <p style={{ margin: "12px 0 0", fontSize: 16 }}>{swatchName}</p>
                </div>
                <div className="ax-pal">
                  <SwatchPicker label="สีทั้งหมดในชาร์ตโรงงาน" value={cur} onChange={h => { setColor(part.id, h); setHexDraft(""); }} />
                </div>
                <div>
                  <label className="ax-label" htmlFor="hex">กำหนดสีเอง (HEX)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--ax-line-2)", padding: "0 12px" }}>
                    <input id="hex" className="ax-field" style={{ border: 0, padding: 0, fontFamily: "var(--ax-mono)" }} value={hexDraft || cur.toUpperCase()} maxLength={7} onChange={e => onHex(e.target.value)} />
                    <span aria-hidden="true" style={{ width: 28, height: 28, flex: "none", border: "1px solid #4a4d52", background: cur }} />
                  </div>
                  {hexOffChart && <p className="ax-err" style={{ marginTop: 8 }}>สีนี้ไม่อยู่ในชาร์ตโรงงาน สีที่พิมพ์จริงอาจต่างจากจอ</p>}
                </div>
                {part.id === "trim" && (
                  <div>
                    <span className="ax-label">ตำแหน่งขลิบ</span>
                    <div className="ax-grid2">
                      {trimOptions.map(t => (
                        <button key={t.id} type="button" className="ax-opt" aria-pressed={cfg.trim === t.id} onClick={() => setCfg(c => ({ ...c, trim: t.id }))}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="ax-label">เนื้อผ้า</span>
                  <div className={fabricOptions.length === 3 ? "ax-grid3" : "ax-grid2"}>
                    {fabricOptions.map(f => (
                      <button key={f.id} type="button" className="ax-opt" aria-pressed={cfg.fabric === f.id} onClick={() => setCfg(c => ({ ...c, fabric: f.id }))}>
                        {f.label}<small>{f.sub}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "pattern" && (
              <>
                <div className="ax-phead"><span className="ax-label" style={{ margin: 0 }}>02 / ลาย</span></div>
                <div>
                  <h2>{isBottom(kit) ? "ลายกางเกง" : "ลายเสื้อ"}</h2>
                  <p className="ax-psub">เลือกลาย แล้วเปลี่ยนสีลายได้ที่แท็บสี → สีลาย</p>
                </div>
                <div className="ax-grid2">
                  {PATTERNS.map(p => (
                    <button key={p.id} type="button" className="ax-opt left" aria-pressed={cfg.pattern === p.id} onClick={() => setCfg(c => ({ ...c, pattern: p.id }))}>
                      <span style={{ fontSize: 15, color: "var(--ax-ink)" }}>{p.label}</span>
                      <small style={{ fontFamily: "var(--ax-mono)" }}>{p.code}</small>
                    </button>
                  ))}
                </div>
                <button type="button" className="ax-sq" onClick={() => { setTab("color"); setPartIdx(parts.findIndex(p => p.id === "stripe")); }}>เปลี่ยนสีลาย →</button>
              </>
            )}

            {tab === "logo" && (
              <>
                <div className="ax-phead"><span className="ax-label" style={{ margin: 0 }}>03 / โลโก้</span></div>
                <div>
                  <h2>โลโก้บนอก</h2>
                  <p className="ax-psub">ใช้โลโก้ของทีมได้เลย · พิมพ์ที่อกซ้ายด้านหน้า</p>
                </div>
                <div className="ax-assets" role="radiogroup" aria-label="โลโก้">
                  <button type="button" className="ax-asset" role="radio" aria-checked={cfg.logo === "axiom"} onClick={() => setCfg(c => ({ ...c, logo: "axiom" }))}>
                    <span className="pic dark"><img src="/models/axiom-logo-white.png" alt="" /></span>
                    <small>AXIOM</small>
                  </button>
                  <button type="button" className="ax-asset" role="radio" aria-checked={cfg.logo === "none"} onClick={() => setCfg(c => ({ ...c, logo: "none" }))}>
                    <span className="pic none" aria-hidden="true">—</span>
                    <small>ไม่ใส่โลโก้</small>
                  </button>
                  {myLogos.map(a => (
                    <div key={a.id} className="ax-asset-wrap">
                      <button type="button" className="ax-asset" role="radio" aria-checked={cfg.logo === a.id} onClick={() => setCfg(c => ({ ...c, logo: a.id }))} title={a.name}>
                        <span className="pic check"><img src={a.data} alt="" /></span>
                        <small>{a.name}</small>
                      </button>
                      <button type="button" className="ax-asset-x" onClick={() => removeAsset(a)} aria-label={`ลบ ${a.name}`}>×</button>
                    </div>
                  ))}
                  <button type="button" className="ax-asset add" onClick={() => logoInput.current?.click()} disabled={importing !== ""}>
                    <span className="pic none" aria-hidden="true">+</span>
                    <small>{importing === "logo" ? "กำลังนำเข้า…" : "นำเข้าโลโก้"}</small>
                  </button>
                </div>
                <input ref={logoInput} type="file" accept={LOGO_ACCEPT} hidden onChange={e => onLogoFile(e.target.files?.[0])} />
                <p className="ax-psub" style={{ fontSize: 13, margin: 0 }}>PNG พื้นใส ได้ผลดีที่สุด · JPG พื้นขาวจะลบพื้นหลังให้อัตโนมัติ · SVG, WEBP ก็ได้ (ไม่เกิน 8MB)</p>
                {cfg.logo.startsWith("logo-") && (
                  <div>
                    <span className="ax-label">การพิมพ์โลโก้</span>
                    <div className="ax-grid2">
                      <button type="button" className="ax-opt" aria-pressed={!cfg.logoTint} onClick={() => setCfg(c => ({ ...c, logoTint: false }))}>
                        <span>สีตามไฟล์</span><small>พิมพ์ซับลิเมชันได้ทุกสี</small>
                      </button>
                      <button type="button" className="ax-opt" aria-pressed={cfg.logoTint} onClick={() => setCfg(c => ({ ...c, logoTint: true }))}>
                        <span>สีเดียวกับเบอร์</span><small>โลโก้สีเดียว</small>
                      </button>
                    </div>
                  </div>
                )}
                {resolved.missing.includes("logo") && <p className="note-bad">ไม่พบไฟล์โลโก้นี้ในเครื่อง · นำเข้าใหม่อีกครั้ง</p>}
                {assetMsg && <p className={assetMsg.ok ? "note-ok" : "note-bad"} role="status">{assetMsg.text}</p>}
              </>
            )}

            {tab === "name" && (
              <>
                <div className="ax-phead"><span className="ax-label" style={{ margin: 0 }}>04 / ชื่อ-เบอร์</span></div>
                <div>
                  <h2>ชื่อและเบอร์</h2>
                  <p className="ax-psub">{isBottom(kit) ? "กางเกงพิมพ์เบอร์ที่ขา · ชื่อใช้แยกตัวตอนผลิตและแพ็ก" : "พิมพ์ตัวอย่าง หรือวางรายชื่อทั้งทีม"}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 10 }}>
                  <label className="ax-label" style={{ margin: 0 }}>ชื่อ
                    <input className="ax-field" style={{ marginTop: 8, letterSpacing: "0.06em" }} value={cfg.name} maxLength={14} onChange={e => setCfg(c => ({ ...c, name: cleanName(e.target.value) }))} />
                  </label>
                  <label className="ax-label" style={{ margin: 0 }}>เบอร์
                    <input className="ax-field" style={{ marginTop: 8 }} inputMode="numeric" value={cfg.number} maxLength={2} onChange={e => setCfg(c => ({ ...c, number: cleanNumber(e.target.value) }))} />
                  </label>
                </div>
                <div>
                  <span className="ax-label">ฟอนต์</span>
                  <div className="ax-grid3">
                    {FONTS.map(f => (
                      <button key={f.id} type="button" className="ax-opt" aria-pressed={!cfg.fontAsset && cfg.font === f.id} onClick={() => setCfg(c => ({ ...c, font: f.id, fontAsset: undefined }))}>
                        <span style={{ fontFamily: `"${f.family}", sans-serif`, fontSize: 18, fontWeight: f.id === "block" ? 400 : 800 }}>10</span>
                        <small>{f.label}</small>
                      </button>
                    ))}
                    {myFonts.map(f => (
                      <div key={f.id} className="ax-asset-wrap">
                        <button type="button" className="ax-opt" style={{ width: "100%" }} aria-pressed={cfg.fontAsset === f.id} onClick={() => setCfg(c => ({ ...c, fontAsset: f.id }))} title={f.name}>
                          <span style={{ fontFamily: fontFams[f.id] ? `"${fontFams[f.id]}", sans-serif` : undefined, fontSize: 18 }}>{cfg.number || "10"}</span>
                          <small className="ax-ellipsis">{f.name.replace(/\.(ttf|otf|woff2?)$/i, "")}</small>
                        </button>
                        <button type="button" className="ax-asset-x" onClick={() => removeAsset(f)} aria-label={`ลบ ${f.name}`}>×</button>
                      </div>
                    ))}
                    <button type="button" className="ax-opt" onClick={() => fontInput.current?.click()} disabled={importing !== ""}>
                      <span style={{ fontSize: 18 }}>+</span>
                      <small>{importing === "font" ? "กำลังนำเข้า…" : "นำเข้าฟอนต์"}</small>
                    </button>
                  </div>
                  <input ref={fontInput} type="file" accept={FONT_ACCEPT} hidden onChange={e => onFontFile(e.target.files?.[0])} />
                  <p className="ax-psub" style={{ fontSize: 13, margin: "8px 0 0" }}>ฟอนต์ของทีม .ttf .otf .woff .woff2 (ไม่เกิน 4MB) · ใช้กับชื่อและเบอร์ · ควรเป็นฟอนต์ที่ทีมมีสิทธิ์ใช้</p>
                  {resolved.missing.includes("font") && <p className="note-bad">ไม่พบไฟล์ฟอนต์นี้ในเครื่อง · นำเข้าใหม่อีกครั้ง</p>}
                  {assetMsg && tab === "name" && <p className={assetMsg.ok ? "note-ok" : "note-bad"} role="status">{assetMsg.text}</p>}
                </div>
                <div>
                  <label className="ax-label" htmlFor="roster">รายชื่อทั้งทีม (วางจาก Excel)</label>
                  <textarea id="roster" className="ax-field" placeholder={"ชื่อ\tเบอร์\tไซซ์\nSOMCHAI\t10\tL\nANAN\t7\tM"} value={rosterText} onChange={e => setRosterText(e.target.value)} />
                  <p className="ax-psub" style={{ fontSize: 13 }}>
                    หนึ่งคนต่อหนึ่งบรรทัด: ชื่อ, เบอร์, ไซซ์ ({SIZES.join(" / ")}) · {roster.length ? `อ่านได้ ${roster.length} คน กดชื่อเพื่อดูบนเสื้อ` : "ยังไม่มีรายชื่อ"}
                  </p>
                </div>
                {roster.length > 0 && (
                  <div className="ax-roster" role="list">
                    {roster.map((r, i) => (
                      <button key={i} type="button" role="listitem" aria-pressed={cfg.name.trim() === r.playerName && cfg.number === r.number}
                        onClick={() => setCfg(c => ({ ...c, name: r.playerName, number: r.number }))}>
                        <span>{r.playerName || "—"}</span>
                        <span style={{ fontFamily: "var(--ax-mono)" }}>{r.number || "—"}</span>
                        <span style={{ fontFamily: "var(--ax-mono)", color: "var(--ax-mute)" }}>{r.size}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "order" && (
              <>
                <div className="ax-phead"><span className="ax-label" style={{ margin: 0 }}>05 / สั่งผลิต</span></div>
                <div>
                  <h2>ไซซ์และจำนวน</h2>
                  <p className="ax-psub">{roster.length ? `นับจากรายชื่อ ${roster.length} คน · แก้ได้ที่แท็บชื่อ-เบอร์` : kit.priceAs ? "ราคาเดียวทุกจำนวน" : "ราคาลดลงตามจำนวน"}</p>
                </div>
                <div>
                  {SIZES.map(s => (
                    <div className="ax-step" key={s}>
                      <span style={{ fontFamily: "var(--ax-mono)", fontSize: 15 }}>{s}</span>
                      {roster.length ? (
                        <span style={{ fontFamily: "var(--ax-mono)", fontSize: 15 }}>{sizeCounts[s]} ตัว</span>
                      ) : (
                        <div className="ctl">
                          <button type="button" aria-label={`ลด ${s}`} onClick={() => setQty(q => ({ ...q, [s]: Math.max(0, q[s] - 1) }))}>−</button>
                          <input aria-label={`จำนวนไซซ์ ${s}`} inputMode="numeric" value={qty[s]} onChange={e => setQty(q => ({ ...q, [s]: Math.max(0, Math.min(5000, Math.trunc(Number(e.target.value.replace(/\D/g, "")) || 0))) }))} />
                          <button type="button" aria-label={`เพิ่ม ${s}`} onClick={() => setQty(q => ({ ...q, [s]: Math.min(5000, q[s] + 1) }))}>+</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>รวม</span><span style={{ fontFamily: "var(--ax-mono)" }}>{totalQty} ตัว</span></div>
                  {quote ? (
                    <>
                      <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>ราคาต่อตัว</span><span>{baht(quote.unitPrice)}</span></div>
                      <div className="ax-price"><span style={{ color: "var(--ax-mute)" }}>ค่าส่ง</span><span>{quote.shippingFee ? baht(quote.shippingFee) : "ฟรี"}</span></div>
                      <div className="ax-price"><span>ยอดรวม</span><b>{baht(quote.total)}</b></div>
                      <p className="ax-psub" style={{ fontSize: 13, margin: 0 }}>มัดจำ {quote.depositPct}% · {baht(quote.depositAmount)} ก่อนเริ่มผลิต</p>
                    </>
                  ) : (
                    <p className="ax-psub" style={{ fontSize: 13, margin: 0 }}>{!totalQty ? "ใส่จำนวนเพื่อดูราคา" : quoteErr ? "ตอนนี้คำนวณราคาไม่ได้ · ราคาจริงจะแสดงในหน้าสั่งผลิต" : "กำลังคำนวณราคา…"}</p>
                  )}
                </div>
                <button type="button" className="ax-btn solid sq" style={{ minHeight: 54 }} onClick={onOrder} disabled={busy !== ""}>
                  {busy === "order" ? "กำลังสร้างออเดอร์…" : user ? "สั่งผลิตเลย" : "เข้าสู่ระบบเพื่อสั่งผลิต"}
                </button>
                <Link href={advancedHref} className="ax-btn ghost sq">เปิดในโปรแกรมออกแบบขั้นสูง</Link>
              </>
            )}

            {msg && <p className={msg.ok ? "ax-ok" : "ax-err"} role="status">{msg.text}</p>}
            <div className="ax-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></svg>
              แบบนี้บันทึกอัตโนมัติในเครื่องนี้
            </div>
          </aside>
        )}
      </div>

      {!photo && (
        <nav className="ax-tabs" aria-label="หมวดการปรับแต่ง">
          <div className="list" role="tablist">
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" className="ax-tab" aria-selected={tab === t.id} aria-controls="studio-panel" onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <span className="ax-mono" style={{ fontSize: 11, letterSpacing: "0.3em" }}>Made by a team · for teams</span>
        </nav>
      )}
    </div>
  );
}
