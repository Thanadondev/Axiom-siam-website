"use client";

import Link from "next/link";
import { STEPS, SHIP_STEP, orderStep } from "../lib/production-steps";

const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
/** the ERP's plain dates ("2026-10-21") as "21 ต.ค." — read as local dates, not UTC midnight */
const day = (s: string, year = false) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
};

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
 */
export default function ProductionTracker({ orderNo, status, productionStep, history, erp }: {
  orderNo?: string;
  status: string;
  productionStep?: number | null;
  history?: { step?: number | null; createdAt: string }[];
  erp?: ErpTrack | null;
}) {
  if (status === "cancelled" || status === "refunded") return null;
  const step = orderStep(status, productionStep);
  const unpaid = status === "pending";
  const cur = step > 0 ? STEPS[step - 1] : null;
  const since = history?.filter(h => h.step === step).at(-1)?.createdAt;
  const erpStep = (n: number) => erp?.steps?.find(s => s.no === n);
  const due = erp?.dueDate && step < SHIP_STEP && !unpaid ? day(erp.dueDate, true) : null;

  const head = unpaid
    ? "เริ่มผลิตหลังชำระเงิน"
    : step === 0
      ? "รอเข้าไลน์ผลิต"
      : step === SHIP_STEP
        ? "จัดส่งแล้ว"
        : `ขั้นที่ ${step} จาก ${SHIP_STEP} · ${cur!.th}`;
  const sub = unpaid
    ? "ชำระเงินแล้วทีมงานจะตรวจแบบและเริ่มผลิตตามขั้นตอนด้านล่าง"
    : step === 0
      ? "ได้รับเงินแล้ว ทีมงานกำลังตรวจแบบก่อนเข้าไลน์ผลิต"
      : cur!.p;
  const peek = step > 0 ? step : 1;

  return (
    <div className="acard ptrack-card">
      <div className="ptrack-head">
        <div>
          <div className="eyebrow">ขั้นตอนผลิต</div>
          <h2 className="ah2" style={{ marginTop: 4 }}>{head}</h2>
          <p className="asub" style={{ margin: 0 }}>{sub}</p>
          {(since || due) && step > 0 && (
            <div className="dim" style={{ marginTop: 4 }}>
              {since && <>อัปเดตเมื่อ {dt(since)}</>}
              {since && due && " · "}
              {due && <>กำหนดผลิตเสร็จ {due}</>}
            </div>
          )}
        </div>
        <Link className="minibtn" href={orderNo && step > 0 ? `/tracking?no=${encodeURIComponent(orderNo)}` : `/tracking?step=${peek}`} target="_blank">
          {step > 0 ? "ดูขั้นนี้ในไลน์ผลิต 3D" : "ดูขั้นตอนผลิต 3D"} →
        </Link>
      </div>
      <ol className="ptrack" aria-label={`ขั้นตอนผลิต: ${head}`}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < step || step === SHIP_STEP ? "done" : n === step ? "now" : "todo";
          // the factory's dates: when it finished, or when the step on now started
          const e = erpStep(n);
          const when = state === "done" ? e?.finishedOn ?? e?.startedOn : state === "now" ? e?.finishedOn ?? e?.startedOn : null;
          const pre = state === "now" ? (e?.finishedOn ? "เสร็จ " : "เริ่ม ") : "";
          return (
            <li key={s.en} data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span className="dot" aria-hidden="true">{state === "done" ? "✓" : n}</span>
              <span className="lbl">{s.th}</span>
              {when && <span className="when">{pre}{day(when)}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
