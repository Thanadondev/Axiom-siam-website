import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimiter, clientKey, type RateLimitOptions } from "./rate-limit";

export const RATE_LIMIT_KEY = "rateLimit";

/** @RateLimit({ limit: 5, windowMs: 60_000 }) — per route, keyed by client IP */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);

@Injectable()
export class RateLimitGuard implements CanActivate {
  /** one limiter per route+options combination */
  private limiters = new Map<string, RateLimiter>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const routeId = `${req.method} ${req.route?.path ?? req.url}`;

    let limiter = this.limiters.get(routeId);
    if (!limiter) {
      limiter = new RateLimiter(opts);
      this.limiters.set(routeId, limiter);
    }

    // an attacker guessing passwords for many accounts still shares one IP
    const key = clientKey(req);
    const r = limiter.check(key);

    res?.setHeader?.("X-RateLimit-Limit", String(r.limit));
    res?.setHeader?.("X-RateLimit-Remaining", String(r.remaining));

    if (!r.allowed) {
      res?.setHeader?.("Retry-After", String(r.retryAfter));
      throw new HttpException(
        `พยายามหลายครั้งเกินไป กรุณารออีก ${r.retryAfter} วินาที`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
