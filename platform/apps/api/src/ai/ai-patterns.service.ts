import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
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

/**
 * Turns a customer's words into pattern recipes (pattern-spec.ts) with Claude.
 * The key stays on the server (ANTHROPIC_API_KEY); each customer gets a number
 * of designs a day (AI_PATTERN_DAILY, 20 unless set).
 */
@Injectable()
export class AiPatternsService {
  private readonly log = new Logger("AiPatterns");
  private readonly model: PatternModel | null;
  readonly daily = Math.max(0, Number(process.env.AI_PATTERN_DAILY ?? 20) || 0);
  private readonly used = new Map<string, { day: string; n: number }>();

  constructor() {
    this.model = process.env.ANTHROPIC_API_KEY?.trim() ? new Anthropic().beta.messages : null;
  }

  /** for tests: a stand-in for Claude */
  static withModel(model: PatternModel) {
    const s = new AiPatternsService();
    (s as unknown as { model: PatternModel }).model = model;
    return s;
  }

  private today() { return new Date().toISOString().slice(0, 10); }
  remaining(userId: string) {
    const u = this.used.get(userId);
    return Math.max(0, this.daily - (u && u.day === this.today() ? u.n : 0));
  }

  async design(userId: string, req: PatternRequest): Promise<{ patterns: PatternSpec[]; remaining: number }> {
    if (!this.model) throw new ServiceUnavailableException("ยังไม่ได้เปิดใช้ AI ออกแบบลาย (ต้องตั้ง ANTHROPIC_API_KEY ใน .env ของ API)");
    if (this.remaining(userId) <= 0) throw new HttpException(`ใช้ AI ออกแบบลายครบ ${this.daily} ครั้งของวันนี้แล้ว — ลองใหม่พรุ่งนี้`, HttpStatus.TOO_MANY_REQUESTS);
    const count = Math.min(4, Math.max(1, req.count ?? 3));
    const garment = [req.body ? `body ${req.body}` : "", req.trim ? `trim ${req.trim}` : ""].filter(Boolean).join(", ");
    const ask = `Customer's request: ${req.prompt.trim()}\nGarment colours: ${garment || "not chosen yet"}\nGive ${count} different recipes.`;

    const t0 = Date.now();
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.model.create({
        model: "claude-opus-5-5",
        max_tokens: 8000,
        // a declined request is tried on the fallback model Anthropic picks for its category
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: REPLY_JSON_SCHEMA } },
        system: [{ type: "text", text: PATTERN_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: ask }],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException("AI ยุ่งอยู่ ลองใหม่อีกครั้งในอีกสักครู่");
      if (e instanceof Anthropic.AuthenticationError) { this.log.error("ANTHROPIC_API_KEY ใช้ไม่ได้"); throw new ServiceUnavailableException("AI ออกแบบลายใช้ไม่ได้ชั่วคราว"); }
      if (e instanceof Anthropic.APIError) { this.log.error(`Claude ${e.status}: ${e.message}`); throw new ServiceUnavailableException("AI ออกแบบลายใช้ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง"); }
      throw e;
    }
    if (res.stop_reason === "refusal") throw new UnprocessableEntityException("AI ออกแบบลายนี้ให้ไม่ได้ — ลองเปลี่ยนคำอธิบาย (ไม่รับโลโก้หรือแบรนด์)");

    const text = res.content.map(b => (b.type === "text" ? b.text : "")).join("");
    let raw: unknown = null;
    try { raw = JSON.parse(text); } catch { /* cut off or not JSON: no patterns */ }
    const patterns = readPatterns(raw);
    if (!patterns.length) {
      this.log.warn(`no usable pattern (stop ${res.stop_reason}, ${text.length} chars)`);
      throw new UnprocessableEntityException("AI ตอบกลับมาไม่สมบูรณ์ ลองอีกครั้ง");
    }
    // a design counts once it comes back
    const day = this.today(), u = this.used.get(userId);
    this.used.set(userId, { day, n: (u && u.day === day ? u.n : 0) + 1 });
    const us = res.usage;
    this.log.log(`${patterns.length} patterns in ${Date.now() - t0} ms · in ${us.input_tokens} (cache ${us.cache_read_input_tokens ?? 0}) out ${us.output_tokens}`);
    return { patterns, remaining: this.remaining(userId) };
  }
}
