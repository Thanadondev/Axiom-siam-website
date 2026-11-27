import { describe, it, expect, vi } from "vitest";
import { DesignsService } from "./designs.service";

describe("my designs list", () => {
  it("says which editor made each design: a 3D-studio design carries its kit, the advanced designer's none", async () => {
    const rows = [
      { id: "a", name: "เสื้อบาสเกตบอล · 7 ตัว", previewUrl: null, mode: "reversible", updatedAt: new Date() },
      { id: "b", name: "TEST (5 ตัว)", previewUrl: null, mode: "single", updatedAt: new Date() },
    ];
    const prisma = {
      design: { findMany: vi.fn().mockResolvedValue(rows) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "a", kit: "bib" }, { id: "b", kit: null }]),
    };
    const list = await new DesignsService(prisma as any).list("u1");
    expect(list.map(d => [d.id, d.kit])).toEqual([["a", "bib"], ["b", null]]);
    // the full designs (they can hold images) are not pulled for the list
    expect(prisma.design.findMany.mock.calls[0][0].select.stateJson).toBeUndefined();
  });

  it("no designs: no second query", async () => {
    const prisma = { design: { findMany: vi.fn().mockResolvedValue([]) }, $queryRaw: vi.fn() };
    expect(await new DesignsService(prisma as any).list("u1")).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
