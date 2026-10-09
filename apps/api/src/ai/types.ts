import type { AiProvider } from "@emotion-studio/contracts";
import type { ZodType } from "zod";
export interface JsonCompletionOptions extends AiCallOptions { maxTokens?: number; }
export interface JsonClient {
  readonly model: string;
  readonly provider: AiProvider;
  completeJson<T>(schema: ZodType<T>, messages: readonly { role: "system" | "user"; content: string }[], options?: JsonCompletionOptions): Promise<T>;
}

export interface AiCallOptions {
  signal?: AbortSignal;
}

export interface AiResult<T> {
  data: T;
  provider: AiProvider;
  model: string;
}
