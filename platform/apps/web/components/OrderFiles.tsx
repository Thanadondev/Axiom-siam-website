"use client";

import { apiHref, mb } from "../lib/order-upload";
import { tri, locale, type Lang } from "../lib/i18n";

/** one of the customer's print files on an order, as the API shows it (signed links, an hour each) */
export interface OrderFileView {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
  downloadUrl: string | null;
  previewUrl: string | null;
  /** admins only: the copy in the job folders on the NAS (relative to NAS_JOBS_DIR) */
  nas?: { path: string; at: string | null } | null;
}

/**
 * The print files a bib order came with: the job's picture and the zip to download.
 * The links are signed for an hour — reloading the page gets fresh ones.
 */
export default function OrderFiles({ files, title, note, lang = "th" }: { files?: OrderFileView[] | null; title?: string; note?: React.ReactNode; lang?: Lang }) {
  if (!files?.length) return null;
  const L = tri(lang);
  return (
    <div className="acard">
      <h2 className="ah2">{title ?? L("ไฟล์งานของลูกค้า", "Your artwork files", "入稿データ")}</h2>
      {note && <p className="asub" style={{ marginTop: 0 }}>{note}</p>}
      {files.map(f => (
        <div key={f.id} className="ofile" style={{ marginTop: 12 }}>
          {f.previewUrl
            ? <a href={apiHref(f.previewUrl)} target="_blank" rel="noreferrer"><img src={apiHref(f.previewUrl)} alt={`${L("ภาพตัวอย่างงาน", "Preview of", "プレビュー")} ${f.name}`} /></a>
            : <div className="dim" style={{ fontSize: 12.5 }}>{L("ไม่มีภาพตัวอย่าง", "No preview", "プレビューなし")}</div>}
          <div>
            <div className="name">{f.name}</div>
            <div className="dim" style={{ margin: "2px 0 10px" }}>
              {mb(f.bytes)} · {L("อัปโหลด", "uploaded", "アップロード")} {new Date(f.createdAt).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" })}
            </div>
            {f.downloadUrl && <a className="minibtn" href={apiHref(f.downloadUrl)} download>⬇ {L("ดาวน์โหลด .zip", "Download .zip", ".zipをダウンロード")}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
