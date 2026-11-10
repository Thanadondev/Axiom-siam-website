"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch, type ApiError } from "../../../lib/api";
import { tri, locale, useLang, type Lang } from "../../../lib/i18n";
import { peekZip, type ZipPeek } from "../../../lib/zip-peek";
import { sizesFromZip, type SizeCount } from "../../../lib/xlsx-sizes";
import { uploadZip, previewDataUrl, ZIP_MAX_BYTES, mb, UploadError, type UploadedZip } from "../../../lib/order-upload";

/**
 * /order/upload — ordering bibs with the customer's own print files:
 * pick N-bib or R-bib, drop the .zip (Illustrator artwork, the job picture, the
 * name list), the sizes, the address → the zip uploads, the order is created
 * "awaiting payment", and the order page takes the payment as for any order.
 * The factory's team checks the file before production.
 *
 * In Thai, English and Japanese (many teams ordering by file are in Japan).
 * The API answers in Thai, so its errors are shown as-is only in Thai; in the
 * other languages the page says what went wrong in its own words.
 */

const SIZES = ["S", "M", "L", "XL"] as const;
const PRODUCTS = [
  { id: "bib_n", name: "N-bib", sub: ["บิบด้านเดียว", "Single-sided bib", "片面ビブス"] },
  { id: "bib_r", name: "R-bib", sub: ["บิบ 2 ด้าน (กลับด้านได้)", "Reversible bib (2 sides)", "リバーシブルビブス（両面）"] },
] as const;
type ProductId = (typeof PRODUCTS)[number]["id"];

interface Breakdown { totalQty: number; unitPrice: number; subtotal: number; shippingFee: number; total: number; depositAmount: number; depositPct: number; freeShippingOver: number }
interface Address { id: string; recipient: string; phone: string; line1: string; line2?: string | null; district?: string | null; province?: string | null; postalCode: string; isDefault: boolean }

function UploadOrder({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const L = tri(lang);
  const baht = (n: number) => "฿" + (n ?? 0).toLocaleString(locale(lang));
  const [product, setProduct] = useState<ProductId>("bib_r");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [file, setFile] = useState<File | null>(null);
  const [peek, setPeek] = useState<ZipPeek | null>(null);
  const [peekErr, setPeekErr] = useState("");
  const [pic, setPic] = useState("");
  const [drag, setDrag] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({ S: 0, M: 0, L: 0, XL: 0 });
  /** the counts read from the order list (.xlsx) in the zip, offered — never filled in unasked */
  const [fromList, setFromList] = useState<SizeCount | null>(null);
  const [listState, setListState] = useState<"" | "reading" | "done" | "unreadable">("");
  const chosen = useRef<File | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrId, setAddrId] = useState("");
  const [note, setNote] = useState("");
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "order">("");
  const [sent, setSent] = useState(0);
  const uploaded = useRef<{ file: File; zip: UploadedZip } | null>(null); // a retry after a failed order doesn't upload again
  const abort = useRef<(() => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const totalQty = useMemo(() => SIZES.reduce((s, z) => s + (qty[z] || 0), 0), [qty]);
  const artwork = peek ? peek.counts.ai + peek.counts.pdf + peek.counts.eps + peek.counts.psd : 0;
  // a zip we could read with no artwork in it is the wrong zip; one we couldn't read, the team checks
  const blocked = !!peek && artwork === 0;

  useEffect(() => {
    apiFetch<{ flat?: Record<string, number> }>("/orders/price-table").then(t => setPrices(t.flat ?? {})).catch(() => {});
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
      apiFetch<Breakdown>(`/orders/quote?totalQty=${totalQty}&fabric=mesh&trim=none&garment=${product}`).then(setBd).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [totalQty, product]);

  useEffect(() => () => { if (pic) URL.revokeObjectURL(pic); }, [pic]);

  async function choose(f: File | undefined | null) {
    setErr(""); setPeekErr(""); setPeek(null); setPic(""); setFromList(null); setListState("");
    chosen.current = f ?? null;
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) { setFile(null); setPeekErr(L("เลือกไฟล์ .zip เท่านั้น", "Please choose a .zip file", ".zipファイルを選択してください")); return; }
    if (f.size > ZIP_MAX_BYTES) {
      setFile(null);
      setPeekErr(L(`ไฟล์ใหญ่ ${mb(f.size)} — รับได้ไม่เกิน 500 MB`, `This file is ${mb(f.size)} — the limit is 500 MB`, `ファイルサイズが${mb(f.size)}あります。上限は500MBです`));
      return;
    }
    // the server takes only a real zip ("PK\x03\x04"): say so now, not after a long upload
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
      setFile(null);
      setPeekErr(L(
        `${f.name} ไม่ใช่ไฟล์ .zip (หรือเป็น zip ว่าง) — บีบอัดโฟลเดอร์งานเป็น .zip แล้วลองใหม่`,
        `${f.name} isn't a .zip (or it's empty) — compress the job folder into a .zip and try again`,
        `${f.name} は.zipファイルではないか、中身が空です。データのフォルダを.zipに圧縮して、もう一度お試しください`,
      ));
      return;
    }
    setFile(f);
    try {
      const p = await peekZip(f);
      setPeek(p);
      if (p.preview) setPic(URL.createObjectURL(p.preview));
      if (p.counts.sheet > 0) {
        setListState("reading");
        sizesFromZip(f)
          .then(r => { if (chosen.current !== f) return; setFromList(r); setListState(r ? "done" : "unreadable"); })
          .catch(() => { if (chosen.current === f) setListState("unreadable"); });
      }
    } catch {
      setPeekErr(L(
        "อ่านรายการไฟล์ใน zip ไม่ได้ — ยังส่งได้ ทีมงานจะเปิดตรวจให้",
        "Couldn't read the list of files in this zip — you can still send it, and our team will open it",
        "zip内のファイル一覧を読み取れませんでした。このまま送信でき、スタッフが内容を確認します",
      ));
    }
  }

  function setSize(z: string, v: string) {
    const n = Math.max(0, Math.min(5000, Math.trunc(Number(v) || 0)));
    setQty(q => ({ ...q, [z]: n }));
  }

  /** a failure in the customer's language */
  function failure(e: unknown, step: "upload" | "order"): string {
    if (e instanceof UploadError) {
      if (e.code === "aborted") return L("ยกเลิกการอัปโหลดแล้ว", "Upload cancelled", "アップロードをキャンセルしました");
      if (e.code === "network") return L("อัปโหลดไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่", "The upload didn't go through — check your connection and try again", "アップロードに失敗しました。通信状況をご確認のうえ、もう一度お試しください");
      if (lang === "th") return e.message;
      if (e.code === "too_large") return L("", "The file is over 500 MB", "ファイルが500MBを超えています");
      if (e.code === "rejected") return L("", "The file was refused: it isn't a zip, or it arrived incomplete — please try again", "ファイルを受け付けられませんでした（zipではない、または途中で途切れた可能性があります）。もう一度お試しください");
      return L("", `The upload failed (${e.status}) — please try again`, `アップロードに失敗しました（${e.status}）。もう一度お試しください`);
    }
    const msg = (e as Error)?.message ?? "";
    if (lang === "th") return msg;
    if (step === "order" && (e as ApiError)?.status === 400 && uploaded.current) {
      return L("", "Couldn't place the order with this file — please choose the file again and retry", "このファイルで注文を作成できませんでした。ファイルを選び直して、もう一度お試しください");
    }
    return L("", "Couldn't place the order — please try again, or contact us", "注文を作成できませんでした。もう一度お試しいただくか、お問い合わせください");
  }

  async function submit() {
    setErr("");
    if (!file) { setErr(L("กรุณาเลือกไฟล์ .zip", "Please choose your .zip file", ".zipファイルを選択してください")); return; }
    if (blocked) { setErr(L("ไม่พบไฟล์งาน (.ai) ใน zip นี้", "There's no artwork (.ai) in this zip", "このzipにはデザインデータ（.ai）が含まれていません")); return; }
    if (totalQty === 0) { setErr(L("กรุณาระบุจำนวนอย่างน้อย 1 ไซส์", "Please enter a quantity for at least one size", "少なくとも1サイズの枚数を入力してください")); return; }
    if (!addrId) { setErr(L("กรุณาเลือกที่อยู่จัดส่ง", "Please choose a shipping address", "お届け先を選択してください")); return; }
    if (!token) return;
    let step: "upload" | "order" = "upload";
    try {
      let zip = uploaded.current?.file === file ? uploaded.current.zip : null;
      if (!zip) {
        setBusy("upload"); setSent(0);
        const up = uploadZip(file, token, s => setSent(s));
        abort.current = up.abort;
        zip = await up.done;
        abort.current = null;
        uploaded.current = { file, zip };
        if (peek?.preview) {
          const image = await previewDataUrl(peek.preview);
          if (image) await apiFetch(`/order-files/${zip.id}/preview`, { method: "POST", token, body: JSON.stringify({ image }) }).catch(() => {});
        }
      }
      step = "order";
      setBusy("order");
      const res = await apiFetch<{ id: string }>("/orders", {
        method: "POST", token,
        body: JSON.stringify({
          fileId: zip.id, product,
          lines: SIZES.filter(z => qty[z] > 0).map(z => ({ size: z, qty: qty[z] })),
          shippingAddressId: addrId,
          note,
        }),
      });
      router.push(`/orders/${res.id}`);
    } catch (e) {
      // a file the server won't attach (used already, or gone): the next try uploads it again
      if (step === "order" && (e as ApiError)?.status === 400) uploaded.current = null;
      setErr(failure(e, step));
      setBusy("");
      abort.current = null;
    }
  }

  const shell = (children: React.ReactNode, size: "narrow" | "wide") => (
    <AppShell narrow={size === "narrow"} wide={size === "wide"} lang={lang} onLang={setLang}>{children}</AppShell>
  );

  if (loading) return shell(<div className="acard"><p className="asub">{L("กำลังโหลด…", "Loading…", "読み込み中…")}</p></div>, "narrow");
  if (!user)
    return shell(
      <div className="acard">
        <div className="eyebrow">{L("สั่งผลิตด้วยไฟล์", "Order with your files", "データ入稿で注文")}</div>
        <h1 className="atitle">{L("ต้องเข้าสู่ระบบก่อนส่งไฟล์", "Please sign in to send your files", "データの入稿にはログインが必要です")}</h1>
        <p className="asub">{L("เพื่อเก็บไฟล์งาน ออเดอร์ และที่อยู่จัดส่งไว้ในบัญชีของคุณ", "Your files, orders and shipping addresses are kept in your account", "入稿データ・ご注文・お届け先をアカウントに保存します")}</p>
        <Link className="abtn solid" href={`/login?next=${encodeURIComponent("/order/upload")}`}>{L("เข้าสู่ระบบ", "Sign in", "ログイン")}</Link>
      </div>,
      "narrow",
    );

  const unit = prices[product];
  const pct = file ? Math.min(100, Math.round((sent / file.size) * 100)) : 0;
  return shell(
    <>
      <Link href="/account" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>{L("← กลับไปบัญชีของฉัน", "← Back to my account", "← マイアカウントへ戻る")}</Link>

      <div className="ou-grid">
        <div>
          <div className="acard">
            <div className="eyebrow">{L("สั่งผลิตด้วยไฟล์", "Order with your files", "データ入稿で注文")}</div>
            <h1 className="atitle" style={{ marginBottom: 4 }}>{L("ส่งไฟล์งาน .zip", "Send your artwork (.zip)", "デザインデータ（.zip）を入稿")}</h1>
            <p className="asub" style={{ margin: 0 }}>
              {L(
                "สำหรับลูกค้าที่ออกแบบเองใน Illustrator: รวมไฟล์ .ai, ภาพตัวอย่าง (.jpg) และรายชื่อ (Excel) ถ้ามี ไว้ใน zip เดียว ทีมงานจะตรวจไฟล์ก่อนเข้าผลิต",
                "For teams who design in Illustrator: put the .ai files, a preview picture (.jpg) and the name list (Excel), if you have one, into a single zip. Our team checks the files before production.",
                "Illustratorでデザインされたお客様向けです。.aiデータ、プレビュー画像（.jpg）、名簿（Excel・あれば）を1つのzipにまとめてください。制作前にスタッフがデータを確認します。",
              )}
              {" · "}{L("หรือ ", "or ", "")}<Link className="dlink" href="/shop">{L("ออกแบบบนเว็บ", "design on the web", "Webでデザインする")}</Link>
            </p>
          </div>

          <div className="acard">
            <h2 className="ah2">{L("สินค้า", "Product", "商品")}</h2>
            <div className="ou-products" role="radiogroup" aria-label={L("สินค้า", "Product", "商品")}>
              {PRODUCTS.map(p => (
                <label key={p.id} className="ou-product" data-on={product === p.id ? "" : undefined}>
                  <input type="radio" name="product" checked={product === p.id} onChange={() => setProduct(p.id)} />
                  <b>{p.name}</b>
                  <span className="dim">{L(p.sub[0], p.sub[1], p.sub[2])}</span>
                  {prices[p.id] !== undefined && <span className="price">{baht(prices[p.id])}{L("/ตัว", " / piece", "／枚")}</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">{L("ไฟล์งาน", "Artwork file", "入稿データ")}</h2>
            <div
              className="ou-drop" data-drag={drag ? "" : undefined} data-has={file ? "" : undefined}
              role="button" tabIndex={0} aria-label={L("เลือกไฟล์ .zip", "Choose a .zip file", ".zipファイルを選択")}
              onClick={() => !busy && input.current?.click()}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); if (!busy) choose(e.dataTransfer.files?.[0]); }}
            >
              {file ? (
                <>
                  <b className="name">{file.name}</b>
                  <span className="dim">{mb(file.size)} · {L("คลิกหรือวางไฟล์ใหม่เพื่อเปลี่ยน", "click or drop another file to change it", "クリックまたは別のファイルをドロップして変更")}</span>
                </>
              ) : (
                <>
                  <b>{L("ลากไฟล์ .zip มาวางที่นี่", "Drop your .zip here", ".zipファイルをここにドロップ")}</b>
                  <span className="dim">{L("หรือคลิกเพื่อเลือกไฟล์ · ไม่เกิน 500 MB", "or click to choose it · up to 500 MB", "またはクリックして選択 · 最大500MB")}</span>
                </>
              )}
            </div>
            <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />

            {peekErr && <p className="ou-warn">⚠ {peekErr}</p>}
            {peek && (
              <div className="ou-peek">
                {pic
                  ? <img src={pic} alt={`${L("ภาพตัวอย่างจาก zip", "Preview from the zip", "zip内のプレビュー画像")}: ${peek.previewName}`} />
                  : <div className="nopic dim">{L("ไม่มีภาพตัวอย่าง (.jpg) ใน zip", "No preview picture (.jpg) in the zip", "zip内にプレビュー画像（.jpg）がありません")}</div>}
                <div>
                  <div className="ou-chips">
                    {peek.counts.ai > 0 && <span className="chip on">{L(`.ai ${peek.counts.ai} ไฟล์`, `.ai × ${peek.counts.ai}`, `.ai ${peek.counts.ai}件`)}</span>}
                    {peek.counts.pdf + peek.counts.eps + peek.counts.psd > 0 && <span className="chip on">pdf/eps/psd {peek.counts.pdf + peek.counts.eps + peek.counts.psd}</span>}
                    {peek.counts.image > 0 && <span className="chip">{L("รูป", "Pictures", "画像")} {peek.counts.image}</span>}
                    {peek.counts.sheet > 0 && <span className="chip">{L("รายชื่อ Excel", "Name list (Excel)", "名簿（Excel）")} {peek.counts.sheet}</span>}
                    {peek.counts.other > 0 && <span className="chip">{L("อื่นๆ", "Other", "その他")} {peek.counts.other}</span>}
                  </div>
                  {blocked
                    ? <p className="ou-warn">⚠ {L("ไม่พบไฟล์งาน (.ai) ใน zip นี้ — ตรวจว่าเลือกไฟล์ถูกงาน", "There's no artwork (.ai) in this zip — check you picked the right job", "このzipにはデザインデータ（.ai）が含まれていません。正しいファイルかご確認ください")}</p>
                    : <p className="dim" style={{ margin: "8px 0 0" }}>✓ {L("พบไฟล์งาน · ทีมงานจะเปิดตรวจใน Illustrator ก่อนเข้าผลิต", "Artwork found · our team checks it in Illustrator before production", "デザインデータを確認しました · 制作前にスタッフがIllustratorでチェックします")}</p>}
                  <details className="ou-list">
                    <summary>{L(`ไฟล์ทั้งหมด ${peek.entries.length} ไฟล์`, `All files (${peek.entries.length})`, `全ファイル（${peek.entries.length}件）`)}</summary>
                    <ul>{peek.entries.slice(0, 200).map((e, i) => <li key={i}><span>{e.name}</span><span className="dim">{mb(e.size)}</span></li>)}</ul>
                  </details>
                </div>
              </div>
            )}
          </div>

          <div className="acard">
            <h2 className="ah2">{L("จำนวนแต่ละไซส์", "Quantity per size", "サイズ別の枚数")}</h2>
            <p className="asub">
              {L(`รวม ${totalQty} ตัว`, `${totalQty} in total`, `合計${totalQty}枚`)} · {L("ถ้ามีรายชื่อใน Excel ให้กรอกจำนวนตามไซส์ในรายชื่อ", "if your zip has a name list, enter the counts from it", "名簿がある場合は、名簿のサイズ別枚数を入力してください")}
            </p>
            {listState === "reading" && <p className="dim" style={{ margin: "10px 0 0" }}>{L("กำลังอ่านจำนวนจากรายชื่อใน Excel…", "Reading the counts from the Excel name list…", "Excelの名簿から枚数を読み取り中…")}</p>}
            {listState === "unreadable" && (
              <p className="dim" style={{ margin: "10px 0 0" }}>
                {L("มีรายชื่อ Excel ใน zip แต่อ่านจำนวนอัตโนมัติไม่ได้ — กรอกจำนวนตามรายชื่อเองได้เลย", "There's an Excel name list in the zip, but its counts couldn't be read automatically — please enter them from the list", "zip内にExcelの名簿がありますが、枚数を自動で読み取れませんでした。名簿を見て枚数を入力してください")}
              </p>
            )}
            {fromList && (() => {
              const same = SIZES.every(z => qty[z] === fromList.counts[z]);
              const unknown = Object.entries(fromList.unknown);
              return (
                <div className="ou-fromlist" data-applied={same ? "" : undefined}>
                  <div>
                    <b>{L("จากรายชื่อใน Excel", "From the Excel name list", "Excelの名簿より")}</b>
                    <span className="dim"> · {fromList.file}{fromList.sheet ? ` · ${fromList.sheet}` : ""}</span>
                  </div>
                  <div className="nums">
                    {SIZES.map(z => <span key={z}>{z} <b>{fromList.counts[z]}</b></span>)}
                    <span>= <b>{L(`${fromList.total} ตัว`, `${fromList.total} pieces`, `${fromList.total}枚`)}</b></span>
                  </div>
                  {unknown.length > 0 && (
                    <p className="ou-warn" style={{ margin: 0 }}>
                      ⚠ {L("ในรายชื่อมีไซส์ที่เราไม่ได้ผลิต", "The list has sizes we don't make", "名簿に当社で製作していないサイズがあります")}: {unknown.map(([t, n]) => `${t} × ${n}`).join(", ")}
                      {" — "}{L("ไม่ได้นับรวม ระบุในหมายเหตุหรือติดต่อทีมงาน", "not counted; add a note or contact us", "合計に含めていません。備考に記入するか、お問い合わせください")}
                    </p>
                  )}
                  {same
                    ? <span className="dim">✓ {L("ใช้จำนวนนี้แล้ว · แก้ไขด้านล่างได้", "Using these counts · you can still edit them below", "この枚数を入力済み · 下で修正できます")}</span>
                    : fromList.total > 0 && (
                      <button type="button" className="minibtn" onClick={() => setQty({ ...fromList.counts })}>
                        {L("ใช้จำนวนนี้", "Use these counts", "この枚数を使う")}
                      </button>
                    )}
                </div>
              );
            })()}
            <div className="ou-sizes">
              {SIZES.map(z => (
                <div key={z}>
                  <label className="flabel" style={{ margin: "0 0 6px" }} htmlFor={`size-${z}`}>{L("ไซส์", "Size", "サイズ")} {z}</label>
                  <input id={`size-${z}`} className="ainput" type="number" min={0} inputMode="numeric" value={qty[z]} onChange={e => setSize(z, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">{L("ที่อยู่จัดส่ง", "Shipping address", "お届け先")}</h2>
            {addresses.length === 0 ? (
              <p className="asub">
                {L("ยังไม่มีที่อยู่ — ", "No address yet — ", "お届け先が未登録です。")}
                <Link className="dlink" href="/account">{L("เพิ่มที่อยู่ในบัญชีของฉัน", "add one in My account", "マイアカウントで追加")}</Link>
                {L(" แล้วกลับมาหน้านี้", ", then come back to this page", "してから、このページに戻ってください")}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {addresses.map(a => (
                  <label key={a.id} className="addr" style={{ display: "flex", gap: 10, cursor: "pointer", borderColor: addrId === a.id ? "var(--brand)" : undefined }}>
                    <input type="radio" name="addr" checked={addrId === a.id} onChange={() => setAddrId(a.id)} style={{ marginTop: 3 }} />
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                      <b>{a.recipient}</b> · {a.phone}{a.isDefault && <span className="tag blue"> {L("ค่าเริ่มต้น", "Default", "既定")}</span>}
                      <div className="dim">{a.line1} {a.line2} {a.district} {a.province} {a.postalCode}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <label className="flabel" htmlFor="ou-note">{L("หมายเหตุถึงโรงงาน", "Note to the factory", "工場への備考")}</label>
            <textarea id="ou-note" className="ainput" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000}
              placeholder={L("เช่น เลขงานเดิม (ถ้าเป็นงานซ้ำ) หรือวันที่ต้องการรับ", "e.g. the earlier job number for a repeat order, or the date you need it by", "例：リピート注文の場合は前回の番号、ご希望の納期など")} />
          </div>
        </div>

        <div className="acard ou-summary">
          <h2 className="ah2">{L("สรุปคำสั่งซื้อ", "Order summary", "ご注文内容")}</h2>
          <Row k={L("สินค้า", "Product", "商品")} v={PRODUCTS.find(p => p.id === product)!.name} />
          <Row k={L("ไฟล์", "File", "ファイル")} v={file ? <span className="ou-fname" title={file.name}>{file.name}</span> : <span className="dim">{L("ยังไม่ได้เลือก", "Not chosen yet", "未選択")}</span>} />
          {!bd ? (
            <p className="asub" style={{ marginTop: 10 }}>
              {L("ใส่จำนวนเพื่อดูราคา", "Enter the quantities to see the price", "枚数を入力すると金額が表示されます")}
              {unit !== undefined ? ` · ${baht(unit)}${L("/ตัว", " / piece", "／枚")}` : ""}
            </p>
          ) : (
            <>
              <hr className="ou-hr" />
              <Row k={L("ราคาต่อตัว", "Price per piece", "単価")} v={<b>{baht(bd.unitPrice)}</b>} />
              <Row k={L(`× ${bd.totalQty} ตัว`, `× ${bd.totalQty} pieces`, `× ${bd.totalQty}枚`)} v={baht(bd.subtotal)} />
              <Row k={L("ค่าจัดส่ง", "Shipping", "送料")} v={bd.shippingFee === 0 ? <span style={{ color: "var(--okc, #16a34a)" }}>{L("ฟรี", "Free", "無料")}</span> : baht(bd.shippingFee)} />
              {bd.shippingFee > 0 && <p className="dim">{L(`สั่งครบ ${baht(bd.freeShippingOver)} ส่งฟรี`, `Free shipping from ${baht(bd.freeShippingOver)}`, `${baht(bd.freeShippingOver)}以上で送料無料`)}</p>}
              <hr className="ou-hr" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b>{L("ยอดรวม", "Total", "合計")}</b>
                <b style={{ fontSize: 24, color: "var(--brand)" }}>{baht(bd.total)}</b>
              </div>
              <p className="dim" style={{ marginTop: 8 }}>
                {bd.depositPct >= 100
                  ? L("ชำระเต็มจำนวนก่อนเริ่มผลิต", "Paid in full before production starts", "制作開始前に全額お支払いいただきます")
                  : L(`มัดจำ ${bd.depositPct}% = ${baht(bd.depositAmount)}`, `Deposit ${bd.depositPct}% = ${baht(bd.depositAmount)}`, `前金 ${bd.depositPct}% = ${baht(bd.depositAmount)}`)}
              </p>
              {lang !== "th" && <p className="dim" style={{ marginTop: 4 }}>{L("", "Prices in Thai baht (THB)", "価格はタイバーツ（THB）表示です")}</p>}
            </>
          )}

          {busy === "upload" && file && (
            <div className="ou-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={L("กำลังอัปโหลด", "Uploading", "アップロード中")}>
              <div className="bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="dim">{L("กำลังอัปโหลด", "Uploading", "アップロード中")} {mb(sent)} / {mb(file.size)} ({pct}%)</div>
              <button type="button" className="minibtn" onClick={() => abort.current?.()}>{L("ยกเลิก", "Cancel", "キャンセル")}</button>
            </div>
          )}
          {err && <p className="ou-warn" role="alert">⚠ {err}</p>}
          <button className="abtn solid block" style={{ marginTop: 16 }} disabled={!!busy || !file || blocked || !bd || !addrId} onClick={submit}>
            {busy === "upload" ? L("กำลังอัปโหลดไฟล์…", "Uploading…", "アップロード中…")
              : busy === "order" ? L("กำลังสร้างออเดอร์…", "Placing the order…", "注文を作成中…")
              : L("อัปโหลดไฟล์และสั่งผลิต", "Upload and place the order", "データをアップロードして注文する")}
          </button>
          <p className="dim" style={{ marginTop: 10 }}>
            {L(
              "ออเดอร์จะอยู่ในสถานะ \"รอชำระเงิน\" ชำระแล้วทีมงานตรวจไฟล์ก่อนเข้าผลิต ถ้าไฟล์มีปัญหาทีมงานจะติดต่อกลับ",
              "The order then waits for payment. Once paid, our team checks your files before production and gets in touch if anything needs fixing.",
              "ご注文は「お支払い待ち」となります。お支払い後、制作前にスタッフがデータを確認し、修正が必要な場合はご連絡いたします。",
            )}
          </p>
        </div>
      </div>
    </>,
    "wide",
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5, padding: "3px 0", color: "var(--ink)", minWidth: 0 }}>
      <span className="dim" style={{ fontSize: 13, flex: "none" }}>{k}</span><span style={{ minWidth: 0, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export default function OrderUploadPage() {
  const [lang, setLang] = useLang();
  return (
    <Suspense fallback={<AppShell narrow><div className="acard"><p className="asub">…</p></div></AppShell>}>
      <UploadOrder lang={lang} setLang={setLang} />
    </Suspense>
  );
}
