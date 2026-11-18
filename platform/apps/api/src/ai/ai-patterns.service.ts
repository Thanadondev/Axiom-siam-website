import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService, type AiConfig, type AiOrder } from "../settings/settings.service";
import { PATTERN_SYSTEM, readPatterns, REPLY_JSON_SCHEMA, type PatternSpec } from "./pattern-spec";

export interface PatternRequest {
  prompt: string;
  /** the garment's colours, for a request that names none */
  body?: string;
  trim?: string;
  count?: number;
}

export type Provider = "claude" | "gemini";
export const providersOf = (order: AiOrder) => order.split(">") as Provider[];

/** what calls Claude: replaced in tests */
export type PatternModel = Pick<Anthropic["beta"]["messages"], "create">;

export const AI_MODEL = "claude-opus-5-5";
/** US dollars per million tokens (Claude Opus 5.5): input, output, cache read, cache write (5 min) */
const PRICE = { in: 4, out: 20, read: 0.2, write: 5 };

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
/** what a Claude reply cost, in US dollars (input_tokens leaves out the cached part, which is billed on its own) */
export function costUsd(u: Usage) {
  return (u.input_tokens * PRICE.in + u.output_tokens * PRICE.out + (u.cache_read_input_tokens ?? 0) * PRICE.read + (u.cache_creation_input_tokens ?? 0) * PRICE.write) / 1e6;
}

// ---------- Gemini (Google), through its REST API ----------
/** the price used for a model not in the list */
export const GEMINI_DEFAULT = "gemini-3.8-flash";
/**
 * tried in turn while one is overloaded or over its per-minute quota. 3.8 Flash is
 * left out: in Nov 2026 it was "high demand" or queued past 90 s on most calls
 * (GEMINI_MODEL="gemini-3.8-flash,gemini-3.6-flash" puts it back first)
 */
export const GEMINI_MODELS_DEFAULT = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
/** US dollars per million tokens on Google's paid tier: input, output (thinking included), cached input */
const GEMINI_PRICE: Record<string, { in: number; out: number; read: number }> = {
  "gemini-3.8-flash": { in: 0.75, out: 3.75, read: 0.075 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75, read: 0.075 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5, read: 0.03 },
  "gemini-3-flash-preview": { in: 0.5, out: 3, read: 0.05 },
  "gemini-4-hydrogen": { in: 1.5, out: 7.5, read: 0.075 },
  "gemini-4-argon": { in: 2, out: 10, read: 0.1 },
  "gemini-4-carbon": { in: 2, out: 10, read: 0.1 },
  "gemini-3.1-pro-preview": { in: 2, out: 12, read: 0.2 },
};
export interface GeminiUsage { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
export interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsage;
  modelVersion?: string;
}
/** what calls Gemini: replaced in tests; throws GeminiError when the API says no */
export interface GeminiModel { generate(model: string, body: unknown): Promise<GeminiReply> }
export class GeminiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
/** the price of the model's family when it isn't listed (a dated version of a listed one) */
const geminiPrice = (model: string) =>
  GEMINI_PRICE[model] ?? Object.entries(GEMINI_PRICE).find(([k]) => model.startsWith(k))?.[1] ?? GEMINI_PRICE[GEMINI_DEFAULT];
/** a Gemini reply in the same numbers as a Claude one: the prompt count includes the cached part, and thinking is billed as output */
export function geminiSpent(model: string, u: GeminiUsage = {}): Spent {
  const p = geminiPrice(model);
  const cached = u.cachedContentTokenCount ?? 0;
  const inputTokens = Math.max(0, (u.promptTokenCount ?? 0) - cached);
  const outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  return { inputTokens, outputTokens, cacheRead: cached, cacheWrite: 0, costUsd: (inputTokens * p.in + outputTokens * p.out + cached * p.read) / 1e6 };
}
function restGemini(key: string): GeminiModel {
  return {
    async generate(model, body) {
      let r: Response;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000), // a model stuck in a queue gives way to the next
        });
      } catch (e) {
        throw new GeminiError(0, `connection: ${(e as Error).message}`);
      }
      const j = (await r.json().catch(() => null)) as (GeminiReply & { error?: { status?: string; message?: string } }) | null;
      if (!r.ok) throw new GeminiError(r.status, `${r.status} ${j?.error?.status ?? ""} ${j?.error?.message ?? r.statusText}`.replace(/\s+/g, " ").trim());
      return j ?? {};
    },
  };
}

/** tokens and US dollars of one call, whichever AI answered */
export interface Spent { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number }
const claudeSpent = (u: Usage): Spent => ({
  inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, costUsd: costUsd(u),
});

/** one AI's answer: its text, and whether it finished, declined or was cut off */
interface Answer { model: string; text: string; stop: "done" | "refusal" | "cut"; why: string; spent: Spent }
/** an AI that couldn't answer at all (no credit, bad key, busy, down): the next one in the order is asked */
class Down extends Error {
  constructor(readonly provider: Provider, readonly model: string, readonly busy: boolean, message: string) { super(message); }
}

/** midnight in Thailand, the start of the "day" the allowance and budget count */
export function startOfDay(at = Date.now()) {
  const off = 7 * 3600_000;
  return new Date(Math.floor((at + off) / 86_400_000) * 86_400_000 - off);
}

/**
 * Turns a customer's words into pattern recipes (pattern-spec.ts) with Claude or
 * Gemini. The keys stay on the server (ANTHROPIC_API_KEY, GEMINI_API_KEY). The
 * admin picks which answers (one alone, or one first and the other when the
 * first can't). Every call is kept in ai_usage with its cost; the admin's
 * settings (/admin → ✨ AI) turn it on or off, set a customer's designs a day
 * and cap what the site spends a day.
 */
@Injectable()
export class AiPatternsService {
  private readonly log = new Logger("AiPatterns");
  private readonly model: PatternModel | null;
  private readonly gemini: GeminiModel | null;
  /** GEMINI_MODEL: one model, or several separated by commas tried in turn */
  readonly geminiModels = AiPatternsService.modelsOf(process.env.GEMINI_MODEL);
  static modelsOf(env?: string) {
    const list = (env ?? "").split(",").map(m => m.trim()).filter(Boolean);
    return list.length ? list : GEMINI_MODELS_DEFAULT;
  }

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {
    this.model = process.env.ANTHROPIC_API_KEY?.trim() ? new Anthropic().beta.messages : null;
    const gk = process.env.GEMINI_API_KEY?.trim();
    this.gemini = gk ? restGemini(gk) : null;
  }

  /** for tests: stand-ins for the AIs (null = that one has no key) */
  static withModels(m: { claude?: PatternModel | null; gemini?: GeminiModel | null }, prisma: PrismaService, settings: SettingsService) {
    const s = new AiPatternsService(prisma, settings) as unknown as { model: PatternModel | null; gemini: GeminiModel | null };
    s.model = m.claude ?? null;
    s.gemini = m.gemini ?? null;
    return s as unknown as AiPatternsService;
  }
  static withModel(model: PatternModel, prisma: PrismaService, settings: SettingsService) {
    return AiPatternsService.withModels({ claude: model }, prisma, settings);
  }

  private hasKey(p: Provider) { return p === "claude" ? !!this.model : !!this.gemini; }
  /** the AIs the admin's order asks for that have a key, first one first */
  private usable(cfg: AiConfig) { return providersOf(cfg.order ?? "claude>gemini").filter(p => this.hasKey(p)); }
  get keySet() { return !!this.model || !!this.gemini; }

  /** designs that came back today, for one customer */
  private usedToday(userId: string) {
    return this.prisma.aiUsage.count({ where: { userId, ok: true, createdAt: { gte: startOfDay() } } });
  }
  /** what everyone together has spent today, in US dollars */
  async spentToday() {
    const r = await this.prisma.aiUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: startOfDay() } } });
    return r._sum.costUsd ?? 0;
  }
  private overBudget(cfg: AiConfig, spentUsd: number) {
    return cfg.dailyBudgetThb > 0 && spentUsd * cfg.thbPerUsd >= cfg.dailyBudgetThb;
  }

  /** for the designer, before the customer types: can they design now, and how many are left */
  async quota(userId: string) {
    const cfg = await this.settings.ai();
    const [used, spent] = await Promise.all([this.usedToday(userId), this.spentToday()]);
    const closed = !this.usable(cfg).length || !cfg.enabled ? "off" : this.overBudget(cfg, spent) ? "budget" : null;
    return { enabled: !closed, closed, daily: cfg.dailyPerUser, remaining: Math.max(0, cfg.dailyPerUser - used) };
  }

  private async record(row: { userId: string; prompt: string; model?: string; ok: boolean; error?: string; patterns?: number; spent?: Spent; ms: number }) {
    const u = row.spent;
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId: row.userId, kind: "pattern", prompt: row.prompt.slice(0, 300), model: row.model, ok: row.ok, error: row.error?.slice(0, 300),
          patterns: row.patterns ?? 0, ms: row.ms,
          inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0,
          cacheRead: u?.cacheRead ?? 0, cacheWrite: u?.cacheWrite ?? 0,
          costUsd: u?.costUsd ?? 0,
        },
      });
    } catch (e) {
      // the customer still gets their patterns; the log has the numbers
      this.log.error(`could not keep the AI usage: ${(e as Error).message}`);
    }
  }

  private async askClaude(ask: string): Promise<Answer> {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.model!.create({
        model: AI_MODEL,
        max_tokens: 8000,
        // a declined request is tried on the fallback model Anthropic picks for its category
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: REPLY_JSON_SCHEMA } },
        system: [{ type: "text", text: PATTERN_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: ask }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) this.log.error("ANTHROPIC_API_KEY ใช้ไม่ได้");
      if (e instanceof Anthropic.APIError) throw new Down("claude", AI_MODEL, e instanceof Anthropic.RateLimitError, e.message);
      throw e;
    }
    const text = res.content.map(b => (b.type === "text" ? b.text : "")).join("");
    const stop = res.stop_reason === "refusal" ? "refusal" : res.stop_reason === "end_turn" ? "done" : "cut";
    return { model: res.model ?? AI_MODEL, text, stop, why: String(res.stop_reason), spent: claudeSpent(res.usage as Usage) };
  }

  private async askGemini(ask: string, model: string): Promise<Answer> {
    let res: GeminiReply;
    try {
      res = await this.gemini!.generate(model, {
        systemInstruction: { parts: [{ text: PATTERN_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: ask }] }],
        generationConfig: {
          maxOutputTokens: 16000,
          thinkingConfig: { thinkingLevel: "MEDIUM" },
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: REPLY_JSON_SCHEMA } },
        },
      });
    } catch (e) {
      if (e instanceof GeminiError) {
        if (e.status === 401 || e.status === 403) this.log.error("GEMINI_API_KEY ใช้ไม่ได้");
        throw new Down("gemini", model, e.status === 429 || e.status === 503, e.message);
      }
      throw e;
    }
    const c = res.candidates?.[0];
    const text = (c?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? "").join("");
    const blocked = res.promptFeedback?.blockReason;
    const why = blocked ? `blocked ${blocked}` : c?.finishReason ?? "no answer";
    // Google's safety filters and its other "won't" reasons are a refusal; out of room is cut off
    const stop = blocked || /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/.test(c?.finishReason ?? "") ? "refusal" : c?.finishReason === "STOP" ? "done" : "cut";
    const used = res.modelVersion || model;
    return { model: used, text, stop, why, spent: geminiSpent(used, res.usageMetadata) };
  }

  async design(userId: string, req: PatternRequest): Promise<{ patterns: PatternSpec[]; remaining: number }> {
    if (!this.keySet) throw new ServiceUnavailableException("ยังไม่ได้เปิดใช้ AI ออกแบบลาย (ต้องตั้ง ANTHROPIC_API_KEY หรือ GEMINI_API_KEY ใน .env ของ API)");
    const cfg = await this.settings.ai();
    const order = this.usable(cfg);
    if (!cfg.enabled || !order.length) throw new ServiceUnavailableException("AI ออกแบบลายปิดให้บริการชั่วคราว");
    const used = await this.usedToday(userId);
    if (used >= cfg.dailyPerUser) throw new HttpException(`ใช้ AI ออกแบบลายครบ ${cfg.dailyPerUser} ครั้งของวันนี้แล้ว — ลองใหม่พรุ่งนี้`, HttpStatus.TOO_MANY_REQUESTS);
    if (this.overBudget(cfg, await this.spentToday())) {
      this.log.warn(`daily budget ฿${cfg.dailyBudgetThb} reached`);
      throw new ServiceUnavailableException("AI ออกแบบลายมีผู้ใช้เต็มแล้วสำหรับวันนี้ — ลองใหม่พรุ่งนี้");
    }

    const count = Math.min(4, Math.max(1, req.count ?? 3));
    const garment = [req.body ? `body ${req.body}` : "", req.trim ? `trim ${req.trim}` : ""].filter(Boolean).join(", ");
    const ask = `Customer's request: ${req.prompt.trim()}\nGarment colours: ${garment || "not chosen yet"}\nGive ${count} different recipes.`;
    const base = { userId, prompt: req.prompt.trim() };

    // the first AI in the admin's order (for Gemini, each of its models in turn); the next only when it can't answer at all
    const tries = order.flatMap<{ p: Provider; m: string }>(p => (p === "claude" ? [{ p, m: AI_MODEL }] : this.geminiModels.map(m => ({ p, m }))));
    let ans: Answer | null = null, ms = 0, allBusy = true;
    for (const { p, m } of tries) {
      const t0 = Date.now();
      try {
        ans = await (p === "claude" ? this.askClaude(ask) : this.askGemini(ask, m));
        ms = Date.now() - t0;
        break;
      } catch (e) {
        if (!(e instanceof Down)) throw e;
        await this.record({ ...base, model: e.model, ok: false, error: e.message, ms: Date.now() - t0 });
        this.log.error(`${m} could not answer: ${e.message}`);
        allBusy &&= e.busy;
      }
    }
    if (!ans) throw new ServiceUnavailableException(allBusy ? "AI ยุ่งอยู่ ลองใหม่อีกครั้งในอีกสักครู่" : "AI ออกแบบลายใช้ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง");

    const { model, spent } = ans;
    if (ans.stop === "refusal") {
      await this.record({ ...base, model, ok: false, error: ans.why === "refusal" ? "refusal" : `refusal (${ans.why})`, spent, ms });
      throw new UnprocessableEntityException("AI ออกแบบลายนี้ให้ไม่ได้ — ลองเปลี่ยนคำอธิบาย (ไม่รับโลโก้หรือแบรนด์)");
    }
    let raw: unknown = null;
    try { raw = JSON.parse(ans.text); } catch { /* cut off or not JSON: no patterns */ }
    const patterns = readPatterns(raw);
    if (!patterns.length) {
      this.log.warn(`no usable pattern from ${model} (stop ${ans.why}, ${ans.text.length} chars)`);
      await this.record({ ...base, model, ok: false, error: `no usable pattern (${ans.why})`, spent, ms });
      throw new UnprocessableEntityException("AI ตอบกลับมาไม่สมบูรณ์ ลองอีกครั้ง");
    }
    // a design counts against the customer's allowance once it comes back
    await this.record({ ...base, model, ok: true, patterns: patterns.length, spent, ms });
    this.log.log(`${patterns.length} patterns from ${model} in ${ms} ms · in ${spent.inputTokens} (cache ${spent.cacheRead}) out ${spent.outputTokens} · $${spent.costUsd.toFixed(4)}`);
    return { patterns, remaining: Math.max(0, cfg.dailyPerUser - used - 1) };
  }

  // ---------- for the admin ----------
  /** today, the last 30 days, who uses it most and the latest calls */
  async report() {
    const cfg = await this.settings.ai();
    const today = startOfDay(), since = new Date(today.getTime() - 29 * 86_400_000);
    const [todayAgg, todayOk, todayUsers, rows, recent] = await Promise.all([
      this.prisma.aiUsage.aggregate({ _count: true, _sum: { costUsd: true }, where: { createdAt: { gte: today } } }),
      this.prisma.aiUsage.count({ where: { createdAt: { gte: today }, ok: true } }),
      this.prisma.aiUsage.groupBy({ by: ["userId"], where: { createdAt: { gte: today } } }),
      this.prisma.aiUsage.findMany({ where: { createdAt: { gte: since } }, select: { userId: true, ok: true, costUsd: true, createdAt: true } }),
      this.prisma.aiUsage.findMany({
        orderBy: { createdAt: "desc" }, take: 50,
        select: { id: true, createdAt: true, prompt: true, model: true, ok: true, error: true, patterns: true, inputTokens: true, outputTokens: true, cacheRead: true, costUsd: true, ms: true, user: { select: { email: true, fullName: true } } },
      }),
    ]);

    // by day (Thai days) and by customer, over 30 days
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(since.getTime() + i * 86_400_000);
      return { date: new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10), from: d.getTime(), calls: 0, ok: 0, costUsd: 0 };
    });
    const byUser = new Map<string, { calls: number; costUsd: number }>();
    for (const r of rows) {
      const i = Math.floor((r.createdAt.getTime() - since.getTime()) / 86_400_000);
      const d = days[i];
      if (d) { d.calls++; if (r.ok) d.ok++; d.costUsd += r.costUsd; }
      const k = r.userId ?? "", u = byUser.get(k) ?? { calls: 0, costUsd: 0 };
      u.calls++; u.costUsd += r.costUsd; byUser.set(k, u);
    }
    const topIds = [...byUser.entries()].sort((a, b) => b[1].costUsd - a[1].costUsd || b[1].calls - a[1].calls).slice(0, 10);
    const people = await this.prisma.user.findMany({ where: { id: { in: topIds.map(([id]) => id).filter(Boolean) } }, select: { id: true, email: true, fullName: true } });
    const who = new Map(people.map(p => [p.id, p]));

    const spentUsd = todayAgg._sum.costUsd ?? 0;
    const usable = this.usable(cfg);
    return {
      config: cfg,
      /** an AI in the admin's order has a key: customers can design */
      keySet: usable.length > 0,
      model: usable[0] === "gemini" ? this.geminiModels[0] : AI_MODEL,
      providers: [
        { id: "claude" as const, model: AI_MODEL, keySet: !!this.model, env: "ANTHROPIC_API_KEY" },
        { id: "gemini" as const, model: this.geminiModels.join(", "), keySet: !!this.gemini, env: "GEMINI_API_KEY" },
      ],
      today: { calls: todayAgg._count, ok: todayOk, users: todayUsers.length, costUsd: spentUsd, overBudget: this.overBudget(cfg, spentUsd) },
      month: { calls: rows.length, costUsd: rows.reduce((s, r) => s + r.costUsd, 0) },
      days: days.map(({ from: _from, ...d }) => d),
      topUsers: topIds.map(([id, u]) => ({ userId: id || null, email: who.get(id)?.email ?? "(ลบบัญชีแล้ว)", fullName: who.get(id)?.fullName ?? null, ...u })),
      recent,
    };
  }
}
