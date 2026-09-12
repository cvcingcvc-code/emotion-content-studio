import { randomUUID } from "node:crypto";
import { ContentFeedbackSchema, EffortDirectionSchema, ExperimentSchema, type Experiment, type PublishedContent, type ContentMetrics, type GrowthLoopState, type ContentFeedback } from "@emotion-studio/contracts";
import { averageMetrics, calculateRates, historicalComparison, hoursSincePublish, latestMetrics, relativePerformance } from "./metrics.js";
import { strategyPrompt } from "./strategy.js";
import { isRejected } from "./experiment.js";

/** 结构化实验：没有足够基线时同样给出假设，但把证据强度如实标为 LOW。 */
function propose(input: {
  hypothesis: string; variable: Experiment["variable"]; variant: Experiment["variant"];
  baseline: string; targetMetric: Experiment["targetMetric"]; instruction: string; keepConstant: string;
}, at: string): Experiment {
  return ExperimentSchema.parse({
    id: randomUUID(), ...input, requiredSamples: 3, currentSamples: 0,
    status: "proposed", createdAt: at, completedAt: null, result: null, confidence: "LOW",
  });
}

export function recommendNextExperiment(content: PublishedContent, metric: ContentMetrics, state: GrowthLoopState): Experiment {
  const relative = relativePerformance(content, metric, state);
  const at = new Date().toISOString();
  const baselineText = relative.sampleCount
    ? `同账号同窗口（${relative.bucket}）历史 ${relative.sampleCount} 篇，中位阅读 ${relative.medianViews === null ? "暂无" : relative.medianViews.toFixed(0)}；本篇 ${metric.views}`
    : "同账号同窗口历史样本不足，尚无可用基线";
  const branches = [
    {
      matches: relative.comparable && relative.relativeViews !== null && relative.relativeViews <= -0.2,
      build: () => propose({
        hypothesis: "标题改成问题型可能提高阅读量（假设，尚未验证）", variable: "title_style", variant: "question",
        baseline: baselineText, targetMetric: "views",
        instruction: `下一篇「${content.topic.slice(0, 80)}」同类内容，仅把标题改为问题型（疑问句），观察阅读量。`,
        keepConstant: "账号、题材、正文结构、封面样式和发布时段保持接近；用相同发布后时长录入指标。",
      }, at),
    },
    {
      matches: relative.comparable && relative.relativeSaves !== null && relative.relativeSaves < 0,
      build: () => propose({
        hypothesis: "建议段落写成 3 条可执行步骤可能提高收藏率（假设，尚未验证）", variable: "actionSteps", variant: "three_steps",
        baseline: baselineText, targetMetric: "favoriteRate",
        instruction: "下一篇只把建议段落改为3条可执行步骤，观察收藏率变化。",
        keepConstant: "账号、题材、标题风格、开头和发布时段保持接近；用相同发布后时长录入指标。",
      }, at),
    },
    {
      matches: true,
      build: () => propose({
        hypothesis: "开头改成具体使用场景可能提高收藏率（假设，尚未验证）", variable: "hook", variant: "scene_first",
        baseline: baselineText, targetMetric: "favoriteRate",
        instruction: `下一篇同类${content.account}内容，仅把开头改为一个具体使用场景；记录收藏率，暂不判断因果。`,
        keepConstant: "标题风格、正文结构、篇幅和发布时段保持接近；用相同发布后时长录入指标。",
      }, at),
    },
  ];
  for (const branch of branches) {
    if (!branch.matches) continue;
    const experiment = branch.build();
    if (!isRejected(state, content.account, experiment)) return experiment;
  }
  return propose({
    hypothesis: "在找到下一步之前，先把观察口径固定下来，避免继续拿不可比的数据下结论", variable: "sampleSize", variant: "fixed_window",
    baseline: baselineText, targetMetric: "favoriteRate",
    instruction: "下一篇先不改内容，只在正文结尾写明本篇的发布后观察窗口，让后续数据可比。",
    keepConstant: "标题、开头、正文与发布时段全部保持不变。",
  }, at);
}
const KEEP_SIGNAL = 0.2, CHANGE_SIGNAL = -0.2, NOISE = 0.1;
const percent = (value: number | null) => value === null ? "无法计算" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;
export function analyzePerformance(content: PublishedContent, metric: ContentMetrics, state: GrowthLoopState): ContentFeedback {
  const comparisons = historicalComparison(content, metric, state), rates = calculateRates(metric);
  const baseline = comparisons.sameAccount;
  const relative = relativePerformance(content, metric, state);
  const experiment = recommendNextExperiment(content, metric, state);
  const view = relative.relativeViews;
  const insufficient = !relative.comparable || view === null || metric.views === 0;
  const noisy = view !== null && Math.abs(view) < NOISE;
  const confidence = insufficient ? "LOW" : relative.sampleCount >= 5 && !noisy ? "HIGH" : "MEDIUM";
  const verdict = insufficient ? "INSUFFICIENT_EVIDENCE"
    : view !== null && view >= KEEP_SIGNAL ? "KEEP"
      : view !== null && view <= CHANGE_SIGNAL ? "CHANGE"
        : content.experiment ? "NEXT_EXPERIMENT" : "WATCH";
  const observation = `当前 ${metric.views} 次阅读（${relative.bucket} 窗口）；同账号同窗口 ${relative.sampleCount} 篇中位数 ${relative.medianViews === null ? "暂无" : relative.medianViews.toFixed(0)} 次，相对表现 ${percent(view)}。`;
  const evidence = `样本 ${relative.sampleCount} 篇，窗口 ${relative.bucket}${relative.comparable ? "" : "（样本不足，基线不可比）"}；${insufficient ? "证据不足，不下结论。" : noisy ? "差异小于噪声阈值，不足以区分好坏。" : "仅描述差异，未控制其他变量。"}相关不等于因果。`;
  return ContentFeedbackSchema.parse({
    id: randomUUID(), contentId: content.id, metricsId: metric.id, createdAt: new Date().toISOString(), rates, comparisons,
    observation, hypothesis: `可能的解释（假设，尚未验证）：${experiment.hypothesis}`, evidence,
    confidence, verdict, hoursSincePublish: hoursSincePublish(content, metric), relative,
    performanceSummary: `${content.isDemo ? "演示数据；" : "手动录入；"}当前 ${metric.views} 次阅读。同账号历史 ${baseline.sampleCount} 篇中位数 ${baseline.avgViews === null ? "暂无" : baseline.avgViews.toFixed(0)} 次。${baseline.sampleCount < 3 ? "样本不足，不判定赢家。" : "仅为描述性比较，不证明标题或内容导致变化。"}${metric.views === 0 ? "阅读为0，比例指标暂无。" : ""}结论：${verdict}（${confidence}）。`,
    KEEP: verdict === "KEEP" ? [`当前写法在本窗口表现高于同窗口中位数（${percent(view)}），在出现新的反证前继续沿用。`] : [],
    WATCH: ["KEEP", "CHANGE"].includes(verdict) ? [] : [`观察到相对表现 ${percent(view)}，值得继续记录，但证据不足以升级为长期策略。`],
    CHANGE: verdict === "CHANGE" ? [experiment.instruction] : [],
    NEXT_EXPERIMENT: experiment,
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
  const at = new Date().toISOString();
  const experiment = chosen ? recommendNextExperiment(chosen, metrics.get(chosen.id)!, state) : propose({
    hypothesis: "第一篇从真实事件开始，开头只写一个具体场景，可能更容易被收藏（假设，尚未验证）", variable: "hook", variant: "scene_first",
    baseline: "还没有任何已发布指标，没有可比基线", targetMetric: "favoriteRate",
    instruction: "第一篇从真实事件开始，开头只写一个具体场景，记录收藏率。",
    keepConstant: "确定账号和内容类型，后续用相同发布后时长录入数据。",
  }, at);
  const account = chosen?.account ?? "growth", contentType = chosen?.contentType ?? "solution";
  const strategy = strategyPrompt(state, account);
  return EffortDirectionSchema.parse({
    FOCUS_NOW: chosen ? `${account} / ${contentType}：${experiment.instruction}` : "先记录今天一个真实事件，生产并人工审核第一篇内容，再记录实际表现。",
    STOP_DOING: ["暂停同时更改标题、开头与正文；也不要把合成演示数据当作真实增长证据。"],
    KEEP_DOING: ["保持每篇有明确场景，保留来源；固定发布后观察窗口，持续记录真实数据。"],
    NEXT_3_POSTS: ["一个新的具体场景", "同类场景的第二次验证", "同类场景的第三次验证"].map(label => ({
      topic: `${chosen?.topic.slice(0, 65) ?? "真实工作复盘"}｜${label}`, account, contentType, experiment, sourceContentId: chosen?.id ?? null,
    })),
    evidence: `${real.length ? "仅使用真实内容" : candidates.length ? "仅使用合成 Demo 内容" : "还没有指标"}：最近${candidates.length}篇。${ranked[0] ? `候选方向有${ranked[0].average.rateSampleCount}个有效比例样本，平均收藏率${((ranked[0].average.avgFavoriteRate ?? 0) * 100).toFixed(2)}%。` : "各方向样本不足，不宣称最优方向。"}这是下一轮试验方向，不是因果结论。${strategy ? "当前账号策略已并入生成上下文。" : ""}`,
  });
}
