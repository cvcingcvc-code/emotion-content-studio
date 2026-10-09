import type { ZodType } from "zod";
import { AiProviderError } from "./errors.js";
import type { JsonClient, JsonCompletionOptions } from "./types.js";
import { usageId, type UsageRecorder } from "./usage.js";

export interface CompatibleClientOptions {
  apiKey: string; model: string; baseUrl: string; provider: "deepseek" | "openai-compatible";
  allowCalls: boolean; timeoutMs: number; maxAttempts: number;
  fetchImpl?: typeof fetch; recordUsage?: UsageRecorder;
  inputPricePerMillion?: number | undefined; outputPricePerMillion?: number | undefined; currency?: string;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
function tokens(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export class OpenAiCompatibleJsonClient implements JsonClient {
  readonly provider: "deepseek" | "openai-compatible";
  readonly model: string;
  private readonly endpoint: string;
  constructor(private readonly config: CompatibleClientOptions) {
    const url = new URL(config.baseUrl);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("AI_BASE_URL requires HTTPS or local HTTP without embedded credentials");
    if (!config.apiKey.trim() || !config.model.trim()) throw new Error("Provider credentials and model are required");
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > 3 || config.timeoutMs <= 0) throw new Error("Invalid AI retry/timeout configuration");
    this.provider = config.provider; this.model = config.model;
    this.endpoint = url.href.replace(/\/+$/, "") + "/chat/completions";
  }
  private error(code: string, attempts: number, upstreamStatus?: number): AiProviderError {
    const messages: Record<string, string> = { AI_CALLS_DISABLED: "收费模型调用未启用，请先明确配置或使用 mock。", AI_TIMEOUT: "AI 请求超时，请稍后重试。", AI_ABORTED: "AI 请求已取消。", AI_AUTH_ERROR: "AI 服务认证配置不可用。", AI_RATE_LIMITED: "AI 服务限流，请稍后重试。", AI_INVALID_RESPONSE: "AI 返回结果未通过结构校验。", AI_UNAVAILABLE: "AI 服务暂时不可用。", AI_USAGE_STORAGE_ERROR: "调用记录无法保存，请检查本地存储。" };
    return new AiProviderError({ code, message: messages[code] ?? "AI 服务暂时不可用。", statusCode: code === "AI_ABORTED" ? 499 : code === "AI_TIMEOUT" ? 504 : code === "AI_RATE_LIMITED" ? 429 : code === "AI_INVALID_RESPONSE" ? 502 : 503, provider: this.provider, attempts, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) });
  }
  async completeJson<T>(schema: ZodType<T>, messages: readonly { role: "system" | "user"; content: string }[], options: JsonCompletionOptions = {}): Promise<T> {
    const start = Date.now(), id = usageId(); let attempts = 0, inputTokens: number | null = null, outputTokens: number | null = null, outcome: "success" | "failure" | "blocked" = "failure", errorCode: string | null = null;
    try {
      if (!this.config.allowCalls) { outcome = "blocked"; throw this.error("AI_CALLS_DISABLED", 0); }
      for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
        if (options.signal?.aborted) throw this.error("AI_ABORTED", attempts);
        attempts = attempt;
        const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(this.config.timeoutMs)]) : AbortSignal.timeout(this.config.timeoutMs);
        try {
          const response = await (this.config.fetchImpl ?? fetch)(this.endpoint, { method: "POST", signal, headers: { authorization: "Bearer " + this.config.apiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ model: this.model, messages, stream: false, response_format: { type: "json_object" }, max_tokens: options.maxTokens ?? 2200 }) });
          if (!response.ok) throw this.error(response.status === 401 || response.status === 403 ? "AI_AUTH_ERROR" : response.status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE", attempt, response.status);
          let raw: unknown;
          try { raw = await response.json(); } catch { throw this.error("AI_INVALID_RESPONSE", attempt); }
          if (signal.aborted) throw this.error(options.signal?.aborted ? "AI_ABORTED" : "AI_TIMEOUT", attempt);
          const envelope = raw as { choices?: { finish_reason?: string; message?: { content?: string } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null;
          inputTokens = tokens(envelope?.usage?.prompt_tokens); outputTokens = tokens(envelope?.usage?.completion_tokens);
          const choice = envelope?.choices?.[0];
          if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") throw this.error("AI_INVALID_RESPONSE", attempt);
          let candidate: unknown;
          try { candidate = JSON.parse(choice.message.content); } catch { throw this.error("AI_INVALID_RESPONSE", attempt); }
          const parsed = schema.safeParse(candidate); if (!parsed.success) throw this.error("AI_INVALID_RESPONSE", attempt);
          outcome = "success"; return parsed.data;
        } catch (caught) {
          const error = signal.aborted ? this.error(options.signal?.aborted ? "AI_ABORTED" : "AI_TIMEOUT", attempt) : caught instanceof AiProviderError ? caught : this.error("AI_UNAVAILABLE", attempt);
          const retryable = ["AI_TIMEOUT", "AI_RATE_LIMITED"].includes(error.code) || error.code === "AI_UNAVAILABLE" && (error.upstreamStatus === undefined || error.upstreamStatus >= 500);
          if (!retryable || attempt === this.config.maxAttempts) throw error;
          const wait = this.config.sleep ?? ((ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => { if (signal?.aborted) { reject(this.error("AI_ABORTED", attempt)); return; } const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms); const abort = () => { clearTimeout(timer); reject(this.error("AI_ABORTED", attempt)); }; signal?.addEventListener("abort", abort, { once: true }); }));
          await wait(Math.min(1000, 250 * 2 ** (attempt - 1)), options.signal);
        }
      }
      throw this.error("AI_UNAVAILABLE", attempts);
    } catch (caught) { const error = caught instanceof AiProviderError ? caught : this.error("AI_UNAVAILABLE", attempts); errorCode = error.code; throw error; }
    finally {
      const estimate = inputTokens !== null && outputTokens !== null && this.config.inputPricePerMillion !== undefined && this.config.outputPricePerMillion !== undefined ? (inputTokens * this.config.inputPricePerMillion + outputTokens * this.config.outputPricePerMillion) / 1_000_000 : null;
      try { this.config.recordUsage?.({ id, createdAt: new Date().toISOString(), provider: this.provider, model: this.model, outcome, attempts, durationMs: Date.now() - start, inputTokens, outputTokens, estimatedCost: estimate, currency: this.config.currency ?? "USD", errorCode }); }
      catch { throw this.error("AI_USAGE_STORAGE_ERROR", attempts); }
    }
  }
}
export function canFallback(error: unknown) { return error instanceof AiProviderError && ["AI_TIMEOUT", "AI_UNAVAILABLE", "AI_RATE_LIMITED", "AI_INVALID_RESPONSE"].includes(error.code); }
