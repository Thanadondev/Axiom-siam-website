"use client";

import { apiHref, mb } from "../lib/order-upload";

/** one of the customer's print files on an order, as the API shows it (signed links, an hour each) */
export interface OrderFileView {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
  downloadUrl: string | null;
  previewUrl: string | null;
}

/**
 * The print files a bib order came with: the job's picture and the zip to download.
 * The links are signed for an hour — reloading the page gets fresh ones.
 */
export default function OrderFiles({ files, title = "ไฟล์งานของลูกค้า", note }: { files?: OrderFileView[] | null; title?: string; note?: React.ReactNode }) {
  if (!files?.length) return null;
  return (
    <div className="acard">
      <h2 className="ah2">{title}</h2>
      {note && <p className="asub" style={{ marginTop: 0 }}>{note}</p>}
      {files.map(f => (
        <div key={f.id} className="ofile" style={{ marginTop: 12 }}>
          {f.previewUrl
            ? <a href={apiHref(f.previewUrl)} target="_blank" rel="noreferrer"><img src={apiHref(f.previewUrl)} alt={`ภาพตัวอย่างงาน ${f.name}`} /></a>
            : <div className="dim" style={{ fontSize: 12.5 }}>ไม่มีภาพตัวอย่าง</div>}
          <div>
            <div className="name">{f.name}</div>
            <div className="dim" style={{ margin: "2px 0 10px" }}>{mb(f.bytes)} · อัปโหลด {new Date(f.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
            {f.downloadUrl && <a className="minibtn" href={apiHref(f.downloadUrl)} download>⬇ ดาวน์โหลด .zip</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
