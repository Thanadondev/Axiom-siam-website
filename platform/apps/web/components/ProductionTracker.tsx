"use client";

import Link from "next/link";
import { STEPS, SHIP_STEP, orderStep } from "../lib/production-steps";

const dt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/**
 * Where the customer's job is on the production line: the ten steps, the one
 * it's on now, and a link to that station in the 3D walk-through (/process).
 */
export default function ProductionTracker({ status, productionStep, history }: {
  status: string;
  productionStep?: number | null;
  history?: { step?: number | null; createdAt: string }[];
}) {
  if (status === "cancelled" || status === "refunded") return null;
  const step = orderStep(status, productionStep);
  const unpaid = status === "pending";
  const cur = step > 0 ? STEPS[step - 1] : null;
  const since = history?.filter(h => h.step === step).at(-1)?.createdAt;

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
          {since && step > 0 && <div className="dim" style={{ marginTop: 4 }}>อัปเดตเมื่อ {dt(since)}</div>}
        </div>
        <Link className="minibtn" href={`/process?step=${peek}`} target="_blank">
          {step > 0 ? "ดูขั้นนี้ในไลน์ผลิต 3D" : "ดูขั้นตอนผลิต 3D"} →
        </Link>
      </div>
      <ol className="ptrack" aria-label={`ขั้นตอนผลิต: ${head}`}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < step || step === SHIP_STEP ? "done" : n === step ? "now" : "todo";
          return (
            <li key={s.en} data-state={state} aria-current={state === "now" ? "step" : undefined}>
              <span className="dot" aria-hidden="true">{state === "done" ? "✓" : n}</span>
              <span className="lbl">{s.th}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
