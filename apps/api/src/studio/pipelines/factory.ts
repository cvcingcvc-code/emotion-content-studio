import type { AiProvider } from "@emotion-studio/contracts";
import { DeepSeekJsonClient } from "../../ai/deepseek-client.js";
import {
  DeepSeekEmotionAnalyzer,
  DeepSeekEmotionGenerator,
  DeepSeekEnglish50Generator,
  DeepSeekGrowthAnalyzer,
  DeepSeekGrowthGenerator,
} from "./deepseek-pipelines.js";
import { createMockPipelines } from "./mock-pipelines.js";
import type { PipelineRegistry } from "./types.js";

export interface PipelineProviderConfig {
  AI_PROVIDER: AiProvider;
  DEEPSEEK_API_KEY?: string | undefined;
  DEEPSEEK_MODEL: string;
  AI_TIMEOUT_MS: number;
  AI_MAX_ATTEMPTS: number;
}

export function createConfiguredPipelines(config: PipelineProviderConfig): PipelineRegistry {
  if (config.AI_PROVIDER === "mock") return createMockPipelines();
  if (!config.DEEPSEEK_API_KEY?.trim()) {
    throw new Error("DEEPSEEK_API_KEY is required when AI_PROVIDER=deepseek");
  }

  const client = new DeepSeekJsonClient({
    apiKey: config.DEEPSEEK_API_KEY,
    model: config.DEEPSEEK_MODEL,
    timeoutMs: config.AI_TIMEOUT_MS,
    maxAttempts: config.AI_MAX_ATTEMPTS,
  });
  return {
    growthAnalyzer: new DeepSeekGrowthAnalyzer(client),
    growthGenerator: new DeepSeekGrowthGenerator(client),
    englishGenerator: new DeepSeekEnglish50Generator(client),
    emotionAnalyzer: new DeepSeekEmotionAnalyzer(client),
    emotionGenerator: new DeepSeekEmotionGenerator(client),
  };
}
