import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Role } from "@axiom/db";

export const IS_PUBLIC = "isPublic";
/** Skip JwtAuthGuard for this route */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = "roles";
/** Restrict route to given roles (used with RolesGuard) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  role: Role;
}

/** Inject the authenticated user: me(@CurrentUser() user: AuthUser) */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
