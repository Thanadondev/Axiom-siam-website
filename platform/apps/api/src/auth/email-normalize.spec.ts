import { describe, it, expect } from "vitest";
import { normalizeEmail, sameEmail } from "./email-normalize";

describe("normalizeEmail", () => {
  it("lowercases", () => {
    expect(normalizeEmail("TechKairos241@Gmail.com")).toBe("techkairos241@gmail.com");
    expect(normalizeEmail("BOB@X.CO.TH")).toBe("bob@x.co.th");
  });

  it("trims whitespace people paste in", () => {
    expect(normalizeEmail("  bob@x.com \n")).toBe("bob@x.com");
  });

  it("survives empty / nullish input", () => {
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail(undefined as any)).toBe("");
    expect(normalizeEmail(null as any)).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeEmail(" Bob@X.com ");
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("sameEmail", () => {
  it("matches the exact bug that let two accounts exist for one person", () => {
    // register stored what the user typed...
    const typed = "TechKairos241@gmail.com";
    // ...while googleSignIn lowercased. Two rows, one human.
    const fromGoogle = "techkairos241@gmail.com";
    expect(sameEmail(typed, fromGoogle)).toBe(true);
  });

  it("still tells different people apart", () => {
    expect(sameEmail("a@x.com", "b@x.com")).toBe(false);
    expect(sameEmail("bob@x.com", "bob@y.com")).toBe(false);
  });
});
