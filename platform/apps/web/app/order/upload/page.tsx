"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api";
import { peekZip, type ZipPeek } from "../../../lib/zip-peek";
import { uploadZip, previewDataUrl, ZIP_MAX_BYTES, mb, type UploadedZip } from "../../../lib/order-upload";

/**
 * /order/upload — ordering bibs with the customer's own print files:
 * pick N-bib or R-bib, drop the .zip (Illustrator artwork, the job picture, the
 * name list), the sizes, the address → the zip uploads, the order is created
 * "awaiting payment", and the order page takes the payment as for any order.
 * The factory's team checks the file before production.
 */

const SIZES = ["S", "M", "L", "XL"] as const;
const PRODUCTS = [
  { id: "bib_n", name: "N-bib", sub: "บิบด้านเดียว" },
  { id: "bib_r", name: "R-bib", sub: "บิบ 2 ด้าน (กลับด้านได้)" },
] as const;
type ProductId = (typeof PRODUCTS)[number]["id"];

const baht = (n: number) => "฿" + (n ?? 0).toLocaleString("th-TH");

interface Breakdown { totalQty: number; unitPrice: number; subtotal: number; shippingFee: number; total: number; depositAmount: number; depositPct: number; freeShippingOver: number }
interface Address { id: string; recipient: string; phone: string; line1: string; line2?: string | null; district?: string | null; province?: string | null; postalCode: string; isDefault: boolean }

function UploadOrder() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [product, setProduct] = useState<ProductId>("bib_r");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [file, setFile] = useState<File | null>(null);
  const [peek, setPeek] = useState<ZipPeek | null>(null);
  const [peekErr, setPeekErr] = useState("");
  const [pic, setPic] = useState("");
  const [drag, setDrag] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({ S: 0, M: 0, L: 0, XL: 0 });
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
    setErr(""); setPeekErr(""); setPeek(null); setPic("");
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) { setFile(null); setPeekErr("เลือกไฟล์ .zip เท่านั้น"); return; }
    if (f.size > ZIP_MAX_BYTES) { setFile(null); setPeekErr(`ไฟล์ใหญ่ ${mb(f.size)} — รับได้ไม่เกิน 500 MB`); return; }
    // the server takes only a real zip ("PK\x03\x04"): say so now, not after a long upload
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
      setFile(null); setPeekErr(`${f.name} ไม่ใช่ไฟล์ .zip (หรือเป็น zip ว่าง) — บีบอัดโฟลเดอร์งานเป็น .zip แล้วลองใหม่`); return;
    }
    setFile(f);
    try {
      const p = await peekZip(f);
      setPeek(p);
      if (p.preview) setPic(URL.createObjectURL(p.preview));
    } catch (e: any) {
      setPeekErr(`${e.message || "อ่านรายการไฟล์ใน zip ไม่ได้"} — ยังส่งได้ ทีมงานจะเปิดตรวจให้`);
    }
  }

  function setSize(z: string, v: string) {
    const n = Math.max(0, Math.min(5000, Math.trunc(Number(v) || 0)));
    setQty(q => ({ ...q, [z]: n }));
  }

  async function submit() {
    setErr("");
    if (!file) { setErr("กรุณาเลือกไฟล์ .zip"); return; }
    if (blocked) { setErr("ไม่พบไฟล์งาน (.ai) ใน zip นี้"); return; }
    if (totalQty === 0) { setErr("กรุณาระบุจำนวนอย่างน้อย 1 ไซส์"); return; }
    if (!addrId) { setErr("กรุณาเลือกที่อยู่จัดส่ง"); return; }
    if (!token) return;
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
    } catch (e: any) {
      setErr(e.message);
      setBusy("");
      abort.current = null;
    }
  }

  if (loading) return <AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>;
  if (!user)
    return (
      <AppShell narrow>
        <div className="acard">
          <div className="eyebrow">สั่งผลิตด้วยไฟล์</div>
          <h1 className="atitle">ต้องเข้าสู่ระบบก่อนส่งไฟล์</h1>
          <p className="asub">เพื่อเก็บไฟล์งาน ออเดอร์ และที่อยู่จัดส่งไว้ในบัญชีของคุณ</p>
          <Link className="abtn solid" href={`/login?next=${encodeURIComponent("/order/upload")}`}>เข้าสู่ระบบ</Link>
        </div>
      </AppShell>
    );

  const unit = prices[product];
  return (
    <AppShell wide>
      <Link href="/account" className="asub" style={{ display: "inline-block", marginBottom: 12 }}>← กลับไปบัญชีของฉัน</Link>

      <div className="ou-grid">
        <div>
          <div className="acard">
            <div className="eyebrow">สั่งผลิตด้วยไฟล์</div>
            <h1 className="atitle" style={{ marginBottom: 4 }}>ส่งไฟล์งาน .zip</h1>
            <p className="asub" style={{ margin: 0 }}>
              สำหรับลูกค้าที่ออกแบบเองใน Illustrator: รวมไฟล์ .ai, ภาพตัวอย่าง (.jpg) และรายชื่อ (Excel) ถ้ามี ไว้ใน zip เดียว
              ทีมงานจะตรวจไฟล์ก่อนเข้าผลิต · หรือ <Link className="dlink" href="/shop">ออกแบบบนเว็บ</Link>
            </p>
          </div>

          <div className="acard">
            <h2 className="ah2">สินค้า</h2>
            <div className="ou-products" role="radiogroup" aria-label="สินค้า">
              {PRODUCTS.map(p => (
                <label key={p.id} className="ou-product" data-on={product === p.id ? "" : undefined}>
                  <input type="radio" name="product" checked={product === p.id} onChange={() => setProduct(p.id)} />
                  <b>{p.name}</b>
                  <span className="dim">{p.sub}</span>
                  {prices[p.id] !== undefined && <span className="price">{baht(prices[p.id])}/ตัว</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">ไฟล์งาน</h2>
            <div
              className="ou-drop" data-drag={drag ? "" : undefined} data-has={file ? "" : undefined}
              role="button" tabIndex={0} aria-label="เลือกไฟล์ .zip"
              onClick={() => !busy && input.current?.click()}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); if (!busy) choose(e.dataTransfer.files?.[0]); }}
            >
              {file ? (
                <>
                  <b className="name">{file.name}</b>
                  <span className="dim">{mb(file.size)} · คลิกหรือวางไฟล์ใหม่เพื่อเปลี่ยน</span>
                </>
              ) : (
                <>
                  <b>ลากไฟล์ .zip มาวางที่นี่</b>
                  <span className="dim">หรือคลิกเพื่อเลือกไฟล์ · ไม่เกิน 500 MB</span>
                </>
              )}
            </div>
            <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />

            {peekErr && <p className="ou-warn">⚠ {peekErr}</p>}
            {peek && (
              <div className="ou-peek">
                {pic ? <img src={pic} alt={`ภาพตัวอย่างจาก zip: ${peek.previewName}`} /> : <div className="nopic dim">ไม่มีภาพตัวอย่าง (.jpg) ใน zip</div>}
                <div>
                  <div className="ou-chips">
                    {peek.counts.ai > 0 && <span className="chip on">.ai {peek.counts.ai} ไฟล์</span>}
                    {peek.counts.pdf + peek.counts.eps + peek.counts.psd > 0 && <span className="chip on">pdf/eps/psd {peek.counts.pdf + peek.counts.eps + peek.counts.psd}</span>}
                    {peek.counts.image > 0 && <span className="chip">รูป {peek.counts.image}</span>}
                    {peek.counts.sheet > 0 && <span className="chip">รายชื่อ Excel {peek.counts.sheet}</span>}
                    {peek.counts.other > 0 && <span className="chip">อื่นๆ {peek.counts.other}</span>}
                  </div>
                  {blocked
                    ? <p className="ou-warn">⚠ ไม่พบไฟล์งาน (.ai) ใน zip นี้ — ตรวจว่าเลือกไฟล์ถูกงาน</p>
                    : <p className="dim" style={{ margin: "8px 0 0" }}>✓ พบไฟล์งาน · ทีมงานจะเปิดตรวจใน Illustrator ก่อนเข้าผลิต</p>}
                  <details className="ou-list">
                    <summary>ไฟล์ทั้งหมด {peek.entries.length} ไฟล์</summary>
                    <ul>{peek.entries.slice(0, 200).map((e, i) => <li key={i}><span>{e.name}</span><span className="dim">{mb(e.size)}</span></li>)}</ul>
                  </details>
                </div>
              </div>
            )}
          </div>

          <div className="acard">
            <h2 className="ah2">จำนวนแต่ละไซส์</h2>
            <p className="asub">รวม {totalQty} ตัว · ถ้ามีรายชื่อใน Excel ให้กรอกจำนวนตามไซส์ในรายชื่อ</p>
            <div className="ou-sizes">
              {SIZES.map(z => (
                <div key={z}>
                  <label className="flabel" style={{ margin: "0 0 6px" }} htmlFor={`size-${z}`}>ไซส์ {z}</label>
                  <input id={`size-${z}`} className="ainput" type="number" min={0} inputMode="numeric" value={qty[z]} onChange={e => setSize(z, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="acard">
            <h2 className="ah2">ที่อยู่จัดส่ง</h2>
            {addresses.length === 0 ? (
              <p className="asub">ยังไม่มีที่อยู่ — <Link className="dlink" href="/account">เพิ่มที่อยู่ในบัญชีของฉัน</Link> แล้วกลับมาหน้านี้</p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {addresses.map(a => (
                  <label key={a.id} className="addr" style={{ display: "flex", gap: 10, cursor: "pointer", borderColor: addrId === a.id ? "var(--brand)" : undefined }}>
                    <input type="radio" name="addr" checked={addrId === a.id} onChange={() => setAddrId(a.id)} style={{ marginTop: 3 }} />
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                      <b>{a.recipient}</b> · {a.phone}{a.isDefault && <span className="tag blue"> ค่าเริ่มต้น</span>}
                      <div className="dim">{a.line1} {a.line2} {a.district} {a.province} {a.postalCode}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <label className="flabel" htmlFor="ou-note">หมายเหตุถึงโรงงาน</label>
            <textarea id="ou-note" className="ainput" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น เลขงานเดิม (ถ้าเป็นงานซ้ำ) หรือวันที่ต้องการรับ" maxLength={1000} />
          </div>
        </div>

        <div className="acard ou-summary">
          <h2 className="ah2">สรุปคำสั่งซื้อ</h2>
          <Row k="สินค้า" v={PRODUCTS.find(p => p.id === product)!.name} />
          <Row k="ไฟล์" v={file ? <span className="ou-fname" title={file.name}>{file.name}</span> : <span className="dim">ยังไม่ได้เลือก</span>} />
          {!bd ? (
            <p className="asub" style={{ marginTop: 10 }}>ใส่จำนวนเพื่อดูราคา{unit !== undefined ? ` · ${baht(unit)}/ตัว` : ""}</p>
          ) : (
            <>
              <hr className="ou-hr" />
              <Row k="ราคาต่อตัว" v={<b>{baht(bd.unitPrice)}</b>} />
              <Row k={`× ${bd.totalQty} ตัว`} v={baht(bd.subtotal)} />
              <Row k="ค่าจัดส่ง" v={bd.shippingFee === 0 ? <span style={{ color: "var(--okc, #16a34a)" }}>ฟรี</span> : baht(bd.shippingFee)} />
              {bd.shippingFee > 0 && <p className="dim">สั่งครบ {baht(bd.freeShippingOver)} ส่งฟรี</p>}
              <hr className="ou-hr" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b>ยอดรวม</b>
                <b style={{ fontSize: 24, color: "var(--brand)" }}>{baht(bd.total)}</b>
              </div>
              <p className="dim" style={{ marginTop: 8 }}>
                {bd.depositPct >= 100 ? "ชำระเต็มจำนวนก่อนเริ่มผลิต" : `มัดจำ ${bd.depositPct}% = ${baht(bd.depositAmount)}`}
              </p>
            </>
          )}

          {busy === "upload" && file && (
            <div className="ou-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((sent / file.size) * 100)} aria-label="กำลังอัปโหลด">
              <div className="bar"><span style={{ width: `${Math.min(100, (sent / file.size) * 100)}%` }} /></div>
              <div className="dim">กำลังอัปโหลด {mb(sent)} / {mb(file.size)} ({Math.min(100, Math.round((sent / file.size) * 100))}%)</div>
              <button type="button" className="minibtn" onClick={() => abort.current?.()}>ยกเลิก</button>
            </div>
          )}
          {err && <p className="ou-warn" role="alert">⚠ {err}</p>}
          <button className="abtn solid block" style={{ marginTop: 16 }} disabled={!!busy || !file || blocked || !bd || !addrId} onClick={submit}>
            {busy === "upload" ? "กำลังอัปโหลดไฟล์…" : busy === "order" ? "กำลังสร้างออเดอร์…" : "อัปโหลดไฟล์และสั่งผลิต"}
          </button>
          <p className="dim" style={{ marginTop: 10 }}>ออเดอร์จะอยู่ในสถานะ "รอชำระเงิน" ชำระแล้วทีมงานตรวจไฟล์ก่อนเข้าผลิต ถ้าไฟล์มีปัญหาทีมงานจะติดต่อกลับ</p>
        </div>
      </div>
    </AppShell>
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
  return (
    <Suspense fallback={<AppShell narrow><div className="acard"><p className="asub">กำลังโหลด…</p></div></AppShell>}>
      <UploadOrder />
    </Suspense>
  );
}
