"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import SwatchPicker from "../../../components/SwatchPicker";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { tri, locale, useLang, type Lang } from "../../../lib/i18n";
import { importPrintLogo, uploadAsset, LOGO_ACCEPT } from "../../../lib/kit-assets";
import { logoDpi } from "../../../lib/bib-roster";
import { readRoster, numberedLines, countBySize, BIB_SIZES, BIB_SIZE_LABEL, NAME_MAX, type BibSize } from "../../../lib/bib-roster";

/**
 * /order/bib — designing bibs on the website, for the same result as a team's
 * own Illustrator zip: colours from the factory's chart, both sides of a
 * reversible bib, rib bands, the team's logo, a name list. The live order sheet
 * on the right is drawn by the API from the very shapes that go into the print
 * files; when the order is placed the API builds the job (one print file per
 * bib, the order sheet, the name list) and it travels like an uploaded zip.
 */

type Product = "bib_r" | "bib_n";
type Pattern = "plain" | "stripes" | "hoops";
interface Side {
  body: string; pattern: Pattern; patternColor: string; ink: string;
  outline: boolean; inkOutline: string;
  ribs: boolean; rib: { neck: string; arm: string; hem: string };
}
interface Breakdown { totalQty: number; unitPrice: number; subtotal: number; shippingFee: number; total: number; depositAmount: number; depositPct: number; freeShippingOver: number }
interface Address { id: string; recipient: string; phone: string; line1: string; line2?: string | null; district?: string | null; province?: string | null; postalCode: string; isDefault: boolean }

// colours on the factory's DTP chart
const PURPLE = "#662d91", YELLOW = "#fff200", NAVY = "#2e3192", BLACK = "#231f20", WHITE = "#ffffff", GREY = "#939598";
const SIDE_A: Side = { body: PURPLE, pattern: "plain", patternColor: GREY, ink: YELLOW, outline: true, inkOutline: NAVY, ribs: true, rib: { neck: BLACK, arm: BLACK, hem: BLACK } };
const SIDE_B: Side = { body: WHITE, pattern: "plain", patternColor: GREY, ink: PURPLE, outline: true, inkOutline: BLACK, ribs: false, rib: { neck: BLACK, arm: BLACK, hem: BLACK } };
const FONTS = [
  { id: "block", name: "Block", family: "Anton" },
  { id: "classic", name: "Classic", family: "Sora" },
  { id: "thai", name: "ไทย", family: "Noto Sans Thai" },
] as const;
type FontId = (typeof FONTS)[number]["id"];
const SHOW = ["frontNumber", "frontLogo", "frontTeam", "backName", "backNumber"] as const;
type Show = Record<(typeof SHOW)[number], boolean>;

/** what the API takes (bibs/design.ts) */
function sideOut(s: Side) {
  return {
    body: s.body, pattern: s.pattern, ink: s.ink,
    ...(s.pattern !== "plain" ? { patternColor: s.patternColor } : {}),
    ...(s.outline ? { inkOutline: s.inkOutline } : {}),
    ...(s.ribs ? { rib: s.rib } : {}),
  };
}

function BibDesigner({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const L = tri(lang);
  const baht = (n: number) => "฿" + (n ?? 0).toLocaleString(locale(lang));

  const [product, setProduct] = useState<Product>("bib_r");
  const [team, setTeam] = useState("");
  const [font, setFont] = useState<FontId>("block");
  const [show, setShow] = useState<Show>({ frontNumber: true, frontLogo: true, frontTeam: true, backName: true, backNumber: true });
  const [sides, setSides] = useState<[Side, Side]>([SIDE_A, SIDE_B]);
  const [logo, setLogo] = useState<{ url: string; name: string; data: string; w: number; h: number; svg: boolean } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const [rosterText, setRosterText] = useState("");
  const [run, setRun] = useState<{ size: BibSize; count: number; from: number }>({ size: "M", count: 10, from: 1 });
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState<{ url: string; size: string; sizes: string[] } | null>(null);
  const [sheetSize, setSheetSize] = useState<string>("");
  const [sheetErr, setSheetErr] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrId, setAddrId] = useState("");
  const [agent, setAgent] = useState<{ name: string; fee: number } | null>(null);
  const [delivery, setDelivery] = useState<"address" | "agent">("address");
  const toAgent = delivery === "agent" && !!agent;
  const [note, setNote] = useState("");
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const roster = useMemo(() => readRoster(rosterText), [rosterText]);
  const counts = useMemo(() => countBySize(roster.rows), [roster]);
  const totalQty = roster.rows.length;
  const used = product === "bib_r" ? sides : [sides[0]];

  const design = useMemo(() => ({
    product, team: team.trim(), font, show,
    sides: used.map(sideOut),
    // the preview draws a sample bib until there's a list
    roster: roster.rows.length ? roster.rows : [{ name: "NAME", number: "10", size: "M" as BibSize }],
  }), [product, team, font, show, used, roster]);

  // ---------- data
  useEffect(() => {
    apiFetch<{ flat?: Record<string, number> }>("/orders/price-table").then(t => setPrices(t.flat ?? {})).catch(() => {});
  }, []);
  const langAtLoad = useRef(lang);
  langAtLoad.current = lang;
  useEffect(() => {
    apiFetch<{ agent: { name: string; fee: number } | null }>("/orders/delivery-options").then(d => {
      setAgent(d.agent);
      if (d.agent && langAtLoad.current !== "th") setDelivery("agent");
    }).catch(() => {});
  }, []);
  const loadAddresses = useCallback(() => {
    if (!token) return;
    apiFetch<Address[]>("/auth/addresses", { token }).then(a => {
      setAddresses(a);
      setAddrId(prev => prev || a.find(x => x.isDefault)?.id || a[0]?.id || "");
    }).catch(() => {});
  }, [token]);
  useEffect(loadAddresses, [loadAddresses]);

  useEffect(() => {
    if (totalQty === 0) { setBd(null); return; }
    const t = setTimeout(() => {
      apiFetch<Breakdown>(`/orders/quote?totalQty=${totalQty}&fabric=mesh&trim=none&garment=${product}${toAgent ? "&delivery=agent" : ""}`).then(setBd).catch(() => setBd(null));
    }, 200);
    return () => clearTimeout(t);
  }, [totalQty, product, toAgent]);

  // ---------- the live order sheet, drawn by the API
  const lastUrl = useRef("");
  useEffect(() => {
    const t = setTimeout(async () => {
      setDrawing(true);
      try {
        const body = await apiFetch<{ svg: string; size: string; sizes: string[] }>("/bibs/sheet", {
          method: "POST",
          body: JSON.stringify({ design, logoUrl: show.frontLogo ? logo?.url : undefined, size: sheetSize || undefined }),
        });
        const url = URL.createObjectURL(new Blob([body.svg], { type: "image/svg+xml" }));
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        setSheet({ url, size: body.size, sizes: body.sizes });
        setSheetErr("");
      } catch {
        setSheetErr(L("ตอนนี้แสดงตัวอย่างไม่ได้ — ลองอีกครั้ง", "Couldn't draw the preview just now — try again", "プレビューを表示できませんでした。もう一度お試しください"));
      } finally { setDrawing(false); }
    }, 450);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, logo?.url, sheetSize, show.frontLogo]);
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  // ---------- actions
  async function onLogo(f?: File | null) {
    if (!f || !token) return;
    setLogoErr(""); setLogoBusy(true);
    try {
      // kept at print resolution (not the studio's 1024 px), uploaded as it is
      const a = await importPrintLogo(f);
      const url = await uploadAsset({ id: `print-logo-${Date.now()}`, kind: "logo", name: a.name, data: a.data, created: Date.now() }, token);
      setLogo({ url, name: a.name, data: a.data, w: a.w, h: a.h, svg: /\.svg$/i.test(f.name) || f.type === "image/svg+xml" });
    } catch (e: any) {
      setLogoErr(lang === "th" ? e?.message || "นำเข้าโลโก้ไม่สำเร็จ" : L("", "Couldn't use this logo — try a PNG with a clear background", "このロゴを使用できませんでした。背景が透明なPNGでお試しください"));
    } finally {
      setLogoBusy(false);
      if (logoInput.current) logoInput.current.value = "";
    }
  }

  const setSide = (i: 0 | 1, s: Side) => setSides(prev => (i === 0 ? [s, prev[1]] : [prev[0], s]));

  async function submit() {
    setErr("");
    if (!totalQty) { setErr(L("ใส่รายชื่อหรือเบอร์อย่างน้อย 1 ตัว", "Add at least one bib to the list", "リストに1枚以上追加してください")); return; }
    if (roster.errors.length) { setErr(L("มีบรรทัดในรายชื่อที่อ่านไม่ได้ — แก้ก่อนสั่ง", "Some lines in the list couldn't be read — fix them first", "読み取れない行があります。修正してから注文してください")); return; }
    if (!toAgent && !addrId) { setErr(L("กรุณาเลือกที่อยู่จัดส่ง", "Please choose a shipping address", "お届け先を選択してください")); return; }
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string }>("/orders", {
        method: "POST", token,
        body: JSON.stringify({
          bib: { ...design, roster: roster.rows },
          logoUrl: show.frontLogo ? logo?.url : undefined,
          ...(toAgent ? { delivery: "agent" } : { shippingAddressId: addrId }),
          note,
        }),
      });
      router.push(`/orders/${res.id}`);
    } catch (e: any) {
      setErr(lang === "th" ? e?.message || "สั่งผลิตไม่สำเร็จ" : L("", "Couldn't place the order — please try again, or contact us", "注文を作成できませんでした。もう一度お試しいただくか、お問い合わせください"));
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode, narrow = false) => (
    <AppShell narrow={narrow} wide={!narrow} lang={lang} onLang={setLang}>{children}</AppShell>
  );
  if (loading) return shell(<div className="acard"><p className="asub">{L("กำลังโหลด…", "Loading…", "読み込み中…")}</p></div>, true);
  if (!user)
    return shell(
      <div className="acard">
        <div className="eyebrow">{L("ออกแบบเอี๊ยมบนเว็บ", "Design your bibs", "Webでビブスをデザイン")}</div>
        <h1 className="atitle">{L("เข้าสู่ระบบเพื่อออกแบบและสั่งผลิต", "Please sign in to design and order", "デザイン・ご注文にはログインが必要です")}</h1>
        <p className="asub">{L("แบบ โลโก้ และออเดอร์จะเก็บไว้ในบัญชีของคุณ", "Your designs, logo and orders are kept in your account", "デザイン・ロゴ・ご注文はアカウントに保存されます")}</p>
        <Link className="abtn solid" href={`/login?next=${encodeURIComponent("/order/bib")}`}>{L("เข้าสู่ระบบ", "Sign in", "ログイン")}</Link>
      </div>,
      true,
    );

  const sizeName = (z: string) => BIB_SIZE_LABEL[z as BibSize] ?? z;
  return shell(
    <>
      <Link href="/account" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>{L("← กลับไปบัญชีของฉัน", "← Back to my account", "← マイアカウントへ戻る")}</Link>
      <div className="ou-grid">
        <div>
          <div className="acard">
            <div className="eyebrow">{L("ออกแบบเอี๊ยมบนเว็บ", "Design your bibs", "Webでビブスをデザイン")}</div>
            <h1 className="atitle" style={{ marginBottom: 4 }}>{L("เอี๊ยมของทีม", "Your team's bibs", "チームのビブス")}</h1>
            <p className="asub" style={{ margin: 0 }}>
              {L(
                "เลือกสีจากชาร์ตสีของโรงงาน ใส่โลโก้และรายชื่อ — ระบบทำไฟล์งานแบบเดียวกับที่ทีมกราฟิกทำให้ ส่งเข้าผลิตได้ทันทีหลังชำระเงิน",
                "Pick colours from the factory's colour chart, add your logo and names — the print files are made the same way our graphics team makes them, ready for production once you've paid.",
                "工場のカラーチャートから色を選び、ロゴと名簿を入れるだけ。グラフィックチームと同じ形式の入稿データを自動で作成し、お支払い後すぐに制作に入れます。",
              )}
              {" · "}{L("มีไฟล์ Illustrator แล้ว? ", "Have Illustrator files? ", "Illustratorデータをお持ちの方は")}<Link className="dlink" href="/order/upload">{L("ส่งไฟล์ .zip", "send your .zip", ".zipで入稿")}</Link>
            </p>
          </div>

          <div className="acard">
            <h2 className="ah2">{L("สินค้า", "Product", "商品")}</h2>
            <div className="ou-products" role="radiogroup" aria-label={L("สินค้า", "Product", "商品")}>
              {([["bib_n", "N-bib", L("ด้านเดียว", "Single-sided", "片面")], ["bib_r", "R-bib", L("2 ด้าน กลับด้านได้", "Reversible, 2 sides", "リバーシブル（両面）")]] as const).map(([id, name, sub]) => (
                <label key={id} className="ou-product" data-on={product === id ? "" : undefined}>
                  <input type="radio" name="product" checked={product === id} onChange={() => setProduct(id)} />
                  <b>{name}</b>
                  <span className="dim">{sub}</span>
                  {prices[id] !== undefined && <span className="price">{baht(prices[id])}{L("/ตัว", " / piece", "／枚")}</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">{L("ชื่อทีมและตัวอักษร", "Team name and lettering", "チーム名と書体")}</h2>
            <label className="flabel" htmlFor="bd-team">{L("ชื่อทีม (พิมพ์ด้านหน้า)", "Team name (printed on the front)", "チーム名（前面にプリント）")}</label>
            <input id="bd-team" className="ainput" value={team} maxLength={30} onChange={e => setTeam(e.target.value)} placeholder="SAGINUMA FC" />
            <span className="flabel">{L("ฟอนต์ ชื่อ-เบอร์", "Font for names and numbers", "名前・番号の書体")}</span>
            <div className="bd-fonts" role="radiogroup">
              {FONTS.map(f => (
                <label key={f.id} className="ou-product" data-on={font === f.id ? "" : undefined}>
                  <input type="radio" name="font" checked={font === f.id} onChange={() => setFont(f.id)} />
                  <b style={{ fontFamily: `"${f.family}", sans-serif`, fontSize: 22 }}>10 ABC</b>
                  <span className="dim">{f.name}</span>
                </label>
              ))}
            </div>
            <span className="flabel">{L("พิมพ์อะไรบ้าง", "What's printed", "プリント内容")}</span>
            <div className="bd-checks">
              {SHOW.map(k => (
                <label key={k}><input type="checkbox" checked={show[k]} onChange={e => setShow(s => ({ ...s, [k]: e.target.checked }))} />{" "}
                  {{
                    frontNumber: L("เบอร์ด้านหน้า (85 มม.)", "Front number (85 mm)", "前面の番号（85mm）"),
                    frontLogo: L("โลโก้ด้านหน้า (85 มม.)", "Front logo (85 mm)", "前面のロゴ（85mm）"),
                    frontTeam: L("ชื่อทีมด้านหน้า", "Team name on the front", "前面のチーム名"),
                    backName: L("ชื่อด้านหลัง (35 มม.)", "Name on the back (35 mm)", "背面の名前（35mm）"),
                    backNumber: L("เบอร์ด้านหลัง (200 มม.)", "Back number (200 mm)", "背番号（200mm）"),
                  }[k]}
                </label>
              ))}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">{L("โลโก้ทีม", "Team logo", "チームロゴ")}</h2>
            <div className="bd-logo">
              <div className="pic">{logo ? <img src={logo.data} alt="" /> : <span className="dim">{L("ยังไม่มีโลโก้", "No logo yet", "ロゴ未設定")}</span>}</div>
              <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                <button type="button" className="abtn ghost" disabled={logoBusy} onClick={() => logoInput.current?.click()}>
                  {logoBusy ? L("กำลังนำเข้า…", "Adding…", "読み込み中…") : logo ? L("เปลี่ยนโลโก้", "Change logo", "ロゴを変更") : L("เลือกไฟล์โลโก้", "Choose a logo file", "ロゴファイルを選択")}
                </button>
                {logo && <button type="button" className="minibtn" onClick={() => setLogo(null)}>{L("ไม่ใส่โลโก้", "No logo", "ロゴなし")}</button>}
                <span className="dim" style={{ fontSize: 12.5 }}>{L("PNG พื้นใสดีที่สุด · JPG พื้นขาวจะลบพื้นให้ · ไม่เกิน 8MB", "A PNG with a clear background works best · a white JPG background is removed · up to 8 MB", "背景が透明なPNGがおすすめ · JPGの白背景は自動で除去 · 最大8MB")}</span>
              </div>
            </div>
            <input ref={logoInput} type="file" accept={LOGO_ACCEPT} hidden onChange={e => onLogo(e.target.files?.[0])} />
            {logo && (() => {
              // how sharp it prints where it prints biggest (the largest size on the list)
              const q = logoDpi(logo.w, logo.h, roster.rows.map(r => r.size));
              const tone = q.dpi >= 250 ? "ok" : q.dpi >= 150 ? "soft" : "bad";
              return (
                <p className={tone === "bad" ? "ou-warn" : "dim"} style={{ fontSize: 13, margin: "10px 0 0" }}>
                  {tone === "ok" ? "✓ " : "⚠ "}
                  {L(
                    `${logo.w}×${logo.h} px · พิมพ์สูง ${q.mm} มม. (ไซส์ ${q.size}) ≈ ${q.dpi} dpi`,
                    `${logo.w}×${logo.h} px · printed ${q.mm} mm tall (size ${q.size}) ≈ ${q.dpi} dpi`,
                    `${logo.w}×${logo.h} px · 印刷時の高さ ${q.mm}mm（${q.size}サイズ）≈ ${q.dpi} dpi`,
                  )}
                  {logo.svg ? L(" · SVG คมทุกขนาด", " · SVG, sharp at any size", " · SVGはどのサイズでも鮮明") : ""}
                  {tone === "soft" && L(" — ใช้ได้ แต่ถ้ามีไฟล์ใหญ่กว่านี้จะคมกว่า", " — fine, but a bigger file would print sharper", " — 使用できますが、より大きいファイルの方が鮮明です")}
                  {tone === "bad" && L(" — ภาพจะแตกตอนพิมพ์ ใช้ไฟล์ที่ใหญ่กว่านี้หรือ SVG", " — this will print blurry; use a bigger file or an SVG", " — 印刷すると粗くなります。より大きいファイルかSVGをお使いください")}
                </p>
              );
            })()}
            {logoErr && <p className="ou-warn">⚠ {logoErr}</p>}
          </div>

          {used.map((s, i) => (
            <SideCard key={i} L={L} title={product === "bib_r" ? (i === 0 ? L("ด้าน A (ด้านหลัก)", "Side A (main side)", "A面（メイン）") : L("ด้าน B (ด้านกลับ)", "Side B (reverse)", "B面（裏面）")) : L("สีและลาย", "Colours and pattern", "色と柄")}
              side={s} onChange={v => setSide(i as 0 | 1, v)} />
          ))}

          <div className="acard">
            <h2 className="ah2">{L("รายชื่อ เบอร์ และไซส์", "Names, numbers and sizes", "名前・番号・サイズ")}</h2>
            <p className="asub">
              {L("หนึ่งบรรทัดต่อหนึ่งตัว: ชื่อ, เบอร์, ไซส์ — วางจาก Excel ได้เลย ไซส์: ", "One bib per line: name, number, size — paste from Excel. Sizes: ", "1行に1枚：名前、番号、サイズ（Excelから貼り付け可）。サイズ：")}
              {BIB_SIZES.map(z => BIB_SIZE_LABEL[z]).join(" · ")}
            </p>
            <textarea className="ainput bd-roster" rows={8} value={rosterText} onChange={e => setRosterText(e.target.value)}
              placeholder={"TAICHI\t48\tM\nSORA\t10\tL\nKAITO\t7\tXL-2L"} />
            <div className="bd-run">
              <span className="dim">{L("หรือเพิ่มเบอร์เรียง ไม่มีชื่อ:", "Or add a numbered run, no names:", "名前なしの連番を追加：")}</span>
              <select className="ainput" value={run.size} onChange={e => setRun(r => ({ ...r, size: e.target.value as BibSize }))} aria-label={L("ไซส์", "Size", "サイズ")}>
                {BIB_SIZES.map(z => <option key={z} value={z}>{BIB_SIZE_LABEL[z]}</option>)}
              </select>
              <label>{L("จำนวน", "How many", "枚数")} <input className="ainput" type="number" min={1} max={200} value={run.count} onChange={e => setRun(r => ({ ...r, count: Number(e.target.value) || 0 }))} /></label>
              <label>{L("เริ่มเบอร์", "From no.", "開始番号")} <input className="ainput" type="number" min={0} max={999} value={run.from} onChange={e => setRun(r => ({ ...r, from: Number(e.target.value) || 0 }))} /></label>
              <button type="button" className="minibtn" onClick={() => setRosterText(t => (t.trim() ? t.trimEnd() + "\n" : "") + numberedLines(run.size, run.count, run.from))}>{L("เพิ่ม", "Add", "追加")}</button>
            </div>
            <div className="bd-counts">
              {totalQty > 0
                ? <>{BIB_SIZES.filter(z => counts[z]).map(z => <span key={z} className="chip on">{BIB_SIZE_LABEL[z]} × {counts[z]}</span>)}<b>{L(`รวม ${totalQty} ตัว`, `${totalQty} in total`, `合計${totalQty}枚`)}</b></>
                : <span className="dim">{L("ยังไม่มีรายการ", "Nothing on the list yet", "まだリストがありません")}</span>}
            </div>
            {roster.errors.length > 0 && (
              <div className="ou-warn">
                ⚠ {L("อ่านไม่ได้", "Couldn't read", "読み取れない行")}:
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {roster.errors.slice(0, 8).map(e => (
                    <li key={e.line}>
                      {L(`บรรทัด ${e.line}`, `line ${e.line}`, `${e.line}行目`)} “{e.text}” — {e.why === "size" ? L("ไม่มีไซส์ที่เราผลิต", "no size we make", "対応サイズがありません")
                        : e.why === "name" ? L(`ชื่อยาวเกิน ${NAME_MAX} ตัวอักษร`, `name over ${NAME_MAX} characters`, `名前が${NAME_MAX}文字を超えています`)
                        : L("เบอร์เกิน 3 หลัก", "number over 3 digits", "番号が3桁を超えています")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="acard">
            <h2 className="ah2">{L("การจัดส่ง", "Delivery", "お届け方法")}</h2>
            {agent && (
              <div className="ou-delivery" role="radiogroup" aria-label={L("การจัดส่ง", "Delivery", "お届け方法")}>
                <label className="ou-product" data-on={toAgent ? "" : undefined}>
                  <input type="radio" name="delivery" checked={toAgent} onChange={() => setDelivery("agent")} />
                  <b>{L("ส่งรวมให้ตัวแทนในญี่ปุ่น", "Consolidated to our agent in Japan", "日本の代理店へまとめて発送")}</b>
                  <span className="dim">{agent.name} · {L("ไม่ต้องกรอกที่อยู่", "no address needed", "住所の入力は不要です")}</span>
                  <span className="price">{L("ค่าส่ง", "Shipping", "送料")} {agent.fee > 0 ? baht(agent.fee) : L("ฟรี", "free", "無料")}{L(" / ออเดอร์", " / order", "／注文")}</span>
                </label>
                <label className="ou-product" data-on={!toAgent ? "" : undefined}>
                  <input type="radio" name="delivery" checked={!toAgent} onChange={() => setDelivery("address")} />
                  <b>{L("ส่งถึงที่อยู่ของฉัน", "To my address", "指定の住所へ発送")}</b>
                  <span className="dim">{L("ในประเทศไทย", "in Thailand", "タイ国内")}</span>
                </label>
              </div>
            )}
            {toAgent ? null : addresses.length === 0 ? (
              <p className="asub">
                {L("ยังไม่มีที่อยู่ — ", "No address yet — ", "お届け先が未登録です。")}
                <Link className="dlink" href="/account">{L("เพิ่มที่อยู่ในบัญชีของฉัน", "add one in My account", "マイアカウントで追加")}</Link>
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {addresses.map(a => (
                  <label key={a.id} className="addr" style={{ display: "flex", gap: 10, cursor: "pointer", borderColor: addrId === a.id ? "var(--brand)" : undefined }}>
                    <input type="radio" name="addr" checked={addrId === a.id} onChange={() => setAddrId(a.id)} style={{ marginTop: 3 }} />
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                      <b>{a.recipient}</b> · {a.phone}
                      <div className="dim">{a.line1} {a.line2} {a.district} {a.province} {a.postalCode}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <label className="flabel" htmlFor="bd-note">{L("หมายเหตุถึงโรงงาน", "Note to the factory", "工場への備考")}</label>
            <textarea id="bd-note" className="ainput" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
          </div>
        </div>

        <div className="acard ou-summary">
          <h2 className="ah2">{L("ใบสั่งงาน (Order Sheet)", "Order sheet", "オーダーシート")}</h2>
          {sheet && sheet.sizes.length > 1 && (
            <div className="bd-tabs" role="tablist">
              {sheet.sizes.map(z => <button key={z} type="button" role="tab" aria-selected={sheet.size === z} onClick={() => setSheetSize(z)}>{sizeName(z)}</button>)}
            </div>
          )}
          <a className="bd-sheet" data-busy={drawing ? "" : undefined} href={sheet?.url} target="_blank" rel="noreferrer" aria-label={L("เปิดใบสั่งงานเต็มจอ", "Open the order sheet full size", "オーダーシートを拡大表示")}>
            {sheet ? <img src={sheet.url} alt={L("ตัวอย่างใบสั่งงาน", "Order sheet preview", "オーダーシートのプレビュー")} /> : <span className="dim">{L("กำลังวาด…", "Drawing…", "作成中…")}</span>}
          </a>
          {sheetErr && <p className="ou-warn">⚠ {sheetErr}</p>}
          <p className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>{L("ภาพนี้วาดจากไฟล์งานจริงที่จะส่งเข้าผลิต · คลิกเพื่อดูเต็มจอ", "Drawn from the very print files that go to production · click to enlarge", "実際の入稿データから描いています · クリックで拡大")}</p>

          <hr className="ou-hr" />
          {!bd ? (
            <p className="asub">{L("ใส่รายชื่อเพื่อดูราคา", "Add the list to see the price", "リストを入力すると金額が表示されます")}{prices[product] !== undefined ? ` · ${baht(prices[product])}${L("/ตัว", " / piece", "／枚")}` : ""}</p>
          ) : (
            <>
              <Row k={L("ราคาต่อตัว", "Price per piece", "単価")} v={<b>{baht(bd.unitPrice)}</b>} />
              <Row k={L(`× ${bd.totalQty} ตัว`, `× ${bd.totalQty} pieces`, `× ${bd.totalQty}枚`)} v={baht(bd.subtotal)} />
              <Row k={L("ค่าจัดส่ง", "Shipping", "送料")} v={bd.shippingFee === 0 ? L("ฟรี", "Free", "無料") : baht(bd.shippingFee)} />
              <hr className="ou-hr" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b>{L("ยอดรวม", "Total", "合計")}</b>
                <b style={{ fontSize: 24, color: "var(--brand)" }}>{baht(bd.total)}</b>
              </div>
              <p className="dim" style={{ marginTop: 8 }}>
                {bd.depositPct >= 100 ? L("ชำระเต็มจำนวนก่อนเริ่มผลิต", "Paid in full before production starts", "制作開始前に全額お支払いいただきます")
                  : L(`มัดจำ ${bd.depositPct}% = ${baht(bd.depositAmount)}`, `Deposit ${bd.depositPct}% = ${baht(bd.depositAmount)}`, `前金 ${bd.depositPct}% = ${baht(bd.depositAmount)}`)}
              </p>
              {lang !== "th" && <p className="dim" style={{ marginTop: 4 }}>{L("", "Prices in Thai baht (THB)", "価格はタイバーツ（THB）表示です")}</p>}
            </>
          )}
          {err && <p className="ou-warn" role="alert">⚠ {err}</p>}
          <button className="abtn solid block" style={{ marginTop: 16 }} disabled={busy || !bd || !!roster.errors.length || (!toAgent && !addrId)} onClick={submit}>
            {busy ? L("กำลังสร้างออเดอร์และไฟล์งาน…", "Placing the order and making the files…", "注文と入稿データを作成中…") : L("สั่งผลิต", "Place the order", "注文する")}
          </button>
          <p className="dim" style={{ marginTop: 10 }}>
            {L("ออเดอร์จะรอชำระเงิน ชำระแล้วไฟล์งานส่งเข้าผลิตทันที", "The order then waits for payment; once paid, its files go straight to production.", "ご注文はお支払い待ちとなり、お支払い後すぐに入稿データが制作に回ります。")}
          </p>
        </div>
      </div>
    </>,
  );
}

function SideCard({ L, title, side, onChange }: { L: ReturnType<typeof tri>; title: string; side: Side; onChange: (s: Side) => void }) {
  const set = (p: Partial<Side>) => onChange({ ...side, ...p });
  const setRib = (z: keyof Side["rib"], c: string) => onChange({ ...side, rib: { ...side.rib, [z]: c } });
  return (
    <div className="acard">
      <h2 className="ah2">{title}</h2>
      <div className="bd-pickers">
        <SwatchPicker label={L("สีพื้น", "Body colour", "地色")} value={side.body} onChange={c => set({ body: c })} />
        <SwatchPicker label={L("สีชื่อ-เบอร์", "Name and number colour", "名前・番号の色")} value={side.ink} onChange={c => set({ ink: c })} />
      </div>
      <span className="flabel">{L("ลาย", "Pattern", "柄")}</span>
      <div className="bd-seg" role="radiogroup">
        {(["plain", "stripes", "hoops"] as Pattern[]).map(p => (
          <button key={p} type="button" role="radio" aria-checked={side.pattern === p} onClick={() => set({ pattern: p })}>
            {p === "plain" ? L("เรียบ", "Plain", "無地") : p === "stripes" ? L("ลายตั้ง", "Stripes", "縦縞") : L("ลายขวาง", "Hoops", "横縞")}
          </button>
        ))}
      </div>
      {side.pattern !== "plain" && <SwatchPicker label={L("สีลาย", "Pattern colour", "柄の色")} value={side.patternColor} onChange={c => set({ patternColor: c })} />}
      <label className="bd-toggle"><input type="checkbox" checked={side.outline} onChange={e => set({ outline: e.target.checked })} /> {L("ขอบรอบชื่อ-เบอร์", "Keyline round names and numbers", "名前・番号のフチ取り")}</label>
      {side.outline && <SwatchPicker label={L("สีขอบ", "Keyline colour", "フチの色")} value={side.inkOutline} onChange={c => set({ inkOutline: c })} />}
      <label className="bd-toggle"><input type="checkbox" checked={side.ribs} onChange={e => set({ ribs: e.target.checked })} /> {L("แถบกุ้น คอ · วงแขน · ชายล่าง", "Rib bands: neck · armholes · hem", "リブ：衿・袖ぐり・裾")}</label>
      {side.ribs && (
        <div className="bd-pickers three">
          <SwatchPicker label={L("คอ", "Neck", "衿")} value={side.rib.neck} onChange={c => setRib("neck", c)} />
          <SwatchPicker label={L("วงแขน", "Armholes", "袖ぐり")} value={side.rib.arm} onChange={c => setRib("arm", c)} />
          <SwatchPicker label={L("ชายล่าง", "Hem", "裾")} value={side.rib.hem} onChange={c => setRib("hem", c)} />
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5, padding: "3px 0" }}>
      <span className="dim" style={{ fontSize: 13 }}>{k}</span><span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}

export default function OrderBibPage() {
  const [lang, setLang] = useLang();
  return (
    <Suspense fallback={<AppShell narrow><div className="acard"><p className="asub">…</p></div></AppShell>}>
      <BibDesigner lang={lang} setLang={setLang} />
    </Suspense>
  );
}
