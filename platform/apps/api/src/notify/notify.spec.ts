import { describe, it, expect, beforeEach } from "vitest";
import { NotifyService } from "./notify.service";
import { tri, pick, statusTitle, stepTitle, DUE } from "./text";

/** a customer's notifications are written in the language they use on the site */
let made: any[];
let locales: Record<string, string | null>;
const prisma: any = {
  user: { findUnique: async ({ where }: any) => (where.id in locales ? { locale: locales[where.id] } : null), findMany: async () => [{ id: "admin" }] },
  notification: { create: async ({ data }: any) => { made.push(data); return data; } },
};
const svc = new NotifyService(prisma);
beforeEach(() => { made = []; locales = { th: "th", en: "en", ja: "ja", odd: "xx" }; });

describe("notifications in the customer's language", () => {
  it("picks the title and body in the language on their account", async () => {
    for (const u of ["th", "en", "ja"]) await svc.push({ userId: u, title: statusTitle("AX-1", "shipped"), body: tri("เลขพัสดุ TH1", "Tracking no. TH1", "追跡番号 TH1") });
    expect(made.map(m => [m.title, m.body])).toEqual([
      ["ออเดอร์ AX-1: จัดส่งแล้ว", "เลขพัสดุ TH1"],
      ["Order AX-1: shipped", "Tracking no. TH1"],
      ["ご注文 AX-1：発送済み", "追跡番号 TH1"],
    ]);
  });

  it("Thai when the account has no known language, or isn't found; plain text as it is", async () => {
    await svc.push({ userId: "odd", title: stepTitle("AX-2", 3, 10) });
    await svc.push({ userId: "nobody", title: stepTitle("AX-2", 3, 10) });
    await svc.push({ userId: "ja", title: "ข้อความของทีมงาน", body: "พิมพ์มาเอง" });
    expect(made.map(m => m.title)).toEqual(["ออเดอร์ AX-2: ขั้นที่ 3/10 · รีด", "ออเดอร์ AX-2: ขั้นที่ 3/10 · รีด", "ข้อความของทีมงาน"]);
    expect(made[2].body).toBe("พิมพ์มาเอง");
  });

  it("the words match the website's", () => {
    expect(pick(stepTitle("AX-3", 9, 10), "en")).toBe("Order AX-3: step 9/10 · Press & pack");
    expect(pick(stepTitle("AX-3", 10, 10), "ja")).toBe("ご注文 AX-3：工程 10/10 · 出荷");
    expect(pick(statusTitle("AX-3", "approved"), "ja")).toBe("ご注文 AX-3：デザイン承認済み");
    expect(pick(DUE.deposit, "en")).toBe("deposit");
    expect(pick(undefined, "ja")).toBeUndefined();
  });
});
