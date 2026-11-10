import { describe, it, expect } from "vitest";
import { signOrderFileUrl, verifyOrderFileLink, cleanZipName, isZipStart, ORDER_FILE_LINK_TTL_MS } from "./order-file-link";

const ID = "3f6c1d2e-8a4b-4c1d-9e2f-0a1b2c3d4e5f";
const parts = (url: string) => {
  const u = new URL(url, "http://x");
  const [, , , , id, kind] = u.pathname.split("/");
  return { id, kind, exp: u.searchParams.get("exp"), sig: u.searchParams.get("sig") };
};

describe("signed links to a customer's print files", () => {
  it("a link works for its file and part, until it expires", () => {
    const now = Date.parse("2026-11-10T03:00:00Z");
    const p = parts(signOrderFileUrl(ID, "zip", now)!);
    expect(p).toMatchObject({ id: ID, kind: "zip" });
    expect(verifyOrderFileLink(p.id, p.kind, p.exp, p.sig, now)).toBe(true);
    expect(verifyOrderFileLink(p.id, p.kind, p.exp, p.sig, now + ORDER_FILE_LINK_TTL_MS + 1000)).toBe(false);
  });

  it("can't be turned into a link to another file, the other part, or a later expiry", () => {
    const now = Date.now();
    const p = parts(signOrderFileUrl(ID, "preview", now)!);
    expect(verifyOrderFileLink("3f6c1d2e-8a4b-4c1d-9e2f-0a1b2c3d4e50", p.kind, p.exp, p.sig, now)).toBe(false);
    expect(verifyOrderFileLink(p.id, "zip", p.exp, p.sig, now)).toBe(false);
    expect(verifyOrderFileLink(p.id, p.kind, String(Number(p.exp) + 3600), p.sig, now)).toBe(false);
    expect(verifyOrderFileLink(p.id, p.kind, p.exp, p.sig!.slice(0, -2) + "AA", now)).toBe(false);
    expect(verifyOrderFileLink("../../etc/passwd", "zip", p.exp, p.sig, now)).toBe(false);
  });

  it("only signs file ids", () => {
    expect(signOrderFileUrl("../x", "zip")).toBeNull();
  });
});

describe("the name a customer gave their zip", () => {
  it("keeps Japanese and Thai, drops folders and control characters, always ends in .zip", () => {
    expect(cleanZipName(encodeURIComponent("HF-424 (N) 10053 陵北ミニバス R bibs (L).zip"))).toBe("HF-424 (N) 10053 陵北ミニバス R bibs (L).zip");
    expect(cleanZipName("C:\\Users\\a\\..\\งานทีม.zip")).toBe("งานทีม.zip");
    expect(cleanZipName("../../evil\u0000.zip")).toBe("evil.zip");
    expect(cleanZipName("artwork")).toBe("artwork.zip");
    expect(cleanZipName(undefined)).toBe("artwork.zip");
    expect(cleanZipName("a".repeat(400) + ".zip")).toHaveLength(200);
  });
});

describe("a zip by its first bytes", () => {
  it("knows a zip with files from anything else", () => {
    expect(isZipStart(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(isZipStart(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(false); // an empty zip
    expect(isZipStart(Buffer.from("%PDF-1.7"))).toBe(false); // an .ai saved as PDF
    expect(isZipStart(Buffer.from([0x50, 0x4b]))).toBe(false);
  });
});
