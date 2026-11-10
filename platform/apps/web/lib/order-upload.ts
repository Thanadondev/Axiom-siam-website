/**
 * Sending the customer's print-file zip to the API (POST /order-files) as the raw
 * request body, with progress — fetch() can't report upload progress, XHR can.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** the API's limit (apps/api/src/orders/order-files.service.ts) */
export const ZIP_MAX_BYTES = 500 * 1024 * 1024;

export interface UploadedZip { id: string; name: string; bytes: number }

/** an absolute link to an API path such as a signed file link ("/api/v1/order-files/…") */
export const apiHref = (path: string | null | undefined) => (path ? (/^https?:/.test(path) ? path : `${API_BASE}${path}`) : "");

export function uploadZip(file: File, token: string, onProgress: (sent: number, total: number) => void): { done: Promise<UploadedZip>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<UploadedZip>((resolve, reject) => {
    xhr.open("POST", `${API_BASE}/api/v1/order-files`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body);
      else reject(new Error(body.message || (xhr.status === 413 ? "ไฟล์ใหญ่เกิน 500 MB" : `อัปโหลดไม่สำเร็จ (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new Error("อัปโหลดไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่"));
    xhr.onabort = () => reject(new Error("ยกเลิกการอัปโหลดแล้ว"));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}

/** the job's picture, made small enough to send (longest side 1600px, JPEG) */
export async function previewDataUrl(img: Blob, max = 1600): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(img);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c.toDataURL("image/jpeg", 0.85);
  } catch {
    return null; // a picture the browser can't draw: the order goes ahead without one
  }
}

export const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
