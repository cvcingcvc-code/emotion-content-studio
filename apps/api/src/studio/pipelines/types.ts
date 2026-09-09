import type {
  EmotionAnalysis,
  EmotionPostPackage,
  English50Package,
  GrowthAnalysis,
  GrowthPostPackage,
  TruthAnchor,
} from "@emotion-studio/contracts";
import type { AiCallOptions, AiResult } from "../../ai/types.js";

export interface GrowthAnalyzeInput {
  content: string;
  truthAnchors: readonly TruthAnchor[];
}

export interface GrowthGenerateInput {
  analysis: GrowthAnalysis;
}

export interface EnglishGenerateInput {
  topic: string;
  audience?: string;
}

export interface EmotionAnalyzeInput {
  content: string;
}

export interface EmotionGenerateInput {
  /** Only normalized themes are accepted. Raw source text and source metadata stay outside this boundary. */
  themes: readonly EmotionAnalysis[];
}

export interface AsyncAnalyzer<TInput, TOutput> {
  analyze(input: TInput, options?: AiCallOptions): Promise<AiResult<TOutput>>;
}

export interface AsyncGenerator<TInput, TOutput> {
  generate(input: TInput, options?: AiCallOptions): Promise<AiResult<TOutput>>;
}

export type GrowthAnalyzer = AsyncAnalyzer<GrowthAnalyzeInput, GrowthAnalysis>;
export type GrowthGenerator = AsyncGenerator<GrowthGenerateInput, GrowthPostPackage>;
export type EnglishGenerator = AsyncGenerator<EnglishGenerateInput, English50Package>;
export type EmotionAnalyzer = AsyncAnalyzer<EmotionAnalyzeInput, EmotionAnalysis>;
export type EmotionGenerator = AsyncGenerator<EmotionGenerateInput, EmotionPostPackage>;

export interface PipelineRegistry {
  growthAnalyzer: GrowthAnalyzer;
  growthGenerator: GrowthGenerator;
  englishGenerator: EnglishGenerator;
  emotionAnalyzer: EmotionAnalyzer;
  emotionGenerator: EmotionGenerator;
}
