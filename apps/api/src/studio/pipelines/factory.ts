import { createConfiguredJsonClient, fallbackOperation, type ProviderConfig, type ProviderDependencies } from "../../ai/provider-config.js";
import {
  DeepSeekEmotionAnalyzer,
  DeepSeekEmotionGenerator,
  DeepSeekEnglish50Generator,
  DeepSeekGrowthAnalyzer,
  DeepSeekGrowthGenerator,
} from "./deepseek-pipelines.js";
import { createMockPipelines } from "./mock-pipelines.js";
import type { PipelineRegistry } from "./types.js";

export type PipelineProviderConfig = ProviderConfig;

export function createConfiguredPipelines(config: PipelineProviderConfig, dependencies?: ProviderDependencies): PipelineRegistry {
  const mock = createMockPipelines();
  if (config.AI_PROVIDER === "mock") return mock;
  const client = createConfiguredJsonClient(config, dependencies);
  const enabled = config.AI_FALLBACK !== "none";
  const growthAnalyzer = new DeepSeekGrowthAnalyzer(client), growthGenerator = new DeepSeekGrowthGenerator(client), englishGenerator = new DeepSeekEnglish50Generator(client), emotionAnalyzer = new DeepSeekEmotionAnalyzer(client), emotionGenerator = new DeepSeekEmotionGenerator(client);
  return {
    growthAnalyzer: { analyze: fallbackOperation(growthAnalyzer.analyze.bind(growthAnalyzer), mock.growthAnalyzer.analyze.bind(mock.growthAnalyzer), enabled) },
    growthGenerator: { generate: fallbackOperation(growthGenerator.generate.bind(growthGenerator), mock.growthGenerator.generate.bind(mock.growthGenerator), enabled) },
    englishGenerator: { generate: fallbackOperation(englishGenerator.generate.bind(englishGenerator), mock.englishGenerator.generate.bind(mock.englishGenerator), enabled) },
    emotionAnalyzer: { analyze: fallbackOperation(emotionAnalyzer.analyze.bind(emotionAnalyzer), mock.emotionAnalyzer.analyze.bind(mock.emotionAnalyzer), enabled) },
    emotionGenerator: { generate: fallbackOperation(emotionGenerator.generate.bind(emotionGenerator), mock.emotionGenerator.generate.bind(mock.emotionGenerator), enabled) },
  };
}
