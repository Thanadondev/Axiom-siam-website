import { describe, it, expect } from "vitest";
import { validThaiTaxId, branchLabel, readTaxInfo, sellerFromEnv, splitVat } from "./tax-invoice";

describe("Thai tax ids", () => {
  it("accepts a valid check digit and rejects the rest", () => {
    expect(validThaiTaxId("0105536084835")).toBe(true);   // a made-up id with a correct check digit
    expect(validThaiTaxId("0-1055-36084-83-5")).toBe(true);
    expect(validThaiTaxId("0105536084831")).toBe(false);  // wrong check digit
    expect(validThaiTaxId("010553608483")).toBe(false);   // 12 digits
    expect(validThaiTaxId("abcdefghijklm")).toBe(false);
  });
});

describe("tax invoice details", () => {
  it("labels head office and branches", () => {
    expect(branchLabel("00000")).toBe("สำนักงานใหญ่");
    expect(branchLabel(null)).toBe("สำนักงานใหญ่");
    expect(branchLabel("00012")).toBe("สาขาที่ 00012");
  });

  it("reads the stored JSON, and treats junk as not requested", () => {
    expect(readTaxInfo('{"name":"บจก. ทีม","taxId":"0105536084835","branch":"00000","address":"กทม."}')?.name).toBe("บจก. ทีม");
    expect(readTaxInfo("not json")).toBeNull();
    expect(readTaxInfo(null)).toBeNull();
  });

  it("needs the company's tax id and address before printing a tax invoice", () => {
    expect(sellerFromEnv({})).toBeNull();
    expect(sellerFromEnv({ COMPANY_TAX_ID: "0105536084835" })).toBeNull();
    expect(sellerFromEnv({ COMPANY_TAX_ID: "0105536084835", COMPANY_ADDRESS: "1 ถนน" })).toMatchObject({ branch: "00000", name: "Axiom Siam Co.,Ltd." });
  });

  it("splits 7% VAT out of a VAT-inclusive total", () => {
    expect(splitVat(1070)).toEqual({ beforeVat: 1000, vat: 70 });
    const s = splitVat(3900);
    expect(Math.round((s.beforeVat + s.vat) * 100) / 100).toBe(3900);
  });
});
