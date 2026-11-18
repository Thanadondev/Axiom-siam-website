import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService, type AiConfig } from "../settings/settings.service";
import { PATTERN_SYSTEM, readPatterns, REPLY_JSON_SCHEMA, type PatternSpec } from "./pattern-spec";

export interface PatternRequest {
  prompt: string;
  /** the garment's colours, for a request that names none */
  body?: string;
  trim?: string;
  count?: number;
}

/** what calls Claude: replaced in tests */
export type PatternModel = Pick<Anthropic["beta"]["messages"], "create">;

export const AI_MODEL = "claude-opus-5-5";
/** US dollars per million tokens (Claude Opus 5.5): input, output, cache read, cache write (5 min) */
const PRICE = { in: 4, out: 20, read: 0.2, write: 5 };

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
/** what a reply cost, in US dollars (input_tokens leaves out the cached part, which is billed on its own) */
export function costUsd(u: Usage) {
  return (u.input_tokens * PRICE.in + u.output_tokens * PRICE.out + (u.cache_read_input_tokens ?? 0) * PRICE.read + (u.cache_creation_input_tokens ?? 0) * PRICE.write) / 1e6;
}

/** midnight in Thailand, the start of the "day" the allowance and budget count */
export function startOfDay(at = Date.now()) {
  const off = 7 * 3600_000;
  return new Date(Math.floor((at + off) / 86_400_000) * 86_400_000 - off);
}

/**
 * Turns a customer's words into pattern recipes (pattern-spec.ts) with Claude.
 * The key stays on the server (ANTHROPIC_API_KEY). Every call is kept in
 * ai_usage with its cost; the admin's settings (/admin → ✨ AI) turn it on or
 * off, set a customer's designs a day and cap what the site spends a day.
 */
@Injectable()
export class AiPatternsService {
  private readonly log = new Logger("AiPatterns");
  private readonly model: PatternModel | null;

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {
    this.model = process.env.ANTHROPIC_API_KEY?.trim() ? new Anthropic().beta.messages : null;
  }

  /** for tests: a stand-in for Claude */
  static withModel(model: PatternModel, prisma: PrismaService, settings: SettingsService) {
    const s = new AiPatternsService(prisma, settings);
    (s as unknown as { model: PatternModel }).model = model;
    return s;
  }

  get keySet() { return !!this.model; }

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

  async quota(userId: string) {
    const cfg = await this.settings.ai();
    const used = await this.usedToday(userId);
    return { enabled: cfg.enabled && this.keySet, daily: cfg.dailyPerUser, remaining: Math.max(0, cfg.dailyPerUser - used) };
  }

  private async record(row: { userId: string; prompt: string; model?: string; ok: boolean; error?: string; patterns?: number; usage?: Usage; ms: number }) {
    const u = row.usage;
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId: row.userId, kind: "pattern", prompt: row.prompt.slice(0, 300), model: row.model, ok: row.ok, error: row.error?.slice(0, 300),
          patterns: row.patterns ?? 0, ms: row.ms,
          inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0,
          cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0,
          costUsd: u ? costUsd(u) : 0,
        },
      });
    } catch (e) {
      // the customer still gets their patterns; the log has the numbers
      this.log.error(`could not keep the AI usage: ${(e as Error).message}`);
    }
  }

  async design(userId: string, req: PatternRequest): Promise<{ patterns: PatternSpec[]; remaining: number }> {
    if (!this.model) throw new ServiceUnavailableException("ยังไม่ได้เปิดใช้ AI ออกแบบลาย (ต้องตั้ง ANTHROPIC_API_KEY ใน .env ของ API)");
    const cfg = await this.settings.ai();
    if (!cfg.enabled) throw new ServiceUnavailableException("AI ออกแบบลายปิดให้บริการชั่วคราว");
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

    const t0 = Date.now();
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.model.create({
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
      const ms = Date.now() - t0;
      if (e instanceof Anthropic.APIError) await this.record({ ...base, ok: false, error: `${e.status ?? ""} ${e.message}`.trim(), ms });
      if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException("AI ยุ่งอยู่ ลองใหม่อีกครั้งในอีกสักครู่");
      if (e instanceof Anthropic.AuthenticationError) { this.log.error("ANTHROPIC_API_KEY ใช้ไม่ได้"); throw new ServiceUnavailableException("AI ออกแบบลายใช้ไม่ได้ชั่วคราว"); }
      if (e instanceof Anthropic.APIError) { this.log.error(`Claude ${e.status}: ${e.message}`); throw new ServiceUnavailableException("AI ออกแบบลายใช้ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง"); }
      throw e;
    }
    const ms = Date.now() - t0, us = res.usage as Usage, model = res.model ?? AI_MODEL;
    if (res.stop_reason === "refusal") {
      await this.record({ ...base, model, ok: false, error: "refusal", usage: us, ms });
      throw new UnprocessableEntityException("AI ออกแบบลายนี้ให้ไม่ได้ — ลองเปลี่ยนคำอธิบาย (ไม่รับโลโก้หรือแบรนด์)");
    }

    const text = res.content.map(b => (b.type === "text" ? b.text : "")).join("");
    let raw: unknown = null;
    try { raw = JSON.parse(text); } catch { /* cut off or not JSON: no patterns */ }
    const patterns = readPatterns(raw);
    if (!patterns.length) {
      this.log.warn(`no usable pattern (stop ${res.stop_reason}, ${text.length} chars)`);
      await this.record({ ...base, model, ok: false, error: `no usable pattern (${res.stop_reason})`, usage: us, ms });
      throw new UnprocessableEntityException("AI ตอบกลับมาไม่สมบูรณ์ ลองอีกครั้ง");
    }
    // a design counts against the customer's allowance once it comes back
    await this.record({ ...base, model, ok: true, patterns: patterns.length, usage: us, ms });
    this.log.log(`${patterns.length} patterns in ${ms} ms · in ${us.input_tokens} (cache ${us.cache_read_input_tokens ?? 0}) out ${us.output_tokens} · $${costUsd(us).toFixed(4)}`);
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
    return {
      config: cfg,
      keySet: this.keySet,
      model: AI_MODEL,
      today: { calls: todayAgg._count, ok: todayOk, users: todayUsers.length, costUsd: spentUsd, overBudget: this.overBudget(cfg, spentUsd) },
      month: { calls: rows.length, costUsd: rows.reduce((s, r) => s + r.costUsd, 0) },
      days: days.map(({ from: _from, ...d }) => d),
      topUsers: topIds.map(([id, u]) => ({ userId: id || null, email: who.get(id)?.email ?? "(ลบบัญชีแล้ว)", fullName: who.get(id)?.fullName ?? null, ...u })),
      recent,
    };
  }
}
