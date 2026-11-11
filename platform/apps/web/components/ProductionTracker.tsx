"use client";

import Link from "next/link";
import { STEPS, SHIP_STEP, orderStep } from "../lib/production-steps";
import { tri, locale, type Lang } from "../lib/i18n";

/** what the factory's ERP said about this job (see the API's erp/production-status.ts) */
export interface ErpTrack {
  dueDate?: string | null;
  updatedAt?: string | null;
  syncedAt?: string | null;
  steps?: { no: number; startedOn?: string | null; finishedOn?: string | null; label?: string | null }[];
}

/**
 * Where the customer's job is on the production line: the ten steps, the one
 * it's on now, and a link to that station in the 3D walk-through (/tracking).
 * In Thai, English or Japanese.
 */
export default function ProductionTracker({ orderNo, status, productionStep, history, erp, lang = "th" }: {
  orderNo?: string;
  status: string;
  productionStep?: number | null;
  history?: { step?: number | null; createdAt: string }[];
  erp?: ErpTrack | null;
  lang?: Lang;
}) {
  if (status === "cancelled" || status === "refunded") return null;
  const L = tri(lang);
  const loc = locale(lang);
  const dt = (s: string) => new Date(s).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" });
  /** the ERP's plain dates ("2026-10-21") as "21 ต.ค." — read as local dates, not UTC midnight */
  const day = (s: string, year = false) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return s;
    return new Date(y, m - 1, d).toLocaleDateString(loc, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
  };

  const step = orderStep(status, productionStep);
  const unpaid = status === "pending";
  const cur = step > 0 ? STEPS[step - 1] : null;
  const since = history?.filter(h => h.step === step).at(-1)?.createdAt;
  const erpStep = (n: number) => erp?.steps?.find(s => s.no === n);
  const due = erp?.dueDate && step < SHIP_STEP && !unpaid ? day(erp.dueDate, true) : null;

  const head = unpaid
    ? L("เริ่มผลิตหลังชำระเงิน", "Production starts once paid", "お支払い後に制作を開始します")
    : step === 0
      ? L("รอเข้าไลน์ผลิต", "Waiting to start", "生産開始待ち")
      : step === SHIP_STEP
        ? L("จัดส่งแล้ว", "Shipped", "発送済み")
        : L(`ขั้นที่ ${step} จาก ${SHIP_STEP} · ${cur!.th}`, `Step ${step} of ${SHIP_STEP} · ${cur!.en}`, `工程 ${step} / ${SHIP_STEP} · ${cur!.ja}`);
  const sub = unpaid
    ? L("ชำระเงินแล้วทีมงานจะตรวจแบบและเริ่มผลิตตามขั้นตอนด้านล่าง", "Once paid, our team checks the design and makes it through the steps below", "お支払い後、スタッフがデザインを確認し、下記の工程で制作します")
    : step === 0
      ? L("ได้รับเงินแล้ว ทีมงานกำลังตรวจแบบก่อนเข้าไลน์ผลิต", "Payment received — our team is checking the design before production", "お支払いを確認しました。制作前にスタッフがデザインを確認しています")
      : L(cur!.p, cur!.pEn, cur!.pJa);
  const peek = step > 0 ? step : 1;

  return (
    <div className="acard ptrack-card">
      <div className="ptrack-head">
        <div>
          <div className="eyebrow">{L("ขั้นตอนผลิต", "Production", "制作工程")}</div>
          <h2 className="ah2" style={{ marginTop: 4 }}>{head}</h2>
          <p className="asub" style={{ margin: 0 }}>{sub}</p>
          {(since || due) && step > 0 && (
            <div className="dim" style={{ marginTop: 4 }}>
              {since && <>{L("อัปเดตเมื่อ", "Updated", "更新")} {dt(since)}</>}
              {since && due && " · "}
              {due && <>{L("กำหนดผลิตเสร็จ", "Due", "完成予定")} {due}</>}
            </div>
          )}
        </div>
        <Link className="minibtn" href={orderNo && step > 0 ? `/tracking?no=${encodeURIComponent(orderNo)}` : `/tracking?step=${peek}`} target="_blank">
          {step > 0 ? L("ดูขั้นนี้ในไลน์ผลิต 3D", "See this step on the 3D line", "3D生産ラインでこの工程を見る") : L("ดูขั้นตอนผลิต 3D", "See the 3D production line", "3D生産ラインを見る")} →
        </Link>
      </div>
      <ol className="ptrack" aria-label={`${L("ขั้นตอนผลิต", "Production", "制作工程")}: ${head}`}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < step || step === SHIP_STEP ? "done" : n === step ? "now" : "todo";
          // the factory's dates: when it finished, or when the step on now started
          const e = erpStep(n);
          const when = state === "done" ? e?.finishedOn ?? e?.startedOn : state === "now" ? e?.finishedOn ?? e?.startedOn : null;
          const pre = state === "now" ? (e?.finishedOn ? L("เสร็จ ", "done ", "完了 ") : L("เริ่ม ", "since ", "開始 ")) : "";
          return (
            <li key={s.en} data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span className="dot" aria-hidden="true">{state === "done" ? "✓" : n}</span>
              <span className="lbl">{L(s.th, s.en, s.ja)}</span>
              {when && <span className="when">{pre}{day(when)}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
