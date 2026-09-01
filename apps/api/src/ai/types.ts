import type { AiProvider } from "@emotion-studio/contracts";

export interface AiCallOptions {
  signal?: AbortSignal;
}

export interface AiResult<T> {
  data: T;
  provider: AiProvider;
  model: string;
}
