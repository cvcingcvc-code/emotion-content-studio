import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "../english/provider.js";
import { detectPreferenceSignal, preferenceProposals, rejectStrategyProposal } from "./preference.js";

const base = "/api/v1/growth-loop";
const input = { date: "2026-09-10", whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。", myReaction: "直接开始做", whatBotheredMe: "反复返工", whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动", nextAction: "开始前确认三项标准" };
const draft = { title: "返工之前先确认范围", body: "震惊！全网都在返工。我觉得应该先确认范围。", corePoint: "确认", solution: "列标准！", endingQuestion: "你怎么做？", tags: ["#工作"] };

describe("preference signal", () => {
  it("records what the human actually changed instead of inferring intent", () => {
    const signal = detectPreferenceSignal(draft, { ...draft, title: "我为什么总是返工", body: "我认为应该先确认范围。", solution: "先写清交付标准。" });
    expect(signal.titleRewritten).toBe(true);
    expect(signal.removedDrama).toBe(true);
    expect(signal.summary).toContain("人工修改信号");
  });
  it("maps a single human edit to weak watch proposals only", () => {
    const signal = detectPreferenceSignal(draft, { ...draft, title: "我为什么总是返工" });
    const proposals = preferenceProposals(signal);
    expect(proposals.map(x => x.key)).toContain("title_preference");
    expect(proposals.length).toBeGreaterThan(0);
  });
  it("treats factually_wrong as a strong avoid signal and other as weak", () => {
    expect(rejectStrategyProposal("factually_wrong")).toMatchObject({ category: "avoid", confidence: "HIGH" });
    expect(rejectStrategyProposal("other").confidence).toBe("LOW");
  });
});

describe("human edit and reject learning signal wiring", () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "growth-pref-test-"));
    const app = await buildApp({ englishWorkflow: { root, writer: createEnglishWriter({}) } });
    cleanups.push(() => app.close(), () => rm(root, { recursive: true, force: true })); return app;
  }
  async function generate(app: Awaited<ReturnType<typeof setup>>) {
    let retro = (await app.inject({ method: "POST", url: base + "/retrospectives", payload: input })).json().data;
    retro = (await app.inject({ method: "POST", url: `${base}/retrospectives/${retro.id}/analyze`, payload: { revision: retro.revision } })).json().data;
    const created = (await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic: "返工之前先确认范围", contentType: "solution", sourceRetrospectiveId: retro.id } })).json().data;
    return (await app.inject({ method: "POST", url: `${base}/contents/${created.id}/generate`, payload: { revision: 0 } })).json().data;
  }
  it("keeps the AI draft and turns a human edit into a weak human_edit strategy", async () => {
    const app = await setup();
    const generated = await generate(app);
    expect(generated.aiDraft).toEqual(generated.writing);
    const reviewed = (await app.inject({ method: "PUT", url: `${base}/contents/${generated.id}/review`, payload: { revision: generated.revision, writing: { ...generated.writing, title: "我为什么总是返工", solution: "先写清交付标准。" }, english: null, note: "改了标题", status: "ready" } })).json().data;
    expect(reviewed.preferenceSignal).not.toBeNull();
    expect(reviewed.preferenceSignal.titleRewritten).toBe(true);
    const state = (await app.inject(base)).json().data;
    const human = (state.strategies as Array<{ source: string; category: string; confidence: string }>).filter(x => x.source === "human_edit");
    expect(human.length).toBeGreaterThan(0);
    expect(human.every(x => x.category === "watch" && x.confidence === "LOW")).toBe(true);
  });
  it("records a reject as an avoid/HIGH signal and keeps rejected content out of metrics", async () => {
    const app = await setup();
    const generated = await generate(app);
    const rejected = (await app.inject({ method: "POST", url: `${base}/contents/${generated.id}/reject`, payload: { revision: generated.revision, reason: "factually_wrong" } })).json().data;
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectReason).toBe("factually_wrong");
    expect(rejected.rejectedAt).not.toBeNull();
    const state = (await app.inject(base)).json().data;
    const entry = (state.strategies as Array<Record<string, unknown>>).find(x => x.source === "reject");
    expect(entry).toMatchObject({ category: "avoid", confidence: "HIGH", status: "active" });
    const metrics = await app.inject({ method: "POST", url: `${base}/contents/${generated.id}/metrics`, payload: { views: 10, likes: 1, favorites: 1, comments: 0, followersGained: 0 } });
    expect(metrics.statusCode).toBe(409);
    expect((await app.inject(base)).json().data.metrics).toHaveLength(0);
  });
});
