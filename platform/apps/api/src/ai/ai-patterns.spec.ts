import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AiPatternsService, costUsd, startOfDay, type PatternModel } from "./ai-patterns.service";
import { DEFAULT_AI, type AiConfig } from "../settings/settings.service";
import { MOTIFS, readPatterns, REPLY_JSON_SCHEMA, PATTERN_SYSTEM } from "./pattern-spec";
import { PatternRequestSchema } from "./ai.controller";

const recipe = (over: Record<string, unknown> = {}) => ({
  name: "สายฟ้าเหลืองดำ",
  background: { type: "linear", colors: ["#231F20", "#414042"], angle: 90 },
  layers: [{ motif: "lightning", colors: ["#fff200"], scale: 1.2, angle: -20, density: 0.5, opacity: 0.9, fade: "none", seed: 7 }],
  ...over,
});

/** a stand-in for Claude that answers with `reply` and keeps what it was asked */
function fake(reply: unknown, stop = "end_turn") {
  const asked: any[] = [];
  const model = {
    create: async (params: any) => {
      asked.push(params);
      return { stop_reason: stop, content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }], usage: { input_tokens: 3000, output_tokens: 600, cache_read_input_tokens: 2800 } };
    },
  } as unknown as PatternModel;
  return { model, asked };
}

/** the ai_usage table and the admin's settings, in memory */
function store(cfg: Partial<AiConfig> = {}) {
  const rows: any[] = [];
  const match = (r: any, w: any = {}) => (w.userId === undefined || r.userId === w.userId) && (w.ok === undefined || r.ok === w.ok) && (!w.createdAt?.gte || r.createdAt >= w.createdAt.gte);
  const prisma = {
    aiUsage: {
      create: async ({ data }: any) => { rows.push({ createdAt: new Date(), ...data }); return data; },
      count: async ({ where }: any) => rows.filter(r => match(r, where)).length,
      aggregate: async ({ where }: any) => { const m = rows.filter(r => match(r, where)); return { _count: m.length, _sum: { costUsd: m.length ? m.reduce((a, r) => a + r.costUsd, 0) : null } }; },
      groupBy: async ({ where }: any) => [...new Set(rows.filter(r => match(r, where)).map(r => r.userId))].map(userId => ({ userId })),
      findMany: async ({ where, take }: any) => rows.filter(r => match(r, where)).slice(0, take ?? 1e9),
    },
    user: { findMany: async () => [{ id: "u1", email: "a@example.com", fullName: "A" }] },
  };
  const conf = { ...DEFAULT_AI, ...cfg };
  const settings = { ai: async () => conf };
  return { rows, conf, prisma: prisma as any, settings: settings as any };
}
const service = (model: PatternModel, cfg?: Partial<AiConfig>) => { const st = store(cfg); return { s: AiPatternsService.withModel(model, st.prisma, st.settings), ...st }; };

describe("AI pattern recipes", () => {
  it("asks Claude Opus 5.5 for structured recipes, with the cached instructions and the garment's colours", async () => {
    const { model, asked } = fake({ patterns: [recipe(), recipe({ name: "พรางเหลือง" })] });
    const { s, rows } = service(model);
    const r = await s.design("u1", { prompt: "สายฟ้าเหลือง-ดำ ดุๆ", body: "#231f20", trim: "#fff200", count: 2 });
    expect(r.patterns.map(p => p.name)).toEqual(["สายฟ้าเหลืองดำ", "พรางเหลือง"]);
    expect(r.patterns[0].background.colors).toEqual(["#231f20", "#414042"]); // lower-cased
    const p = asked[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.output_config.format).toEqual({ type: "json_schema", schema: REPLY_JSON_SCHEMA });
    expect(p.fallbacks).toBe("default");
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.messages[0].content).toMatch(/สายฟ้าเหลือง-ดำ ดุๆ[\s\S]*body #231f20, trim #fff200[\s\S]*Give 2 different/);
    // kept, with what it cost: 3000 in + 600 out + 2800 cached read on Opus 5.5
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u1", ok: true, patterns: 2, inputTokens: 3000, outputTokens: 600, cacheRead: 2800 });
    expect(rows[0].costUsd).toBeCloseTo((3000 * 4 + 600 * 20 + 2800 * 0.2) / 1e6, 8);
  });

  it("keeps the good recipes of a reply and puts numbers back in range; nothing usable is an error", async () => {
    const out = readPatterns({ patterns: [
      recipe({ layers: [{ motif: "stripes", colors: ["#ed1c24"], scale: 40, angle: 999, density: -3, opacity: 2, fade: "sideways", seed: -12 }] }),
      recipe({ layers: [{ motif: "unicorns", colors: ["#ed1c24"] }] }), // not a motif: dropped
      recipe({ background: { type: "solid", colors: ["red"], angle: 0 } }), // not a colour: dropped
    ] });
    expect(out).toHaveLength(1);
    expect(out[0].layers[0]).toMatchObject({ scale: 3, angle: 180, density: 0.1, opacity: 1, fade: "none", seed: 12 });
    const cut = service(fake("{\"patterns\": [").model);
    await expect(cut.s.design("u1", { prompt: "ลายอะไรก็ได้" })).rejects.toThrow(/ไม่สมบูรณ์/);
    expect(cut.rows[0]).toMatchObject({ ok: false, patterns: 0 }); // paid for all the same: kept
  });

  it("a declined request says so; each customer has a daily allowance, counted in the database", async () => {
    const no = service(fake({}, "refusal").model);
    await expect(no.s.design("u1", { prompt: "โลโก้แบรนด์ดัง" })).rejects.toThrow(/ให้ไม่ได้/);
    expect(no.rows[0]).toMatchObject({ ok: false, error: "refusal" });
    expect((await no.s.quota("u1")).remaining).toBe(DEFAULT_AI.dailyPerUser); // a refusal is not a design

    const { s, rows } = service(fake({ patterns: [recipe()] }).model, { dailyPerUser: 2 });
    expect((await s.design("u2", { prompt: "คลื่น" })).remaining).toBe(1);
    expect((await s.design("u2", { prompt: "คลื่น" })).remaining).toBe(0);
    await expect(s.design("u2", { prompt: "คลื่น" })).rejects.toThrow(/ครบ 2 ครั้ง/);
    expect((await s.quota("u3")).remaining).toBe(2); // someone else's allowance is their own
    // yesterday's designs don't count today
    rows.forEach(r => { r.createdAt = new Date(startOfDay().getTime() - 1000); });
    expect((await s.quota("u2")).remaining).toBe(2);
  });

  it("the admin can turn it off, and the site stops for the day once the budget is spent", async () => {
    const off = service(fake({ patterns: [recipe()] }).model, { enabled: false });
    await expect(off.s.design("u1", { prompt: "คลื่น" })).rejects.toThrow(/ปิดให้บริการ/);
    expect(off.rows).toHaveLength(0); // no call made

    const { s, rows } = service(fake({ patterns: [recipe()] }).model, { dailyBudgetThb: 10, thbPerUsd: 33 });
    rows.push({ userId: "other", ok: true, costUsd: 0.31, createdAt: new Date() }); // ฿10.23 spent today
    await expect(s.design("u1", { prompt: "คลื่น" })).rejects.toThrow(/เต็มแล้วสำหรับวันนี้/);
    rows[0].costUsd = 0.2; // ฿6.60: still room
    await s.design("u1", { prompt: "คลื่น" });

    expect(await s.quota("u1")).toMatchObject({ enabled: true, closed: null, remaining: DEFAULT_AI.dailyPerUser - 1 });
    rows[0].costUsd = 0.31; // the designer says so before the customer types
    expect(await s.quota("u1")).toMatchObject({ enabled: false, closed: "budget" });
    expect(await off.s.quota("u1")).toMatchObject({ enabled: false, closed: "off" });
    rows[0].costUsd = 0.2;
    const r = await s.report();
    expect(r.today).toMatchObject({ calls: 2, ok: 2, users: 2, overBudget: false });
    expect(r.days).toHaveLength(30);
    expect(r.days[29].calls).toBe(2);
    expect(r.topUsers[0]).toMatchObject({ userId: "other", calls: 1 });
  });

  it("a reply's cost: cached instructions are billed at the cache price", () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(4);
    expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(20);
    expect(costUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(5.2);
  });

  it("Thai days: the allowance starts again at midnight in Bangkok", () => {
    const at = Date.UTC(2026, 10, 18, 16, 59); // 23:59 in Bangkok
    expect(startOfDay(at).toISOString()).toBe("2026-11-17T17:00:00.000Z");
    expect(startOfDay(at + 60_000).toISOString()).toBe("2026-11-18T17:00:00.000Z");
  });

  it("without a key it says what to set", async () => {
    const before = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    try { const st = store(); await expect(new AiPatternsService(st.prisma, st.settings).design("u1", { prompt: "คลื่น" })).rejects.toThrow(/ANTHROPIC_API_KEY/); }
    finally { if (before !== undefined) process.env.ANTHROPIC_API_KEY = before; }
  });

  it("a request is a short description and the garment's colours", () => {
    expect(PatternRequestSchema.safeParse({ prompt: "x" }).success).toBe(false);
    expect(PatternRequestSchema.safeParse({ prompt: "ลายคลื่น", body: "red" }).success).toBe(false);
    expect(PatternRequestSchema.safeParse({ prompt: "ลายคลื่น", body: "#1d4ed8", count: 3 }).success).toBe(true);
  });

  it("the designer draws every motif Claude is told about", () => {
    const js = readFileSync(join(__dirname, "../../../web/public/designer/ai-patterns.js"), "utf8");
    for (const m of MOTIFS) {
      expect(js).toMatch(new RegExp(`\\b${m}\\s*[:(]`));
      expect(PATTERN_SYSTEM).toContain(`- ${m}:`);
    }
  });
});
