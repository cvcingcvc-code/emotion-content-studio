import { describe, expect, it } from "vitest";
import { RetrospectiveInputSchema } from "@emotion-studio/contracts";
import { analyzeRetrospective } from "./retrospective.js";
import { calculateRates, averageMetrics } from "./metrics.js";

describe("retrospective and metrics domains", () => {
  it("scores specific experiences and does not force weak notes into content", () => {
    const weak = RetrospectiveInputSchema.parse({ date: "2026-09-10", whatHappened: "吃饭" });
    expect(analyzeRetrospective(weak).recommendedAccount).toBe("none");
    const strong = { ...weak, whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。", myReaction: "直接开始做", whatBotheredMe: "反复返工", whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动", nextAction: "开始前确认三项标准" };
    expect(analyzeRetrospective(strong)).toMatchObject({ contentPotential: 8, recommendedAccount: "growth" });
  });
  it("credits the single-textarea retrospective the current form actually sends", () => {
    // 现在的复盘界面只有一个主输入框（5 个分栏不再渲染）。
    // 若计分只认分栏，任何新记录都拿不到 6 分 → "创建内容" 永远 409，整条 Growth Loop 走不下去。
    const rich = RetrospectiveInputSchema.parse({
      date: "2026-09-10",
      whatHappened: "今天下午接到一份活动物料修改任务，我没有先确认使用对象和交付格式就开始改版，结果对方要的是竖版海报，我交的是横版，一个下午都在返工。当时我的反应是立刻动手，现在回头看，问题出在没有先把验收标准问清楚。我学到的是先确认范围再投入时间，下次接到类似任务，我会先把使用场景、交付格式、截止时间这三件事发给对方确认后再开始。",
    });
    expect(analyzeRetrospective(rich).contentPotential).toBeGreaterThanOrEqual(6);

    const thin = RetrospectiveInputSchema.parse({ date: "2026-09-10", whatHappened: "今天开了一天会。" });
    expect(analyzeRetrospective(thin).contentPotential).toBeLessThan(6);
  });

  it("derives the conflict / reaction / lesson sentences from the single textarea", () => {
    // 新版复盘只有一个正文框。分析与生成都必须从正文里取到真实的困扰 / 反应 / 经验，
    // 否则面板和草稿会对着写满冲突的记录显示「记录里还缺少明确的冲突或困扰」「尚未补充」。
    const rich = RetrospectiveInputSchema.parse({
      date: "2026-09-10",
      whatHappened: "今天下午接到活动物料修改任务，我没有先确认交付格式就开始改版，结果一个下午都在返工。当时我的反应是立刻动手。我学到的是先确认范围再投入时间，下次会先问清使用场景和截止时间。",
    });
    const analysis = analyzeRetrospective(rich);
    expect(analysis.coreProblem).toContain("返工");
    expect(analysis.decisionPattern).toContain("当时我的反应");
    expect(analysis.lesson).toContain("学到");
    expect(analysis.recommendedContentType).toBe("solution");
  });

  it("calculates finite rates and treats zero views as no rate evidence", () => {
    expect(calculateRates({ views: 100, likes: 10, favorites: 5, comments: 2, followersGained: 1 })).toEqual({
      likeRate: .1, favoriteRate: .05, commentRate: .02, engagementRate: .17, followConversionRate: .01,
    });
    expect(calculateRates({ views: 0, likes: 0, favorites: 0, comments: 0, followersGained: 0 }).likeRate).toBeNull();
    expect(averageMetrics([], new Map())).toMatchObject({ sampleCount: 0, avgViews: null });
  });
});
