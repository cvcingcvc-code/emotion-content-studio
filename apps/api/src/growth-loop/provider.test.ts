import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ExperimentSchema, GrowthLoopStateSchema, LoopWritingSchema, RetrospectiveSchema, type ExperimentVariant, type ExperimentVariable, type GrowthLoopState } from "@emotion-studio/contracts";
import { applyExperiment, applyStrategyConstraints, GrowthLoopAgent } from "./provider.js";
import { buildGenerationContext } from "./generation-context.js";
import { applyStrategy } from "./strategy.js";

const retro = RetrospectiveSchema.parse({
  id: "00000000-0000-4000-8000-000000000001", revision: 1, date: "2026-09-10",
  whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。",
  myReaction: "直接开始做", whatBotheredMe: "反复返工",
  whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动",
  nextAction: "开始前确认三项标准", optionalNote: "",
  createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z",
  analysis: null, analysisProvider: null,
});

const writing = () => LoopWritingSchema.parse({ title: "反复返工的半天", body: "原文正文", corePoint: "要点", solution: "原方案", endingQuestion: "你会怎么做？", tags: ["#成长"] });
const empty = (): GrowthLoopState => GrowthLoopStateSchema.parse({ retrospectives: [], contents: [], metrics: [], feedback: [], strategies: [] });

const makeExperiment = (variable: ExperimentVariable, variant: ExperimentVariant) => ExperimentSchema.parse({
  id: randomUUID(), hypothesis: "本轮假设", variable, variant, baseline: "同账号历史样本不足",
  targetMetric: "views", requiredSamples: 3, currentSamples: 0, status: "running",
  createdAt: new Date().toISOString(), completedAt: null, result: null, confidence: "LOW",
  instruction: "只改这一项", keepConstant: "其他保持不变",
});

const context = (state: GrowthLoopState = empty(), experiment = null) =>
  buildGenerationContext({ state, account: "growth", retro, experiment, topic: "反复返工的半天", contentType: "solution" });

describe("experiment application is provider independent", () => {
  it("leaves the draft untouched when there is no experiment", () => {
    expect(applyExperiment(writing(), retro, null)).toEqual(writing());
  });

  it("turns the title into a real question when the variant is question", () => {
    const applied = applyExperiment(writing(), retro, makeExperiment("title_style", "question"));
    expect(applied.title.endsWith("？")).toBe(true);
    expect(applied.title.startsWith("为什么")).toBe(true);
    expect(applied.title.length).toBeLessThanOrEqual(80);
  });

  it("does not double-wrap a title that is already a question", () => {
    const already = { ...writing(), title: "为什么反复返工？" };
    expect(applyExperiment(already, retro, makeExperiment("title_style", "question")).title).toBe("为什么反复返工？");
  });

  it("prefixes the hook exactly once even if applied twice", () => {
    const once = applyExperiment(writing(), retro, makeExperiment("hook", "scene_first"));
    expect(once.body.startsWith("如果你也遇到")).toBe(true);
    expect(applyExperiment(once, retro, makeExperiment("hook", "scene_first")).body.match(/如果你也遇到/g)).toHaveLength(1);
  });

  it("turns the solution into three runnable steps", () => {
    const steps = applyExperiment(writing(), retro, makeExperiment("actionSteps", "three_steps")).solution;
    expect(steps).toContain("1. ");
    expect(steps).toContain("3. ");
  });

  it("applies the experiment through the agent even without a model client", async () => {
    const agent = new GrowthLoopAgent();
    const result = await agent.generateContentOpportunity(context(empty(), makeExperiment("title_style", "question")));
    expect(result.writing.title.startsWith("为什么")).toBe(true);
    expect(agent.mode).toBe("mock");
    expect(result.debug.experimentUsed).toBe("title_style=question");
  });

  it("never fabricates an experiment when there is none", async () => {
    const agent = new GrowthLoopAgent();
    const result = await agent.generateContentOpportunity(context());
    expect(result.debug.experimentUsed).toBeNull();
    expect(result.writing.title).toBe("反复返工的半天");
  });

  it("really constrains the text when a strategy says to avoid drama", () => {
    const drama = applyStrategy(empty(), { account: "growth", key: "avoid_drama", value: "避免过度戏剧化和夸张表达", category: "avoid", source: "human_edit" });
    const state = { ...empty(), strategies: drama.strategies };
    const noisy = { ...writing(), title: "震惊！这招必看！", body: "全网都在用！！" };
    const { writing: cleaned, applied } = applyStrategyConstraints(noisy, context(state));
    expect(applied.length).toBeGreaterThan(0);
    expect(cleaned.title).not.toContain("震惊");
    expect(cleaned.title).not.toContain("！");
    expect(cleaned.body).not.toContain("全网");
  });

  it("reports strategy, preferences and prompt version in the debug trail", async () => {
    const drama = applyStrategy(empty(), { account: "growth", key: "avoid_drama", value: "避免过度戏剧化和夸张表达", category: "avoid", source: "human_edit" });
    const state = { ...empty(), strategies: drama.strategies };
    const result = await new GrowthLoopAgent().generateContentOpportunity(context(state));
    expect(result.debug.strategyUsed).toContain("避免过度戏剧化和夸张表达");
    expect(result.debug.userPreferenceUsed).toContain("避免过度戏剧化和夸张表达");
    expect(result.debug.promptVersion).toBe("growth-loop.v3");
    expect(result.debug.provider).toBe("mock");
    expect(result.debug.feedbackUsed).toEqual([]);
    expect(result.debug.finalGenerationContext).toContain("promptVersion=growth-loop.v3");
    expect(result.debug.finalGenerationContext).toContain("learnings=0");
  });
});
