import { describe, expect, it } from "vitest";
import { PublishedContentSchema, type GrowthDashboard } from "@emotion-studio/contracts";
import { InMemoryGrowthLoopRepository } from "./repository.js";
import { seedGrowthLoopDemo } from "./demo.js";
import { dashboard } from "./dashboard.js";

function expectNoMeasuredRealEvidence(summary: GrowthDashboard) {
  expect(summary.focus.evidence).toContain("还没有指标：最近0篇");
  expect(summary.focus.NEXT_3_POSTS).toHaveLength(3);
  expect(summary.focus.NEXT_3_POSTS.every(x => x.sourceContentId === null && x.topic.startsWith("真实工作复盘"))).toBe(true);
}

describe("offline growth loop demo", () => {
  it("loads 3 growth, 3 English and 1 emotion with feedback, idempotently", async () => {
    const repo = new InMemoryGrowthLoopRepository();
    await seedGrowthLoopDemo(repo);
    const state = await seedGrowthLoopDemo(repo);
    expect(state.contents).toHaveLength(7); expect(state.metrics).toHaveLength(7); expect(state.feedback).toHaveLength(7);
    expect(state.contents.filter(x => x.account === "growth")).toHaveLength(3);
    expect(state.contents.filter(x => x.account === "english")).toHaveLength(3);
    expect(state.contents.filter(x => x.account === "emotion")).toHaveLength(1);
    expect(state.contents.every(x => x.isDemo)).toBe(true);
    expect(state.contents.filter(x => x.english).every(x => x.english!.sentences.length === 50)).toBe(true);
    const summary = dashboard(state, "mock", "memory");
    expect(summary.yesterday.count).toBe(0);
    expectNoMeasuredRealEvidence(summary);
    expect(state.strategies).toEqual([]);
    expect(state.feedback.some(x => x.comparisons.recent3.sampleCount === 3)).toBe(true);
  });

  it("keeps the dashboard honest when no content has been recorded", async () => {
    const state = await new InMemoryGrowthLoopRepository().snapshot();
    expectNoMeasuredRealEvidence(dashboard(state, "mock", "memory"));
  });

  it.each(["draft", "published"] as const)("does not fall back to demo metrics when a real %s has no metrics", async (status) => {
    const state = await seedGrowthLoopDemo(new InMemoryGrowthLoopRepository());
    const reference = state.contents[0]!;
    state.contents.push(PublishedContentSchema.parse({
      ...reference, id: "a11ed000-0000-4000-8000-000000000001", isDemo: false,
      topic: "真实输入但还没有指标", title: "真实输入但还没有指标", note: "", status,
      publishedAt: status === "published" ? reference.publishedAt : null,
      publishTime: status === "published" ? reference.publishTime : null,
    }));
    expectNoMeasuredRealEvidence(dashboard(state, "mock", "memory"));
    expect(state.contents.filter(x => x.isDemo)).toHaveLength(7);
    expect(state.metrics).toHaveLength(7);
    expect(state.feedback).toHaveLength(7);
  });

  it("uses only measured real content for focus and next-post links while preserving demo feedback", async () => {
    const state = await seedGrowthLoopDemo(new InMemoryGrowthLoopRepository());
    const real = PublishedContentSchema.parse({
      ...state.contents[0]!, id: "a11ed000-0000-4000-8000-000000000002", isDemo: false,
      topic: "真实工作记录的下一次验证", title: "真实工作记录的下一次验证", note: "",
    });
    state.contents.push(real);
    state.metrics.push({ ...state.metrics[0]!, id: "a11ed000-0000-4000-8000-000000000102", contentId: real.id, views: 100, favorites: 1 });
    const summary = dashboard(state, "mock", "memory");
    expect(summary.focus.evidence).toContain("仅使用真实内容：最近1篇");
    expect(summary.focus.NEXT_3_POSTS.every(x => x.sourceContentId === real.id && x.topic.startsWith(real.topic))).toBe(true);
    expect(summary.focus.NEXT_3_POSTS[0]!.experiment.baseline).toContain("尚无可用基线");
    expect(state.feedback).toHaveLength(7);
    expect(state.feedback.some(x => x.comparisons.recent3.sampleCount === 3)).toBe(true);
  });
});
