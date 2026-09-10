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
  it("calculates finite rates and treats zero views as no rate evidence", () => {
    expect(calculateRates({ views: 100, likes: 10, favorites: 5, comments: 2, followersGained: 1 })).toEqual({
      likeRate: .1, favoriteRate: .05, commentRate: .02, engagementRate: .17, followConversionRate: .01,
    });
    expect(calculateRates({ views: 0, likes: 0, favorites: 0, comments: 0, followersGained: 0 }).likeRate).toBeNull();
    expect(averageMetrics([], new Map())).toMatchObject({ sampleCount: 0, avgViews: null });
  });
});
