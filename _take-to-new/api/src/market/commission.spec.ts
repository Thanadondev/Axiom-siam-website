import { describe, it, expect } from "vitest";
import { splitPrice, previewFingerprint } from "./commission";

describe("splitPrice", () => {
  it("splits at the default 30% rate", () => {
    const s = splitPrice(100, 30);
    expect(s.platformFee).toBe(30);
    expect(s.designerEarning).toBe(70);
  });

  it("always conserves the money — fee + earning === price", () => {
    for (let price = 0; price <= 500; price++) {
      for (const pct of [0, 7, 15, 30, 33, 50, 99, 100]) {
        const s = splitPrice(price, pct);
        expect(s.platformFee + s.designerEarning).toBe(price);
      }
    }
  });

  it("never produces fractions of a baht", () => {
    const s = splitPrice(333, 33); // 109.89 → rounds
    expect(Number.isInteger(s.platformFee)).toBe(true);
    expect(Number.isInteger(s.designerEarning)).toBe(true);
    expect(s.platformFee).toBe(110);
    expect(s.designerEarning).toBe(223);
  });

  it("gives everything to the designer at 0%", () => {
    const s = splitPrice(250, 0);
    expect(s.platformFee).toBe(0);
    expect(s.designerEarning).toBe(250);
  });

  it("gives everything to the platform at 100%", () => {
    const s = splitPrice(250, 100);
    expect(s.platformFee).toBe(250);
    expect(s.designerEarning).toBe(0);
  });

  it("handles free templates", () => {
    const s = splitPrice(0, 30);
    expect(s.platformFee).toBe(0);
    expect(s.designerEarning).toBe(0);
  });

  it("clamps a nonsense commission rate", () => {
    expect(splitPrice(100, -10).platformFee).toBe(0);
    expect(splitPrice(100, 150).platformFee).toBe(100);
  });

  it("clamps a negative price to zero rather than inventing money", () => {
    const s = splitPrice(-100, 30);
    expect(s.price).toBe(0);
    expect(s.platformFee).toBe(0);
    expect(s.designerEarning).toBe(0);
  });

  it("truncates a fractional price", () => {
    expect(splitPrice(99.9, 30).price).toBe(99);
  });

  it("records the rate that was applied, for freezing onto the purchase row", () => {
    expect(splitPrice(100, 42).commissionPct).toBe(42);
  });
});

describe("previewFingerprint", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  it("hashes a base64 data URL to a sha256 hex digest", () => {
    const h = previewFingerprint(png);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — the same image always gives the same hash", () => {
    expect(previewFingerprint(png)).toBe(previewFingerprint(png));
  });

  it("ignores whitespace inside the base64 payload", () => {
    const wrapped = "data:image/png;base64,iVBORw0KGgo\nAAAANSUhEUg==";
    expect(previewFingerprint(wrapped)).toBe(previewFingerprint(png));
  });

  it("ignores the surrounding whitespace of the whole URL", () => {
    expect(previewFingerprint(`  ${png}  `)).toBe(previewFingerprint(png));
  });

  it("gives different images different hashes", () => {
    // note: "...UEg==" vs "...UEh==" decode to the SAME bytes (padding discards
    // the differing bits) — the payload must differ in a non-padding byte
    const other = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEA";
    expect(previewFingerprint(other)).not.toBe(previewFingerprint(png));
  });

  it("hashes the bytes, not the mime prefix — same pixels, different declared type", () => {
    const asJpeg = png.replace("image/png", "image/jpeg");
    expect(previewFingerprint(asJpeg)).toBe(previewFingerprint(png));
  });

  it("handles a non-base64 data URL", () => {
    expect(previewFingerprint("data:image/svg+xml,%3Csvg%2F%3E")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns null when there is nothing to fingerprint", () => {
    expect(previewFingerprint(null)).toBeNull();
    expect(previewFingerprint(undefined)).toBeNull();
    expect(previewFingerprint("")).toBeNull();
    expect(previewFingerprint("data:image/png;base64,")).toBeNull();
  });

  it("returns null for a plain http URL — we only fingerprint inline images", () => {
    expect(previewFingerprint("https://cdn.example.com/a.png")).toBeNull();
    expect(previewFingerprint("/portfolio/ex_01.png")).toBeNull();
  });
});
