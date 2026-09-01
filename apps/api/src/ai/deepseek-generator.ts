import {
  GeneratedDraftSchema,
  type GeneratedDraft,
} from "@emotion-studio/contracts";
import type {
  ContentGenerator,
  GenerateContentInput,
} from "../content/generator.js";
import { DeepSeekJsonClient } from "./deepseek-client.js";
import type { AiCallOptions, AiResult } from "./types.js";

export class DeepSeekContentGenerator implements ContentGenerator {
  constructor(private readonly client: DeepSeekJsonClient) {}

  async generate(
    input: GenerateContentInput,
    options?: AiCallOptions,
  ): Promise<AiResult<GeneratedDraft>> {
    const items = input.items.map(({ content, emotion, category, tags }) => ({
      content,
      emotion,
      category,
      tags,
    }));
    const data = await this.client.completeJson(
      GeneratedDraftSchema,
      [
        {
          role: "system",
          content: [
            "你是中文原创情感内容编辑。参考主题和感受重新创作，不得照抄输入句子。",
            "只返回一个 JSON 对象，不要解释或使用 Markdown。",
            "title 为 1-80 字；body 为 200-400 字；hashtags 为 1-8 个以 # 开头的短标签。",
            '示例：{"title":"允许自己慢一点","body":"这里应是一段 200 到 400 字的原创正文。","hashtags":["#情绪","#成长"]}',
            "所有结果都是待人工审核的草稿。",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ items }) },
      ],
      { ...options, maxTokens: 1_200 },
    );
    return { data, provider: "deepseek", model: this.client.model };
  }
}
