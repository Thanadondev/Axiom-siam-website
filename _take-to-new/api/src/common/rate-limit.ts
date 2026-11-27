/**
 * Dependency-free sliding-window rate limiter.
 *
 * In-memory, so it is per-process: good enough for a single API container and
 * for slowing down credential stuffing. If you scale to several instances,
 * swap `MemoryStore` for a Redis-backed store — the `RateLimiter` API stays
 * the same. (REDIS_URL is already in .env for that day.)
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** seconds until the caller may retry (0 when allowed) */
  retryAfter: number;
  limit: number;
}

export interface RateLimitOptions {
  /** max hits allowed inside the window */
  limit: number;
  /** window length in milliseconds */
  windowMs: number;
}

export class RateLimiter {
  /** key -> ascending list of hit timestamps inside the current window */
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly opts: RateLimitOptions) {}

  /** records a hit and reports whether it is allowed */
  check(key: string, now = Date.now()): RateLimitResult {
    this.sweep(now);
    const windowStart = now - this.opts.windowMs;
    const recent = (this.hits.get(key) ?? []).filter(t => t > windowStart);

    if (recent.length >= this.opts.limit) {
      const oldest = recent[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + this.opts.windowMs - now) / 1000));
      this.hits.set(key, recent); // keep the trimmed list; do NOT count blocked hits
      return { allowed: false, remaining: 0, retryAfter, limit: this.opts.limit };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.opts.limit - recent.length, retryAfter: 0, limit: this.opts.limit };
  }

  /** forget a key — call after a successful login so one typo doesn't linger */
  reset(key: string) {
    this.hits.delete(key);
  }

  /** drop keys whose whole window has expired, at most once per window */
  private sweep(now: number) {
    if (now - this.lastSweep < this.opts.windowMs) return;
    this.lastSweep = now;
    const windowStart = now - this.opts.windowMs;
    for (const [key, times] of this.hits) {
      const kept = times.filter(t => t > windowStart);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }

  /** for tests / metrics */
  size() {
    return this.hits.size;
  }
}

/** client identity for rate-limiting: proxy-aware, falls back to socket */
export function clientKey(req: {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  ip?: string;
}): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = typeof fwd === "string" ? fwd.split(",")[0]?.trim() : undefined;
  return first || req.ip || req.socket?.remoteAddress || "unknown";
}
