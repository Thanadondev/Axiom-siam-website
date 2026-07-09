import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from "@nestjs/common";
import { Observable, tap, catchError, throwError } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";

/** never persist these, whatever the route */
const REDACT = ["password", "passwordHash", "token", "accessToken", "refreshToken", "totpSecret", "secret", "stateJson"];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.includes(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

/** POST /api/v1/admin/templates/:id  →  templates.create */
function actionFrom(method: string, path: string): string {
  const parts = path.replace(/^\/api\/v\d+\//, "").split("/").filter(Boolean);
  const idx = parts.indexOf("admin");
  const rest = idx >= 0 ? parts.slice(idx + 1) : parts;
  // strip uuid-ish segments so the action name stays stable
  const words = rest.filter(p => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p));
  const verb = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
  return `${words.join(".") || "root"}.${verb}`;
}

/** admin routes live under /api/v1/admin/... — everything else is out of scope */
export function isAdminPath(path: string): boolean {
  return /(^|\/)admin(\/|$)/.test((path || "").split("?")[0]);
}

/**
 * Records every state-changing admin request. Read requests (GET) are ignored —
 * they are noise and would bury the actions that actually matter.
 *
 * Registered once, app-wide (see app.module.ts), rather than decorating each
 * admin controller: a new admin controller would otherwise silently go
 * un-audited, which is exactly the failure an audit trail must not have.
 *
 * Logging is best-effort and happens after the response is produced, so an
 * audit failure can never break an admin action.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly log = new Logger("Audit");

  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next.handle();
    if (!isAdminPath(req.originalUrl ?? req.url ?? "")) return next.handle();

    const write = async (ok: boolean, status?: number) => {
      const user = req.user as { id?: string; email?: string } | undefined;
      // the JWT only carries {id, role}; denormalise the email so the trail
      // stays readable even after the account is deleted
      let actorEmail = user?.email ?? null;
      if (!actorEmail && user?.id) {
        actorEmail = await this.prisma.user
          .findUnique({ where: { id: user.id }, select: { email: true } })
          .then(u => u?.email ?? null)
          .catch(() => null);
      }
      await this.prisma.adminAudit.create({
        data: {
          actorId: user?.id ?? null,
          actorEmail,
          method,
          path: req.originalUrl ?? req.url,
          action: actionFrom(method, req.originalUrl ?? req.url ?? ""),
          targetId: req.params?.id ?? null,
          payload: redact(req.body) as any,
          ok,
          status: status ?? null,
          ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
          userAgent: req.headers["user-agent"] ?? null,
        },
      });
    };

    // fire-and-forget: an audit failure must never break an admin action
    const safeWrite = (ok: boolean, status?: number) =>
      write(ok, status).catch(e => this.log.warn(`audit write failed: ${e.message}`));

    return next.handle().pipe(
      tap(() => safeWrite(true, ctx.switchToHttp().getResponse()?.statusCode)),
      catchError(err => {
        safeWrite(false, err?.status ?? 500);
        return throwError(() => err);
      }),
    );
  }
}
