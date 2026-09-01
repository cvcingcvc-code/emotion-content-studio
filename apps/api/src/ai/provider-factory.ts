import type { ServerConfig } from "../config.js";
import { MockContentAnalyzer, type ContentAnalyzer } from "../content/analyzer.js";
import { MockContentGenerator, type ContentGenerator } from "../content/generator.js";
import { DeepSeekContentAnalyzer } from "./deepseek-analyzer.js";
import { DeepSeekJsonClient } from "./deepseek-client.js";
import { DeepSeekContentGenerator } from "./deepseek-generator.js";

type AiConfig = Pick<
  ServerConfig,
  "AI_PROVIDER" | "DEEPSEEK_API_KEY" | "DEEPSEEK_MODEL" | "AI_TIMEOUT_MS" | "AI_MAX_ATTEMPTS"
>;

function createDeepSeekClient(config: AiConfig): DeepSeekJsonClient {
  if (!config.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is required when AI_PROVIDER=deepseek");
  }
  return new DeepSeekJsonClient({
    apiKey: config.DEEPSEEK_API_KEY,
    model: config.DEEPSEEK_MODEL,
    timeoutMs: config.AI_TIMEOUT_MS,
    maxAttempts: config.AI_MAX_ATTEMPTS,
  });
}

export function createConfiguredContentGenerator(config: AiConfig): ContentGenerator {
  return config.AI_PROVIDER === "deepseek"
    ? new DeepSeekContentGenerator(createDeepSeekClient(config))
    : new MockContentGenerator();
}

export function createConfiguredContentAnalyzer(config: AiConfig): ContentAnalyzer {
  return config.AI_PROVIDER === "deepseek"
    ? new DeepSeekContentAnalyzer(createDeepSeekClient(config))
    : new MockContentAnalyzer();
}
