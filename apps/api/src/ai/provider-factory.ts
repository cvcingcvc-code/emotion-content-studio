import { MockContentAnalyzer, type ContentAnalyzer } from "../content/analyzer.js";
import { MockContentGenerator, type ContentGenerator } from "../content/generator.js";
import { DeepSeekContentAnalyzer } from "./deepseek-analyzer.js";
import { DeepSeekContentGenerator } from "./deepseek-generator.js";

import { createConfiguredJsonClient, fallbackOperation, type ProviderConfig, type ProviderDependencies } from "./provider-config.js";

export function createConfiguredContentGenerator(config: ProviderConfig, dependencies?: ProviderDependencies): ContentGenerator {
  const mock = new MockContentGenerator();
  if (config.AI_PROVIDER === "mock") return mock;
  const real = new DeepSeekContentGenerator(createConfiguredJsonClient(config, dependencies));
  return { generate: fallbackOperation(real.generate.bind(real), mock.generate.bind(mock), config.AI_FALLBACK !== "none") };
}

export function createConfiguredContentAnalyzer(config: ProviderConfig, dependencies?: ProviderDependencies): ContentAnalyzer {
  const mock = new MockContentAnalyzer();
  if (config.AI_PROVIDER === "mock") return mock;
  const real = new DeepSeekContentAnalyzer(createConfiguredJsonClient(config, dependencies));
  return { analyze: fallbackOperation(real.analyze.bind(real), mock.analyze.bind(mock), config.AI_FALLBACK !== "none") };
}
