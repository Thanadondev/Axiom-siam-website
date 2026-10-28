/**
 * Full tax invoice (ใบกำกับภาษีเต็มรูป, Revenue Code s.86/4) details.
 * Pure — tax-invoice.spec.ts.
 */

export interface TaxParty {
  name: string;
  taxId: string;
  /** "00000" = head office (สำนักงานใหญ่), otherwise the 5-digit branch number */
  branch: string;
  address: string;
}

/** a Thai 13-digit tax id with a valid check digit (people and companies alike) */
export function validThaiTaxId(raw: string): boolean {
  const id = raw.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export function cleanTaxId(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** how a branch reads on the invoice */
export function branchLabel(branch: string | null | undefined): string {
  if (!branch || branch === "00000") return "สำนักงานใหญ่";
  return `สาขาที่ ${branch}`;
}

/** the order column holds JSON text; anything unreadable counts as "not requested" */
export function readTaxInfo(text: string | null | undefined): TaxParty | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    if (v && typeof v.name === "string" && typeof v.taxId === "string" && typeof v.address === "string") {
      return { name: v.name, taxId: v.taxId, branch: typeof v.branch === "string" ? v.branch : "00000", address: v.address };
    }
  } catch { /* not JSON */ }
  return null;
}

/** the seller, from the environment; null until the company's tax details are set */
export function sellerFromEnv(env: NodeJS.ProcessEnv = process.env): TaxParty | null {
  const taxId = cleanTaxId(env.COMPANY_TAX_ID ?? "");
  const address = (env.COMPANY_ADDRESS ?? "").trim();
  if (!taxId || !address) return null;
  return {
    name: (env.COMPANY_NAME ?? "").trim() || "Axiom Siam Co.,Ltd.",
    taxId,
    branch: /^\d{5}$/.test(env.COMPANY_BRANCH ?? "") ? env.COMPANY_BRANCH! : "00000",
    address,
  };
}

/** VAT included in a price (7%), split the way the invoice prints it */
export function splitVat(totalBaht: number, rate = 0.07): { beforeVat: number; vat: number } {
  const beforeVat = Math.round((totalBaht / (1 + rate)) * 100) / 100;
  return { beforeVat, vat: Math.round((totalBaht - beforeVat) * 100) / 100 };
}
