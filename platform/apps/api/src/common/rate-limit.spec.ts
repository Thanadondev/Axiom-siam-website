import { describe, it, expect } from "vitest";
import { RateLimiter, clientKey } from "./rate-limit";

const opts = { limit: 3, windowMs: 60_000 };

describe("RateLimiter", () => {
  it("allows up to the limit then blocks", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    expect(rl.check("a", t).allowed).toBe(true);
    expect(rl.check("a", t).allowed).toBe(true);
    expect(rl.check("a", t).allowed).toBe(true);
    expect(rl.check("a", t).allowed).toBe(false);
  });

  it("counts down the remaining budget", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    expect(rl.check("a", t).remaining).toBe(2);
    expect(rl.check("a", t).remaining).toBe(1);
    expect(rl.check("a", t).remaining).toBe(0);
  });

  it("keeps keys independent", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) rl.check("a", t);
    expect(rl.check("a", t).allowed).toBe(false);
    expect(rl.check("b", t).allowed).toBe(true);
  });

  it("slides: the window frees up as old hits age out", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    rl.check("a", t);
    rl.check("a", t + 10_000);
    rl.check("a", t + 20_000);
    expect(rl.check("a", t + 30_000).allowed).toBe(false);
    // the very first hit is now older than 60s
    expect(rl.check("a", t + 60_001).allowed).toBe(true);
  });

  it("does not extend the ban when blocked requests keep arriving", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) rl.check("a", t);
    // hammer while blocked
    for (let i = 0; i < 20; i++) rl.check("a", t + 1000 * i);
    // once the original 3 hits expire the caller is free again
    expect(rl.check("a", t + 60_001).allowed).toBe(true);
  });

  it("reports a sensible retryAfter", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) rl.check("a", t);
    const r = rl.check("a", t + 10_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBe(50); // 60s window, 10s elapsed
    expect(r.limit).toBe(3);
  });

  it("never reports retryAfter below 1 second", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) rl.check("a", t);
    expect(rl.check("a", t + 59_999).retryAfter).toBe(1);
  });

  it("reset() clears a key (e.g. after a successful login)", () => {
    const rl = new RateLimiter(opts);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) rl.check("a", t);
    expect(rl.check("a", t).allowed).toBe(false);
    rl.reset("a");
    expect(rl.check("a", t).allowed).toBe(true);
  });

  it("sweeps expired keys so memory does not grow forever", () => {
    const rl = new RateLimiter(opts);
    for (let i = 0; i < 100; i++) rl.check(`k${i}`, 1_000_000);
    expect(rl.size()).toBe(100);
    rl.check("trigger", 1_000_000 + 60_001); // sweep runs
    expect(rl.size()).toBe(1); // only "trigger" survives
  });

  it("a limit of 1 blocks the second attempt", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 0).allowed).toBe(false);
  });
});

describe("clientKey", () => {
  it("prefers the first x-forwarded-for entry", () => {
    expect(clientKey({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })).toBe("1.2.3.4");
  });

  it("trims whitespace", () => {
    expect(clientKey({ headers: { "x-forwarded-for": "  9.9.9.9 ,1.1.1.1" } })).toBe("9.9.9.9");
  });

  it("falls back to req.ip, then the socket", () => {
    expect(clientKey({ headers: {}, ip: "10.0.0.1" })).toBe("10.0.0.1");
    expect(clientKey({ headers: {}, socket: { remoteAddress: "10.0.0.2" } })).toBe("10.0.0.2");
  });

  it("never returns empty", () => {
    expect(clientKey({ headers: {} })).toBe("unknown");
    expect(clientKey({ headers: { "x-forwarded-for": "" } })).toBe("unknown");
  });
});
