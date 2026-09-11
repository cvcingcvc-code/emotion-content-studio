import { describe, expect, it } from "vitest";
import { InMemoryGrowthLoopRepository } from "./repository.js";
import { seedGrowthLoopDemo } from "./demo.js";
import { dashboard } from "./dashboard.js";

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
    expect(summary.focus.evidence).toContain("仅使用合成 Demo 内容");
    expect(state.feedback.some(x => x.comparisons.recent3.sampleCount === 3)).toBe(true);
  });
});
