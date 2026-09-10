import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PublishedContentSchema, type GrowthLoopState } from "@emotion-studio/contracts";
import { analyzePerformance, recommendEffortDirection } from "./feedback.js";
import { historicalComparison } from "./metrics.js";

function sample(count = 9): GrowthLoopState {
  const state: GrowthLoopState = { retrospectives: [], contents: [], metrics: [], feedback: [] };
  for (let index = 0; index < count; index++) {
    const time = new Date(Date.UTC(2026, 8, index + 1)).toISOString();
    const item = PublishedContentSchema.parse({ id: randomUUID(), revision: 0, account: "growth", title: "真实工作经历", topic: "工作复盘", contentType: "solution", sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null, createdAt: time, updatedAt: time, publishedAt: time, publishTime: time, status: "published", writing: { title: "复盘", body: "先确认范围", corePoint: "确认", solution: "列标准", endingQuestion: "你呢", tags: ["#工作"] }, english: null, note: "", provider: "mock", isDemo: false });
    state.contents.push(item);
    state.metrics.push({ id: randomUUID(), contentId: item.id, capturedAt: time, views: 100, likes: 10, favorites: 5, comments: 2, followersGained: 1, note: "" });
  }
  return state;
}
describe("feedback and effort direction", () => {
  it("compares prior 3/7 without current or demo contamination and uses latest historical metric", () => {
    const state = sample(); const current = state.contents[8]!, metric = state.metrics[8]!;
    state.contents[0]!.isDemo = true;
    const comparison = historicalComparison(current, metric, state);
    expect(comparison.recent3.sampleCount).toBe(3); expect(comparison.recent7.sampleCount).toBe(7);
    expect(comparison.recent7.contentIds).not.toContain(current.id);
    expect(comparison.recent3.avgFavoriteRate).toBeCloseTo(.05);
    state.metrics.push({ ...state.metrics[7]!, id: randomUUID(), capturedAt: "2026-09-08T01:00:00.000Z", views: 400 });
    expect(historicalComparison(current, metric, state).recent3.avgViews).toBe(200);
  });
  it("outputs bounded KEEP CHANGE and exactly one experimental variable", () => {
    const state = sample(); const metric = { ...state.metrics[8]!, views: 50 };
    const result = analyzePerformance(state.contents[8]!, metric, state);
    expect(result.KEEP).toHaveLength(1); expect(result.CHANGE).toHaveLength(1);
    expect(result.NEXT_EXPERIMENT.variable).toBe("title");
    expect(result.performanceSummary).toContain("不证明");
    expect(analyzePerformance(state.contents[8]!, { ...metric, views: 0 }, state).rates.likeRate).toBeNull();
  });
  it("returns actionable three posts and does not mix demo evidence with real evidence", () => {
    const state = sample(3); state.contents[0]!.isDemo = true;
    const direction = recommendEffortDirection(state);
    expect(direction.NEXT_3_POSTS).toHaveLength(3); expect(direction.evidence).toContain("仅使用真实内容：最近2篇");
    expect(recommendEffortDirection(sample(0)).evidence).toContain("还没有指标");
  });
});
