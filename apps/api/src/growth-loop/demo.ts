import { PublishedContentSchema, type ContentAccount, type ContentType } from "@emotion-studio/contracts";
import { demoEnglishWriting } from "../english/demo-content.js";
import type { GrowthLoopRepository } from "./repository.js";
import { analyzePerformance } from "./feedback.js";

const entries: Array<{ account: ContentAccount; topic: string; contentType: ContentType; body: string; views: number; favorites: number }> = [
  { account: "growth", topic: "交付前先确认三件事", contentType: "solution", body: "演示经历：反复修改一份材料后，创作者把目标、格式和截止时间写成了三项确认清单。\n这是合成演示，不代表用户真实经历。", views: 1800, favorites: 180 },
  { account: "english", topic: "尴尬时刻英语50句", contentType: "educational", body: "", views: 1200, favorites: 100 },
  { account: "growth", topic: "把模糊任务变成可确认的问题", contentType: "solution", body: "演示经历：接到模糊任务时，先问清谁使用、解决什么问题、完成后如何验收。\n这是合成演示，不代表用户真实经历。", views: 2200, favorites: 286 },
  { account: "english", topic: "拒绝别人英语50句", contentType: "educational", body: "", views: 950, favorites: 66 },
  { account: "emotion", topic: "关系里允许片刻安静", contentType: "reflection", body: "不是每段安静都需要立刻填满。想说的话可以慢一点整理，想休息的时刻也可以认真承认。\n原创合成演示，不取自真实用户素材。", views: 680, favorites: 17 },
  { account: "english", topic: "夸人英语50句", contentType: "educational", body: "", views: 1600, favorites: 176 },
  { account: "growth", topic: "一天忙完却没完成重点", contentType: "reflection", body: "演示经历：一整天被临时消息打断，下班时才发现最重要的一件事没有推进。下一次计划先留出一个不处理消息的工作时段。\n这是合成演示，不代表用户真实经历。", views: 430, favorites: 9 },
];
const id = (number: number) => `f17ed000-0000-4000-8000-${String(number).padStart(12, "0")}`;
/** Explicit, idempotent demo load. No model calls and no English production-history writes. */
export async function seedGrowthLoopDemo(repository: GrowthLoopRepository) {
  for (const [index, entry] of entries.entries()) {
    let state = await repository.snapshot();
    const contentId = id(index + 1), metricId = id(index + 101);
    let content = state.contents.find(x => x.id === contentId);
    if (!content) {
      const publishedAt = new Date(Date.now() - (7 - index) * 86400_000).toISOString();
      const english = entry.account === "english" ? demoEnglishWriting({ topic: entry.topic, tone: "日常" }) : null;
      content = PublishedContentSchema.parse({
        id: contentId, revision: 0, account: entry.account, title: english?.title ?? entry.topic, topic: entry.topic, contentType: entry.contentType,
        sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null,
        createdAt: publishedAt, updatedAt: publishedAt, publishedAt, publishTime: publishedAt,
        status: "published", english, writing: english ? null : { title: entry.topic, body: entry.body, corePoint: "先把模糊感受变成一个具体问题。", solution: "只选择一个行动，在下一次类似场景中验证。", endingQuestion: "你会先尝试哪一步？", tags: ["#创作复盘", "#具体行动"] },
        provider: "mock", isDemo: true, note: "合成演示内容与指标，不是真实发布业绩。",
      });
      await repository.saveContent(content, null);
    }
    if (!state.metrics.some(x => x.id === metricId)) {
      await repository.addMetrics({ id: metricId, contentId, capturedAt: new Date(Date.parse(content.publishedAt!) + 12 * 3600_000).toISOString(), views: entry.views, favorites: entry.favorites, likes: Math.round(entry.views * .07), comments: 8 + index, followersGained: 3 + index, note: "合成的发布后12小时数据" });
    }
    state = await repository.snapshot();
    if (!state.feedback.some(x => x.metricsId === metricId)) {
      await repository.addFeedback({ ...analyzePerformance(content, state.metrics.find(x => x.id === metricId)!, state), id: id(index + 201) });
    }
  }
  return repository.snapshot();
}
