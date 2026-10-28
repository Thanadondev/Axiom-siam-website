import { describe, it, expect } from "vitest";
import { signSlipUrl, verifySlipLink, SLIP_LINK_TTL_MS } from "./slip-link";

const stored = "/uploads/slips/0b6c7a7e-1111-4c4c-9a9a-123456789abc/1730000000000-ab12cd34.jpg";
const parts = (url: string) => {
  const q = new URL(url, "http://x").searchParams;
  return [q.get("f"), q.get("exp"), q.get("sig")] as const;
};

describe("slip links", () => {
  it("signs a stored slip path into an API link that verifies", () => {
    const now = 1_800_000_000_000;
    const url = signSlipUrl(stored, now)!;
    expect(url.startsWith("/api/v1/payments/slip?")).toBe(true);
    const [f, exp, sig] = parts(url);
    expect(verifySlipLink(f, exp, sig, now)).toBe("0b6c7a7e-1111-4c4c-9a9a-123456789abc/1730000000000-ab12cd34.jpg");
  });

  it("expires", () => {
    const now = 1_800_000_000_000;
    const [f, exp, sig] = parts(signSlipUrl(stored, now)!);
    expect(verifySlipLink(f, exp, sig, now + SLIP_LINK_TTL_MS + 1000)).toBeNull();
  });

  it("rejects a tampered file, expiry or signature", () => {
    const now = 1_800_000_000_000;
    const [f, exp, sig] = parts(signSlipUrl(stored, now)!);
    expect(verifySlipLink(f!.replace("ab12", "ff12"), exp, sig, now)).toBeNull();
    expect(verifySlipLink(f, String(Number(exp) + 3600), sig, now)).toBeNull();
    expect(verifySlipLink(f, exp, sig!.slice(0, -2) + "AA", now)).toBeNull();
  });

  it("never signs or serves a path outside the slips folder", () => {
    expect(signSlipUrl("/uploads/slips/../../.env")).toBeNull();
    expect(signSlipUrl("/uploads/kit-assets/logos/x.png")).toBeNull();
    expect(signSlipUrl(null)).toBeNull();
    expect(verifySlipLink("../x/y.jpg", String(2e9), "x", 0)).toBeNull();
  });
});
