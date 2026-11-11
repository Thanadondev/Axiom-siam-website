import { describe, it, expect } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";

/** two sign-ins in the same second (a double click, sign-up then sign-in) must not mint the same refresh token */
describe("refresh tokens", () => {
  it("are unique even when issued in the same second", async () => {
    process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
    process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
    const saved: string[] = [];
    const prisma: any = { authToken: { create: async ({ data }: any) => { if (saved.includes(data.token)) throw new Error("Unique constraint failed on the fields: (`token`)"); saved.push(data.token); } } };
    const svc = new AuthService(prisma, new JwtService({}), {} as any);
    const a = await (svc as any).issueTokens("user-1", "customer");
    const b = await (svc as any).issueTokens("user-1", "customer");
    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect(saved).toHaveLength(2);
  });
});
