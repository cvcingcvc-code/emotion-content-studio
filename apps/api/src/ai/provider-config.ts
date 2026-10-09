import { resolve } from "node:path";
import type { ServerConfig } from "../config.js";
import { projectRoot } from "../content/repository-factory.js";
import { OpenAiCompatibleJsonClient, canFallback } from "./openai-compatible-client.js";
import { jsonlUsageRecorder, type UsageRecorder } from "./usage.js";

export type ProviderConfig = Pick<ServerConfig, "AI_PROVIDER" | "DEEPSEEK_MODEL" | "AI_TIMEOUT_MS" | "AI_MAX_ATTEMPTS"> & Partial<Pick<ServerConfig, "DEEPSEEK_API_KEY" | "AI_API_KEY" | "AI_MODEL" | "AI_BASE_URL" | "AI_ALLOW_PAID_CALLS" | "AI_FALLBACK" | "AI_USAGE_PATH" | "AI_INPUT_PRICE_PER_MILLION" | "AI_OUTPUT_PRICE_PER_MILLION" | "AI_COST_CURRENCY">>;
export interface ProviderDependencies { fetchImpl?: typeof fetch; recordUsage?: UsageRecorder; }
export function configuredUsagePath(config: Pick<ProviderConfig, "AI_USAGE_PATH">) { return resolve(projectRoot, config.AI_USAGE_PATH ?? "data/ai-usage.jsonl"); }
export function createConfiguredJsonClient(config: ProviderConfig, dependencies: ProviderDependencies = {}) {
  if (config.AI_PROVIDER === "mock") throw new Error("Mock does not need a network client");
  return new OpenAiCompatibleJsonClient({
    apiKey: (config.AI_PROVIDER === "deepseek" ? config.DEEPSEEK_API_KEY : config.AI_API_KEY) ?? "",
    model: config.AI_PROVIDER === "deepseek" ? config.DEEPSEEK_MODEL : config.AI_MODEL ?? "",
    baseUrl: config.AI_PROVIDER === "deepseek" ? "https://api.deepseek.com" : config.AI_BASE_URL ?? "https://api.openai.com/v1",
    provider: config.AI_PROVIDER, allowCalls: config.AI_ALLOW_PAID_CALLS ?? false,
    timeoutMs: config.AI_TIMEOUT_MS, maxAttempts: config.AI_MAX_ATTEMPTS,
    recordUsage: dependencies.recordUsage ?? jsonlUsageRecorder(configuredUsagePath(config)),
    inputPricePerMillion: config.AI_INPUT_PRICE_PER_MILLION, outputPricePerMillion: config.AI_OUTPUT_PRICE_PER_MILLION,
    currency: config.AI_COST_CURRENCY ?? "USD", ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
  });
}
export function fallbackOperation<Args extends unknown[], Result>(real: (...args: Args) => Promise<Result>, mock: (...args: Args) => Promise<Result>, enabled: boolean) {
  return async (...args: Args): Promise<Result> => {
    try { return await real(...args); }
    catch (error) { if (enabled && canFallback(error)) return mock(...args); throw error; }
  };
}
