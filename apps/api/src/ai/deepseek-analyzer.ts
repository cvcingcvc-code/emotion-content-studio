import {
  ContentAnalysisSchema,
  type ContentAnalysis,
} from "@emotion-studio/contracts";
import type {
  AnalyzeContentInput,
  ContentAnalyzer,
} from "../content/analyzer.js";
import { DeepSeekJsonClient } from "./deepseek-client.js";
import type { AiCallOptions, AiResult } from "./types.js";

export class DeepSeekContentAnalyzer implements ContentAnalyzer {
  constructor(private readonly client: DeepSeekJsonClient) {}

  async analyze(
    input: AnalyzeContentInput,
    options?: AiCallOptions,
  ): Promise<AiResult<ContentAnalysis>> {
    const data = await this.client.completeJson(
      ContentAnalysisSchema,
      [
        {
          role: "system",
          content: [
            "你是中文情感内容分析器。只返回一个 JSON 对象，不要解释或使用 Markdown。",
            "emotion 只能是：开心、难过、遗憾、孤独、爱情、治愈、愤怒、其他。",
            "category 只能是：爱情、友情、家庭、成长、孤独、生活、其他。",
            "emotionScore 和 resonanceScore 是 0-100 的整数；tags 是最多 8 个短标签。",
            '示例：{"emotion":"治愈","emotionScore":82,"resonanceScore":78,"category":"成长","tags":["自我照顾"]}',
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ content: input.content, likes: input.likes }),
        },
      ],
      { ...options, maxTokens: 500 },
    );
    return { data, provider: "deepseek", model: this.client.model };
  }
}
