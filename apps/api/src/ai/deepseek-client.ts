import { z, type ZodType } from "zod";
import { AiProviderError } from "./errors.js";
import type { AiCallOptions } from "./types.js";

const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

const DeepSeekEnvelopeSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().nullable().optional(),
            message: z
              .object({ content: z.string().nullable() })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export interface DeepSeekMessage {
  role: "system" | "user";
  content: string;
}

type Sleep = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export interface DeepSeekJsonClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxAttempts: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  sleep?: Sleep;
}

export interface DeepSeekCompletionOptions extends AiCallOptions {
  maxTokens?: number;
}

function abortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

const defaultSleep: Sleep = async (milliseconds, signal) => {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
};

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(2_000, Math.round(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(2_000, Math.max(0, date - Date.now()));
}

function isTemporaryNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(String(error.code));
}

export class DeepSeekJsonClient {
  readonly model: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;
  readonly #sleep: Sleep;

  constructor(options: DeepSeekJsonClientOptions) {
    if (!options.apiKey.trim()) throw new Error("DeepSeek API key is required");
    if (!options.model.trim()) throw new Error("DeepSeek model is required");
    if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 3) {
      throw new Error("DeepSeek maxAttempts must be between 1 and 3");
    }
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error("DeepSeek timeoutMs must be positive");
    }
    this.#apiKey = options.apiKey;
    this.model = options.model;
    this.#timeoutMs = options.timeoutMs;
    this.#maxAttempts = options.maxAttempts;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  async completeJson<T>(
    schema: ZodType<T>,
    messages: readonly DeepSeekMessage[],
    options: DeepSeekCompletionOptions = {},
  ): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      if (signal.aborted) {
        throw new AiProviderError({
          statusCode: options.signal?.aborted ? 499 : 504,
          code: options.signal?.aborted ? "AI_ABORTED" : "AI_TIMEOUT",
          message: options.signal?.aborted ? "AI 请求已取消" : "AI 服务响应超时，请稍后重试",
          provider: "deepseek",
          attempts: attempt,
        });
      }
      let response: Response;
      try {
        response = await this.#fetch(this.#endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.#apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            stream: false,
            response_format: { type: "json_object" },
            thinking: { type: "disabled" },
            max_tokens: options.maxTokens ?? 1_200,
          }),
          signal,
        });
      } catch (error) {
        if (signal.aborted) {
          if (options.signal?.aborted) {
            throw new AiProviderError({
              statusCode: 499,
              code: "AI_ABORTED",
              message: "AI 请求已取消",
              provider: "deepseek",
              attempts: attempt,
            });
          }
          throw new AiProviderError({
            statusCode: 504,
            code: "AI_TIMEOUT",
            message: "AI 服务响应超时，请稍后重试",
            provider: "deepseek",
            attempts: attempt,
          });
        }
        if (isTemporaryNetworkError(error) && attempt < this.#maxAttempts) {
          await this.#waitBeforeRetry(attempt, signal, undefined, options.signal);
          continue;
        }
        throw new AiProviderError({
          statusCode: 503,
          code: "AI_UNAVAILABLE",
          message: "AI 服务暂时不可用，请稍后重试",
          provider: "deepseek",
          attempts: attempt,
        });
      }

      if (!response.ok) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        if (response.status === 429) {
          if (attempt < this.#maxAttempts) {
            await this.#waitBeforeRetry(attempt, signal, retryAfter, options.signal);
            continue;
          }
          throw new AiProviderError({
            statusCode: 429,
            code: "AI_RATE_LIMITED",
            message: "AI 服务请求过于频繁，请稍后重试",
            provider: "deepseek",
            attempts: attempt,
            upstreamStatus: response.status,
          });
        }
        if (RETRYABLE_STATUSES.has(response.status)) {
          if (attempt < this.#maxAttempts) {
            await this.#waitBeforeRetry(attempt, signal, retryAfter, options.signal);
            continue;
          }
          throw new AiProviderError({
            statusCode: 503,
            code: "AI_UNAVAILABLE",
            message: "AI 服务暂时不可用，请稍后重试",
            provider: "deepseek",
            attempts: attempt,
            upstreamStatus: response.status,
          });
        }
        if (response.status === 401 || response.status === 403) {
          throw new AiProviderError({
            statusCode: 503,
            code: "AI_AUTH_ERROR",
            message: "AI 服务配置暂不可用",
            provider: "deepseek",
            attempts: attempt,
            upstreamStatus: response.status,
          });
        }
        throw new AiProviderError({
          statusCode: 502,
          code: "AI_UNAVAILABLE",
          message: "AI 服务暂时无法处理请求",
          provider: "deepseek",
          attempts: attempt,
          upstreamStatus: response.status,
        });
      }

      return this.#parseSuccessfulResponse(
        schema,
        response,
        attempt,
        signal,
        options.signal,
      );
    }

    throw new AiProviderError({
      statusCode: 503,
      code: "AI_UNAVAILABLE",
      message: "AI 服务暂时不可用，请稍后重试",
      provider: "deepseek",
      attempts: this.#maxAttempts,
    });
  }

  async #parseSuccessfulResponse<T>(
    schema: ZodType<T>,
    response: Response,
    attempts: number,
    signal: AbortSignal,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    let envelope: unknown;
    try {
      envelope = JSON.parse(await response.text());
    } catch {
      if (signal.aborted) {
        throw new AiProviderError({
          statusCode: callerSignal?.aborted ? 499 : 504,
          code: callerSignal?.aborted ? "AI_ABORTED" : "AI_TIMEOUT",
          message: callerSignal?.aborted ? "AI 请求已取消" : "AI 服务响应超时，请稍后重试",
          provider: "deepseek",
          attempts,
        });
      }
      throw this.#invalidResponse(attempts);
    }
    const parsedEnvelope = DeepSeekEnvelopeSchema.safeParse(envelope);
    if (!parsedEnvelope.success) throw this.#invalidResponse(attempts);
    const choice = parsedEnvelope.data.choices[0];
    if (!choice || choice.finish_reason !== "stop") throw this.#invalidResponse(attempts);
    const content = choice.message.content?.trim();
    if (!content) throw this.#invalidResponse(attempts);

    let candidate: unknown;
    try {
      candidate = JSON.parse(content);
    } catch {
      throw this.#invalidResponse(attempts);
    }
    const result = schema.safeParse(candidate);
    if (!result.success) throw this.#invalidResponse(attempts);
    return result.data;
  }

  async #waitBeforeRetry(
    attempt: number,
    signal: AbortSignal,
    retryAfter?: number,
    callerSignal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.#sleep(retryAfter ?? Math.min(1_000, 250 * 2 ** (attempt - 1)), signal);
    } catch {
      if (callerSignal?.aborted) {
        throw new AiProviderError({
          statusCode: 499,
          code: "AI_ABORTED",
          message: "AI 请求已取消",
          provider: "deepseek",
          attempts: attempt,
        });
      }
      if (signal.aborted) {
        throw new AiProviderError({
          statusCode: 504,
          code: "AI_TIMEOUT",
          message: "AI 服务响应超时，请稍后重试",
          provider: "deepseek",
          attempts: attempt,
        });
      }
      throw new AiProviderError({
        statusCode: 503,
        code: "AI_UNAVAILABLE",
        message: "AI 服务暂时不可用，请稍后重试",
        provider: "deepseek",
        attempts: attempt,
      });
    }
  }

  #invalidResponse(attempts: number): AiProviderError {
    return new AiProviderError({
      statusCode: 502,
      code: "AI_INVALID_RESPONSE",
      message: "AI 服务返回了无法验证的结果，请重试",
      provider: "deepseek",
      attempts,
    });
  }
}
