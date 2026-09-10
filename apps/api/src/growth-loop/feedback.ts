import { randomUUID } from "node:crypto";
import { ContentFeedbackSchema, EffortDirectionSchema, type PublishedContent, type ContentMetrics, type GrowthLoopState, type ContentFeedback } from "@emotion-studio/contracts";
import { averageMetrics, calculateRates, historicalComparison, latestMetrics } from "./metrics.js";

export function recommendNextExperiment(content: PublishedContent, metric: ContentMetrics, state: GrowthLoopState): ContentFeedback["NEXT_EXPERIMENT"] {
  const baseline = historicalComparison(content, metric, state).sameAccount;
  const rates = calculateRates(metric);
  if (baseline.sampleCount >= 3 && baseline.avgViews !== null && metric.views < baseline.avgViews * .8) {
    return { variable: "title", instruction: `下一篇「${content.topic.slice(0, 80)}」同类内容，仅把标题改为具体场景＋读者所得，观察阅读量。`, keepConstant: "账号、题材、正文结构、封面样式和发布时段保持接近；用相同发布后时长录入指标。", metric: "views" };
  }
  if (rates.favoriteRate !== null && baseline.rateSampleCount >= 3 && baseline.avgFavoriteRate !== null && rates.favoriteRate < baseline.avgFavoriteRate) {
    return { variable: "actionSteps", instruction: "下一篇只把建议段落改为3条可执行步骤，观察收藏率变化。", keepConstant: "账号、题材、标题风格、开头和发布时段保持接近；用相同发布后时长录入指标。", metric: "favoriteRate" };
  }
  return { variable: "hook", instruction: `下一篇同类${content.account}内容，仅把开头改为一个具体使用场景；记录收藏率，暂不判断因果。`, keepConstant: "标题风格、正文结构、篇幅和发布时段保持接近；用相同发布后时长录入指标。", metric: "favoriteRate" };
}
export function analyzePerformance(content: PublishedContent, metric: ContentMetrics, state: GrowthLoopState): ContentFeedback {
  const comparisons = historicalComparison(content, metric, state), rates = calculateRates(metric);
  const baseline = comparisons.sameAccount;
  const experiment = recommendNextExperiment(content, metric, state);
  return ContentFeedbackSchema.parse({
    id: randomUUID(), contentId: content.id, metricsId: metric.id, createdAt: new Date().toISOString(), rates, comparisons,
    performanceSummary: `${content.isDemo ? "演示数据；" : "手动录入；"}当前${metric.views}次阅读。同账号历史${baseline.sampleCount}篇，均值${baseline.avgViews === null ? "暂无" : baseline.avgViews.toFixed(0)}次。${baseline.sampleCount < 3 ? "样本不足，不判定赢家。" : "仅为描述性比较，不证明标题或内容导致变化。"}${metric.views === 0 ? "阅读为0，比例指标暂无。" : ""}不同发布时长可能影响比较。`,
    KEEP: [content.sourceRetrospectiveId ? "保留有来源可核对的真实经历；未发生的行动继续标注为计划。" : `保留「${content.topic.slice(0, 100)}」场景和${content.contentType}结构，作为下一轮对照。`],
    CHANGE: [experiment.instruction], NEXT_EXPERIMENT: experiment,
  });
}
export function recommendEffortDirection(state: GrowthLoopState) {
  const metrics = latestMetrics(state);
  const measured = state.contents.filter(x => x.status === "published" && metrics.has(x.id));
  const real = measured.filter(x => !x.isDemo);
  const candidates = (real.length ? real : measured).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!)).slice(0, 7);
  const groups = [...new Set(candidates.map(x => `${x.account}/${x.contentType}`))].map(key => {
    const items = candidates.filter(x => `${x.account}/${x.contentType}` === key);
    return { items, average: averageMetrics(items, metrics) };
  });
  const ranked = groups.filter(x => x.average.rateSampleCount >= 2).sort((a, b) => (b.average.avgFavoriteRate ?? -1) - (a.average.avgFavoriteRate ?? -1));
  const chosen = ranked[0]?.items[0] ?? candidates[0];
  const experiment = chosen ? recommendNextExperiment(chosen, metrics.get(chosen.id)!, state) : {
    variable: "hook" as const, instruction: "第一篇从真实事件开始，开头只写一个具体场景，记录收藏率。", keepConstant: "确定账号和内容类型，后续用相同发布后时长录入数据。", metric: "favoriteRate" as const,
  };
  const account = chosen?.account ?? "growth", contentType = chosen?.contentType ?? "solution";
  return EffortDirectionSchema.parse({
    FOCUS_NOW: chosen ? `${account} / ${contentType}：${experiment.instruction}` : "先记录今天一个真实事件，生产并人工审核第一篇内容，再记录实际表现。",
    STOP_DOING: ["暂停同时更改标题、开头与正文；也不要把合成演示数据当作真实增长证据。"],
    KEEP_DOING: ["保持每篇有明确场景，保留来源；固定发布后观察窗口，持续记录真实数据。"],
    NEXT_3_POSTS: ["一个新的具体场景", "同类场景的第二次验证", "同类场景的第三次验证"].map(label => ({
      topic: `${chosen?.topic.slice(0, 65) ?? "真实工作复盘"}｜${label}`, account, contentType, experiment, sourceContentId: chosen?.id ?? null,
    })),
    evidence: `${real.length ? "仅使用真实内容" : candidates.length ? "仅使用合成 Demo 内容" : "还没有指标"}：最近${candidates.length}篇。${ranked[0] ? `候选方向有${ranked[0].average.rateSampleCount}个有效比例样本，平均收藏率${((ranked[0].average.avgFavoriteRate ?? 0) * 100).toFixed(2)}%。` : "各方向样本不足，不宣称最优方向。"}这是下一轮试验方向，不是因果结论。`,
  });
}
