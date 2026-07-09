import { describe, it, expect } from "vitest";
import { CreateTemplateSchema, ReportTemplateSchema, BrowseQuerySchema } from "./market.dto";

const base = { name: "ลายทีมชาติ", price: 100, stateJson: {} };

describe("CreateTemplateSchema", () => {
  it("accepts a minimal template", () => {
    expect(CreateTemplateSchema.safeParse(base).success).toBe(true);
  });

  it("requires a name", () => {
    expect(CreateTemplateSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("allows a free template", () => {
    const r = CreateTemplateSchema.safeParse({ ...base, price: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects a negative price", () => {
    expect(CreateTemplateSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
  });

  it("coerces a string price and drops the fraction", () => {
    const r = CreateTemplateSchema.safeParse({ ...base, price: "250" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe(250);
    expect(CreateTemplateSchema.safeParse({ ...base, price: 10.5 }).success).toBe(false);
  });

  it("carries agreedTerms so the service can enforce it on publish", () => {
    const r = CreateTemplateSchema.safeParse({ ...base, status: "published", agreedTerms: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.agreedTerms).toBe(true);
  });

  it("leaves agreedTerms undefined when omitted — the service must then refuse to publish", () => {
    const r = CreateTemplateSchema.safeParse({ ...base, status: "published" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.agreedTerms).toBeUndefined();
  });

  it("rejects an unknown status", () => {
    expect(CreateTemplateSchema.safeParse({ ...base, status: "live" }).success).toBe(false);
  });

  it("caps the tag list", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(CreateTemplateSchema.safeParse({ ...base, tags }).success).toBe(false);
  });
});

describe("ReportTemplateSchema", () => {
  it("accepts each supported reason", () => {
    for (const reason of ["copyright", "trademark", "illegal", "other"]) {
      expect(ReportTemplateSchema.safeParse({ reason }).success).toBe(true);
    }
  });

  it("rejects a made-up reason", () => {
    expect(ReportTemplateSchema.safeParse({ reason: "ugly" }).success).toBe(false);
  });

  it("makes detail optional and blanks it to undefined", () => {
    const r = ReportTemplateSchema.safeParse({ reason: "copyright", detail: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.detail).toBeUndefined();
  });
});

describe("BrowseQuerySchema", () => {
  it("accepts an empty query (browse everything)", () => {
    expect(BrowseQuerySchema.safeParse({}).success).toBe(true);
  });

  it("coerces pagination from the query string", () => {
    const r = BrowseQuerySchema.safeParse({ take: "24", skip: "48" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.take).toBe(24); expect(r.data.skip).toBe(48); }
  });

  it("caps take so a client cannot ask for the whole table", () => {
    expect(BrowseQuerySchema.safeParse({ take: "1000" }).success).toBe(false);
  });

  it("rejects an unknown sort key", () => {
    expect(BrowseQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
  });
});
