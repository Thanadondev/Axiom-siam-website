import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AiPatternsService, type PatternModel } from "./ai-patterns.service";
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

describe("AI pattern recipes", () => {
  it("asks Claude Opus 5.5 for structured recipes, with the cached instructions and the garment's colours", async () => {
    const { model, asked } = fake({ patterns: [recipe(), recipe({ name: "พรางเหลือง" })] });
    const r = await AiPatternsService.withModel(model).design("u1", { prompt: "สายฟ้าเหลือง-ดำ ดุๆ", body: "#231f20", trim: "#fff200", count: 2 });
    expect(r.patterns.map(p => p.name)).toEqual(["สายฟ้าเหลืองดำ", "พรางเหลือง"]);
    expect(r.patterns[0].background.colors).toEqual(["#231f20", "#414042"]); // lower-cased
    const p = asked[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.output_config.format).toEqual({ type: "json_schema", schema: REPLY_JSON_SCHEMA });
    expect(p.fallbacks).toBe("default");
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.messages[0].content).toMatch(/สายฟ้าเหลือง-ดำ ดุๆ[\s\S]*body #231f20, trim #fff200[\s\S]*Give 2 different/);
  });

  it("keeps the good recipes of a reply and puts numbers back in range; nothing usable is an error", async () => {
    const out = readPatterns({ patterns: [
      recipe({ layers: [{ motif: "stripes", colors: ["#ed1c24"], scale: 40, angle: 999, density: -3, opacity: 2, fade: "sideways", seed: -12 }] }),
      recipe({ layers: [{ motif: "unicorns", colors: ["#ed1c24"] }] }), // not a motif: dropped
      recipe({ background: { type: "solid", colors: ["red"], angle: 0 } }), // not a colour: dropped
    ] });
    expect(out).toHaveLength(1);
    expect(out[0].layers[0]).toMatchObject({ scale: 3, angle: 180, density: 0.1, opacity: 1, fade: "none", seed: 12 });
    await expect(AiPatternsService.withModel(fake("{\"patterns\": [").model).design("u1", { prompt: "ลายอะไรก็ได้" })).rejects.toThrow(/ไม่สมบูรณ์/);
  });

  it("a declined request says so; each customer has a daily allowance", async () => {
    await expect(AiPatternsService.withModel(fake({}, "refusal").model).design("u1", { prompt: "โลโก้แบรนด์ดัง" })).rejects.toThrow(/ให้ไม่ได้/);
    const s = AiPatternsService.withModel(fake({ patterns: [recipe()] }).model);
    (s as any).daily = 2;
    await s.design("u2", { prompt: "คลื่น" });
    await s.design("u2", { prompt: "คลื่น" });
    expect(s.remaining("u2")).toBe(0);
    await expect(s.design("u2", { prompt: "คลื่น" })).rejects.toThrow(/ครบ 2 ครั้ง/);
    expect(s.remaining("u3")).toBe(2); // someone else's allowance is their own
  });

  it("without a key it says what to set", async () => {
    const before = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    try { await expect(new AiPatternsService().design("u1", { prompt: "คลื่น" })).rejects.toThrow(/ANTHROPIC_API_KEY/); }
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
