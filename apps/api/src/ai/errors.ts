import type { AiProvider } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";

export class AiProviderError extends AppError {
  readonly provider: AiProvider;
  readonly upstreamStatus?: number;
  readonly attempts: number;

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    provider: AiProvider;
    attempts: number;
    upstreamStatus?: number;
  }) {
    super(options.statusCode, options.code, options.message);
    this.name = "AiProviderError";
    this.provider = options.provider;
    this.attempts = options.attempts;
    if (options.upstreamStatus !== undefined) {
      this.upstreamStatus = options.upstreamStatus;
    }
  }
}
