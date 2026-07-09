import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { RolesGuard } from "./roles.guard";

/** builds a fake ExecutionContext carrying `user` */
const ctxFor = (user: unknown) => ({
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
  getHandler: () => undefined,
  getClass: () => undefined,
}) as any;

const guardWith = (roles: string[] | undefined) =>
  new RolesGuard({ getAllAndOverride: vi.fn(() => roles) } as any);

describe("RolesGuard", () => {
  it("lets anyone through when no @Roles is declared", () => {
    expect(guardWith(undefined).canActivate(ctxFor({ id: "u", role: "customer" }))).toBe(true);
    expect(guardWith([]).canActivate(ctxFor(undefined))).toBe(true);
  });

  it("admits a user holding the required role", () => {
    expect(guardWith(["admin"]).canActivate(ctxFor({ id: "u", role: "admin" }))).toBe(true);
  });

  it("blocks a customer from an admin route", () => {
    expect(() => guardWith(["admin"]).canActivate(ctxFor({ id: "u", role: "customer" }))).toThrow(ForbiddenException);
  });

  it("blocks staff and production from an admin route", () => {
    for (const role of ["staff", "production", "guest"]) {
      expect(() => guardWith(["admin"]).canActivate(ctxFor({ id: "u", role }))).toThrow(ForbiddenException);
    }
  });

  it("blocks an unauthenticated request", () => {
    expect(() => guardWith(["admin"]).canActivate(ctxFor(undefined))).toThrow(ForbiddenException);
  });

  it("blocks a user with no role at all", () => {
    expect(() => guardWith(["admin"]).canActivate(ctxFor({ id: "u" }))).toThrow(ForbiddenException);
  });

  it("does not accept a role smuggled in as a lookalike string", () => {
    for (const role of ["Admin", "ADMIN", "admin ", "administrator"]) {
      expect(() => guardWith(["admin"]).canActivate(ctxFor({ id: "u", role }))).toThrow(ForbiddenException);
    }
  });

  it("admits when any one of several roles matches", () => {
    expect(guardWith(["admin", "staff"]).canActivate(ctxFor({ id: "u", role: "staff" }))).toBe(true);
  });
});
