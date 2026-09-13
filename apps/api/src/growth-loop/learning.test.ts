import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContentFeedbackSchema, ExperimentSchema, PublishedContentSchema,
  type ContentAccount, type GrowthLoopState,
} from "@emotion-studio/contracts";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "../english/provider.js";
import { MAX_LEARNINGS, learningPrompt, selectLearnings } from "./learning.js";

const NOW = "2026-09-11T12:00:00.000Z";
const at = (daysAgo: number) => new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const comp = () => ({ sampleCount: 3, rateSampleCount: 3, contentIds: [], avgViews: 100, avgLikeRate: .1, avgFavoriteRate: .05, avgCommentRate: .01, avgFollowConversionRate: .01 });

function content(id: string, account: ContentAccount, isDemo: boolean, status: "published" | "rejected", topic: string, serial: number) {
  const published = status === "published";
  return PublishedContentSchema.parse({
    id, revision: 0, account, title: topic.slice(0, 80), topic, contentType: "solution",
    sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null,
    createdAt: at(2), updatedAt: at(2),
    publishedAt: published ? at(2) : null, publishTime: published ? at(2) : null,
    status, rejectedAt: published ? null : at(1), rejectReason: published ? null : "not_me",
    writing: { title: topic.slice(0, 80), body: "正文", corePoint: "要点", solution: "方案", endingQuestion: "你会怎么做？", tags: ["#成长"] },
    english: null, provider: "mock", isDemo, note: `记录 ${serial}`,
  });
}

function feedback(index: number, contentId: string, verdict: "KEEP" | "CHANGE" | "WATCH", createdAt: string) {
  return ContentFeedbackSchema.parse({
    id: uuid(300 + index), contentId, metricsId: uuid(400 + index), createdAt,
    performanceSummary: "表现摘要", observation: "观察", hypothesis: "假设", evidence: "证据",
    confidence: "MEDIUM", verdict, hoursSincePublish: 12,
    relative: { bucket: "24h", sampleCount: 3, medianViews: 100, medianLikes: 5, medianFavorites: 3, medianComments: 1, relativeViews: 0, relativeLikes: 0, relativeSaves: 0, relativeComments: 0, comparable: true },
    KEEP: verdict === "KEEP" ? ["继续这条写法"] : [],
    WATCH: verdict === "WATCH" ? ["弱信号，先别下结论"] : [],
    CHANGE: verdict === "CHANGE" ? ["调整标题"] : [],
    NEXT_EXPERIMENT: ExperimentSchema.parse({
      id: uuid(500 + index), hypothesis: "假设", variable: "title_style", variant: "question", baseline: "同窗口基线",
      targetMetric: "views", requiredSamples: 3, currentSamples: 0, status: "proposed", createdAt,
      completedAt: null, result: null, confidence: "LOW", instruction: "只把标题改成问题型", keepConstant: "其他保持不变",
    }),
    rates: { likeRate: .1, favoriteRate: .05, commentRate: .01, engagementRate: .16, followConversionRate: .01 },
    comparisons: { recent3: comp(), recent7: comp(), sameAccount: comp(), sameContentType: comp() },
  });
}

function stateOf(contents: GrowthLoopState["contents"], feedbacks: GrowthLoopState["feedback"]): GrowthLoopState {
  return { retrospectives: [], contents, metrics: [], feedback: feedbacks, strategies: [] };
}

const query = (state: GrowthLoopState, sourceContentId: string | null = null, over: Partial<Parameters<typeof selectLearnings>[0]> = {}) =>
  selectLearnings({ state, account: "growth", isDemo: false, sourceContentId, now: NOW, ...over });

describe("learning selection", () => {
  it("keeps only the newest feedback per content and caps the number of learnings", () => {
    const c1 = content(uuid(1), "growth", false, "published", "第一篇复盘", 1);
    const c2 = content(uuid(2), "growth", false, "published", "第二篇复盘", 2);
    const c3 = content(uuid(3), "growth", false, "published", "第三篇复盘", 3);
    const c4 = content(uuid(4), "growth", false, "published", "第四篇复盘", 4);
    const state = stateOf([c1, c2, c3, c4], [
      feedback(1, c1.id, "KEEP", at(6)), feedback(2, c1.id, "CHANGE", at(4)),
      feedback(3, c2.id, "KEEP", at(3)), feedback(4, c3.id, "KEEP", at(2)), feedback(5, c4.id, "KEEP", at(1)),
    ]);
    const selected = query(state);
    expect(selected).toHaveLength(MAX_LEARNINGS);
    expect(selected.map(x => x.contentId)).toEqual([c4.id, c3.id, c2.id]);
    expect(selected.find(x => x.contentId === c1.id)).toBeUndefined();
  });

  it("drops feedback that is older than the recency window", () => {
    const c1 = content(uuid(11), "growth", false, "published", "很久以前的复盘", 1);
    const state = stateOf([c1], [feedback(11, c1.id, "KEEP", at(60))]);
    expect(query(state)).toHaveLength(0);
  });

  it("never mixes demo evidence or another account into a real generation", () => {
    const real = content(uuid(21), "growth", false, "published", "真实复盘", 1);
    const demo = content(uuid(22), "growth", true, "published", "演示复盘", 2);
    const other = content(uuid(23), "emotion", false, "published", "别的账号的复盘", 3);
    const state = stateOf([real, demo, other], [
      feedback(21, real.id, "KEEP", at(1)), feedback(22, demo.id, "KEEP", at(1)), feedback(23, other.id, "KEEP", at(1)),
    ]);
    expect(query(state).map(x => x.contentId)).toEqual([real.id]);
    expect(query(state, null, { isDemo: true }).map(x => x.contentId)).toEqual([demo.id]);
  });

  it("ignores feedback from content that never reached published (rejected)", () => {
    const rejected = content(uuid(31), "growth", false, "rejected", "被拒绝的稿子", 1);
    const published = content(uuid(32), "growth", false, "published", "正常发布的稿子", 2);
    const state = stateOf([rejected, published], [feedback(31, rejected.id, "KEEP", at(1)), feedback(32, published.id, "KEEP", at(1))]);
    expect(query(state, rejected.id).map(x => x.contentId)).toEqual([published.id]);
  });

  it("puts the direct upstream learning first so the limit never drops it", () => {
    const c1 = content(uuid(41), "growth", false, "published", "第一篇", 1);
    const c2 = content(uuid(42), "growth", false, "published", "第二篇", 2);
    const c3 = content(uuid(43), "growth", false, "published", "第三篇", 3);
    const c4 = content(uuid(44), "growth", false, "published", "第四篇", 4);
    const state = stateOf([c1, c2, c3, c4], [
      feedback(41, c1.id, "KEEP", at(4)), feedback(42, c2.id, "KEEP", at(3)),
      feedback(43, c3.id, "KEEP", at(2)), feedback(44, c4.id, "KEEP", at(1)),
    ]);
    const selected = query(state, c2.id);
    expect(selected[0]!.contentId).toBe(c2.id);
    expect(selected).toHaveLength(MAX_LEARNINGS);
  });

  it("produces no prompt block at all when there is nothing to learn", () => {
    expect(learningPrompt([])).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* 端到端：证明「下一篇生成」真的读到了「上一篇的反馈」                  */
/* ------------------------------------------------------------------ */

const base = "/api/v1/growth-loop";
const retroInput = { date: "2026-09-10", whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。", myReaction: "直接开始做", whatBotheredMe: "反复返工", whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动", nextAction: "开始前确认三项标准" };
const twelveHoursAgo = () => new Date(Date.now() - 12 * 3_600_000).toISOString();

type App = Awaited<ReturnType<typeof buildApp>>;

// e2e：每个用例做 5 次完整发布闭环（正常 0.7~1.7s），高负载下曾超过 5s 默认超时（抖动，非断言回归）。
describe("feedback really flows into the next generation", { timeout: 15_000 }, () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "growth-learning-test-"));
    const app = await buildApp({ englishWorkflow: { root, writer: createEnglishWriter({}) } });
    cleanups.push(() => app.close(), () => rm(root, { recursive: true, force: true })); return app;
  }
  async function retro(app: App) {
    let item = (await app.inject({ method: "POST", url: base + "/retrospectives", payload: retroInput })).json().data;
    item = (await app.inject({ method: "POST", url: `${base}/retrospectives/${item.id}/analyze`, payload: { revision: item.revision } })).json().data;
    return item.id as string;
  }
  /** 走完整闭环：创建 → 生成 → 审核通过 → 发布 → 录指标 → 分析出 feedback。 */
  async function published(app: App, retroId: string, topic: string, views: number, sourceContentId: string | null = null) {
    const created = (await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic, contentType: "solution", sourceRetrospectiveId: retroId, sourceContentId } })).json().data;
    const generated = (await app.inject({ method: "POST", url: `${base}/contents/${created.id}/generate`, payload: { revision: 0 } })).json().data;
    const ready = (await app.inject({ method: "PUT", url: `${base}/contents/${created.id}/review`, payload: { revision: generated.revision, writing: generated.writing, english: null, note: "", status: "ready" } })).json().data;
    const published = (await app.inject({ method: "POST", url: `${base}/contents/${created.id}/publish`, payload: { revision: ready.revision, publishTime: twelveHoursAgo() } })).json().data;
    await app.inject({ method: "POST", url: `${base}/contents/${created.id}/metrics`, payload: { views, likes: Math.round(views * .05), favorites: Math.round(views * .03), comments: 1, followersGained: 1 } });
    const feedback = (await app.inject({ method: "POST", url: `${base}/contents/${created.id}/analyze` })).json().data;
    // 保证每篇的 publishedAt / feedback.createdAt 严格递增：同毫秒会让基线比较与排序变得不确定。
    await new Promise(resolve => setTimeout(resolve, 5));
    return { id: published.id as string, feedback };
  }
  /** 只创建 + 生成下一篇，用来检查它的 generation debug。 */
  async function generateNext(app: App, retroId: string, topic: string, sourceContentId: string) {
    const created = (await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic, contentType: "solution", sourceRetrospectiveId: retroId, sourceContentId } })).json().data;
    return (await app.inject({ method: "POST", url: `${base}/contents/${created.id}/generate`, payload: { revision: 0 } })).json().data;
  }
  /** 3 篇同窗口基线（100 阅读）+ 1 篇明显更好（KEEP）+ 1 篇明显更差（CHANGE）。 */
  async function seedHistory(app: App) {
    const retroId = await retro(app);
    const baseline: Array<{ id: string; feedback: { id: string } }> = [];
    for (const topic of ["交付前先确认范围", "接到模糊任务先问清验收标准", "把返工原因写成清单"]) {
      baseline.push(await published(app, retroId, topic, 100));
    }
    const keep = await published(app, retroId, "确认范围之后效率变高了", 400);
    const change = await published(app, retroId, "被临时消息打断的一天", 10);
    return { retroId, baseline, keep, change };
  }

  it("case 1+2+3+5: carries KEEP / CHANGE / experiment into the next generation, deduped and capped", async () => {
    const app = await setup();
    const { retroId, baseline, keep, change } = await seedHistory(app);
    expect(keep.feedback.verdict).toBe("KEEP");
    expect(change.feedback.verdict).toBe("CHANGE");

    // Case 1：下一篇以上一篇为直接上游 → KEEP learning 必须进入 generation context
    const afterKeep = await generateNext(app, retroId, "继续用确认清单", keep.id);
    const keepUsed = (afterKeep.debug.feedbackUsed as Array<Record<string, unknown>>).find(x => x.contentId === keep.id);
    expect(keepUsed).toBeDefined();
    expect(keepUsed!.verdict).toBe("KEEP");
    expect(keepUsed!.confidence).toBe(keep.feedback.confidence);
    expect(keepUsed!.feedbackId).toBe(keep.feedback.id);
    expect(keepUsed!.source).toBe("feedback");
    expect(String(keepUsed!.text)).toContain((keep.feedback.KEEP as string[])[0]!);
    expect(keepUsed!.experimentId).toBe(keep.feedback.NEXT_EXPERIMENT.id);
    expect(afterKeep.debug.finalGenerationContext).toContain("learnings=3");

    // Case 2：以上一篇 CHANGE 的稿子为上游 → CHANGE learning 必须进入
    const afterChange = await generateNext(app, retroId, "换一种开头重写", change.id);
    const changeUsed = (afterChange.debug.feedbackUsed as Array<Record<string, unknown>>).find(x => x.contentId === change.id);
    expect(changeUsed).toBeDefined();
    expect(changeUsed!.verdict).toBe("CHANGE");
    expect(String(changeUsed!.text)).toContain((change.feedback.CHANGE as string[])[0]!);

    // Case 3：NEXT_EXPERIMENT 真的落到下一轮的 experiment 上
    expect(afterChange.debug.experimentUsed).toBe(`${change.feedback.NEXT_EXPERIMENT.variable}=${change.feedback.NEXT_EXPERIMENT.variant}`);
    expect(afterChange.experiment.variable).toBe(change.feedback.NEXT_EXPERIMENT.variable);
    expect(afterChange.experiment.variant).toBe(change.feedback.NEXT_EXPERIMENT.variant);

    // Case 5：直接上游排第一，其余按时间倒序，总数被 MAX_LEARNINGS 截断
    const ids = (afterChange.debug.feedbackUsed as Array<{ contentId: string }>).map(x => x.contentId);
    expect(ids).toHaveLength(MAX_LEARNINGS);
    expect(ids[0]).toBe(change.id);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(baseline[0]!.id);
  });

  it("case 4: a rejected draft contributes no positive learning but keeps its negative signal", async () => {
    const app = await setup();
    const { retroId, keep } = await seedHistory(app);
    const drafted = (await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic: "编造经历的一篇", contentType: "solution", sourceRetrospectiveId: retroId, sourceContentId: null } })).json().data;
    const generated = (await app.inject({ method: "POST", url: `${base}/contents/${drafted.id}/generate`, payload: { revision: 0 } })).json().data;
    const rejected = (await app.inject({ method: "POST", url: `${base}/contents/${drafted.id}/reject`, payload: { revision: generated.revision, reason: "factually_wrong" } })).json().data;
    expect(rejected.status).toBe("rejected");

    const next = await generateNext(app, retroId, "重写这一篇", rejected.id);
    const used = next.debug.feedbackUsed as Array<{ contentId: string }>;
    expect(used.some(x => x.contentId === rejected.id)).toBe(false);
    expect(used).toHaveLength(MAX_LEARNINGS);
    expect(used.some(x => x.contentId === keep.id)).toBe(true);

    const strategies = (await app.inject(base)).json().data.strategies as Array<{ source: string; category: string; confidence: string; value: string }>;
    const negative = strategies.find(x => x.source === "reject");
    expect(negative).toMatchObject({ category: "avoid", confidence: "HIGH" });
    expect(next.debug.strategyUsed).toContain(negative!.value);
    expect(next.debug.userPreferenceUsed).toContain(negative!.value);
  });
});
