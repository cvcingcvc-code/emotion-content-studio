import type { ContentAccount, ContentFeedback, FeedbackUsed, GrowthLoopState } from "@emotion-studio/contracts";

/** 最多把几条上一轮学习送进生成上下文。 */
export const MAX_LEARNINGS = 3;
/** 超过这个天数的 feedback 不再作为学习来源 —— 不把陈旧结论当成现状。 */
export const LEARNING_WINDOW_DAYS = 30;

export interface LearningQuery {
  state: GrowthLoopState;
  account: ContentAccount;
  isDemo: boolean;
  sourceContentId: string | null;
  now?: string;
}

const DAY_MS = 86_400_000;

function withinWindow(createdAt: string, now: string) {
  const age = Date.parse(now) - Date.parse(createdAt);
  return Number.isFinite(age) && age >= 0 && age <= LEARNING_WINDOW_DAYS * DAY_MS;
}

/**
 * 选出真正进入下一轮生成上下文的学习。规则保持最小但明确：
 * 1. 只取「已发布 + 同账号 + 同性质（真实 / 演示）」的内容的 feedback
 *    —— 演示证据不污染真实生成，也不跨账号串味。
 * 2. 只取 LEARNING_WINDOW_DAYS 天内的记录 —— 不把陈旧结论当现状。
 * 3. 同一篇内容只保留最新一条 feedback（按 contentId 去重）—— 同一轮不被重复计入。
 * 4. 直接上游（sourceContentId 指向的上一篇）排在最前，其余按 createdAt 倒序。
 * 5. 截断到 MAX_LEARNINGS —— 不把历史 feedback 全量塞给模型。
 *
 * 被拒绝（rejected）的内容天然没有 feedback（录指标要求 published），所以不会进入正向学习。
 */
export function selectLearnings(query: LearningQuery): ContentFeedback[] {
  const now = query.now ?? new Date().toISOString();
  const contentById = new Map(query.state.contents.map(item => [item.id, item]));
  const latestPerContent = new Map<string, ContentFeedback>();
  for (const item of query.state.feedback) {
    if (!withinWindow(item.createdAt, now)) continue;
    const content = contentById.get(item.contentId);
    if (!content || content.status !== "published" || content.account !== query.account || content.isDemo !== query.isDemo) continue;
    const current = latestPerContent.get(item.contentId);
    if (!current || item.createdAt > current.createdAt || (item.createdAt === current.createdAt && item.id > current.id)) {
      latestPerContent.set(item.contentId, item);
    }
  }
  const ranked = [...latestPerContent.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const upstream = query.sourceContentId ? ranked.filter(x => x.contentId === query.sourceContentId) : [];
  const rest = ranked.filter(x => x.contentId !== query.sourceContentId);
  return [...upstream, ...rest].slice(0, MAX_LEARNINGS);
}

const VERDICT_LABEL: Record<ContentFeedback["verdict"], string> = {
  KEEP: "上一轮判定 KEEP，可以继续沿用",
  CHANGE: "上一轮判定 CHANGE，本轮必须调整",
  NEXT_EXPERIMENT: "上一轮留有进行中的实验",
  WATCH: "上一轮判定 WATCH，证据不足",
  INSUFFICIENT_EVIDENCE: "上一轮证据不足",
};

/**
 * 把一条 feedback 渲染成一行可追踪的学习。
 * 只有 KEEP / CHANGE 会被当作结论写进生成输入；
 * WATCH / INSUFFICIENT_EVIDENCE 的原文**不进入** prompt，只保留「不得当作结论」这一元信息。
 */
export function learningLine(state: GrowthLoopState, feedback: ContentFeedback): FeedbackUsed {
  const content = state.contents.find(x => x.id === feedback.contentId);
  const parts = [`《${(content?.topic ?? "上一篇内容").slice(0, 40)}》${VERDICT_LABEL[feedback.verdict]}（置信度 ${feedback.confidence}）`];
  if (feedback.verdict === "KEEP" && feedback.KEEP.length) parts.push(`继续：${feedback.KEEP[0]}`);
  if (feedback.verdict === "CHANGE" && feedback.CHANGE.length) parts.push(`调整：${feedback.CHANGE[0]}`);
  if (feedback.verdict === "WATCH" || feedback.verdict === "INSUFFICIENT_EVIDENCE") parts.push("本轮不要据此改动写法，只把它当作待验证信号");
  parts.push(`上一轮提议的唯一变量 ${feedback.NEXT_EXPERIMENT.variable}=${feedback.NEXT_EXPERIMENT.variant}（实验 ${feedback.NEXT_EXPERIMENT.id}，状态 ${feedback.NEXT_EXPERIMENT.status}）`);
  return {
    feedbackId: feedback.id, contentId: feedback.contentId, source: "feedback",
    verdict: feedback.verdict, confidence: feedback.confidence, createdAt: feedback.createdAt,
    experimentId: feedback.NEXT_EXPERIMENT.id, text: parts.join("；").slice(0, 300),
  };
}

export function learningLines(state: GrowthLoopState, learnings: ContentFeedback[]): FeedbackUsed[] {
  return learnings.map(item => learningLine(state, item));
}

/** 组装给 Generator 的学习段落。没有学习时返回空串，不编造。 */
export function learningPrompt(learnings: FeedbackUsed[]): string {
  if (!learnings.length) return "";
  return [
    "上一轮反馈（feedback，来源仅为已发布内容的分析）：",
    ...learnings.map(item => `- ${item.text}`),
    "只有 KEEP / CHANGE 是结论；WATCH 与证据不足的条目不得当成结论，也不得据此宣称因果关系。",
  ].join("\n");
}
