import {
  GeneratedDraftSchema,
  type ContentItem,
  type GeneratedDraft,
} from "@emotion-studio/contracts";
import type { AiCallOptions, AiResult } from "../ai/types.js";

export type GenerateContentItem = Pick<
  ContentItem,
  "id" | "content" | "emotion" | "category" | "tags"
>;

export interface GenerateContentInput {
  items: readonly GenerateContentItem[];
}

export interface ContentGenerator {
  generate(
    input: GenerateContentInput,
    options?: AiCallOptions,
  ): Promise<AiResult<GeneratedDraft>>;
}

export class MockContentGenerator implements ContentGenerator {
  async generate(
    { items }: GenerateContentInput,
    _options?: AiCallOptions,
  ): Promise<AiResult<GeneratedDraft>> {
    const categories = Array.from(new Set(items.map((item) => item.category)));
    const emotions = Array.from(new Set(items.map((item) => item.emotion)));
    const leadingCategory = categories[0] ?? "生活";
    const leadingEmotion = emotions[0] ?? "其他";
    const title = `${leadingCategory}里，那些值得被看见的${leadingEmotion}时刻`;
    const body = [
      "我们常常以为，只有把情绪说明白，生活才会重新向前。可真正的变化，也许只是愿意在忙乱里停一下，承认此刻并不轻松，同时不急着给自己下结论。",
      "有些关系教会我们靠近，有些经历提醒我们保留边界。无论答案来得快或慢，都不必用别人的节奏衡量自己的恢复。把注意力放回今天：好好吃饭，认真睡觉，完成一件小事，也允许一段安静存在。",
      "成长不是从此不再敏感，而是敏感之后仍知道怎样照顾自己。愿你把遗憾留在合适的位置，把期待交给仍可抵达的明天。那些暂时无法解释的感受，会在一次次真实选择里变得清晰。",
      "这份文字由 DEMO 规则生成，目前只是待人工确认的草稿。请根据真实表达目的继续改写，并在使用前核对素材授权、内容安全与原创程度。",
    ].join("\n\n");

    return {
      data: GeneratedDraftSchema.parse({
        title,
        body,
        hashtags: Array.from(new Set([
          `#${leadingCategory}`,
          `#${leadingEmotion}`,
          "#情绪",
          "#成长",
          "#生活感悟",
        ])),
      }),
      provider: "mock",
      model: "mock-rules-v1",
    };
  }
}
