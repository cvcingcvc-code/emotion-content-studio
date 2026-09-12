import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "../english/provider.js";

const base = "/api/v1/growth-loop";
const retroInput = {
  date: "2026-09-10",
  whatHappened: "今天没有先确认交付范围就开始做，结果一个下午都在返工。",
  myReaction: "直接开工",
  whatBotheredMe: "反复返工",
  whatCouldBeHandledBetter: "先写清交付标准",
  lessonLearned: "先确认再行动",
  nextAction: "开始前确认三项标准",
};
const twelveHoursAgo = () => new Date(Date.now() - 12 * 3_600_000).toISOString();

type App = Awaited<ReturnType<typeof buildApp>>;
type ExperimentView = {
  variable: string; variant: string; status: string;
  requiredSamples: number; currentSamples: number; completedAt: string | null; confidence: string;
};
type ContentView = { id: string; revision: number; status: string; experiment: ExperimentView | null };

/**
 * continue_testing 是「还不能下结论，继续累积样本」，不是「结束这轮实验」。
 * 若它把 status 写成 completed，decideExperiment 顶部的 EXPERIMENT_COMPLETED 守卫
 * 会让这个选项在第一次点击之后就永久失效 —— 这里把正确语义锁死。
 */
describe("decideExperiment：continue_testing 必须让实验保持开放", () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "growth-experiment-test-"));
    const app = await buildApp({ englishWorkflow: { root, writer: createEnglishWriter({}) } });
    cleanups.push(() => app.close(), () => rm(root, { recursive: true, force: true }));
    return app;
  }

  async function retro(app: App) {
    let item = (await app.inject({ method: "POST", url: base + "/retrospectives", payload: retroInput })).json().data;
    item = (await app.inject({ method: "POST", url: `${base}/retrospectives/${item.id}/analyze`, payload: { revision: item.revision } })).json().data;
    return item.id as string;
  }

  /** 完整闭环：创建 → 生成 → 审核通过 → 发布 → 录指标。返回内容 id 与创建时推荐的实验。 */
  async function publish(app: App, retroId: string, topic: string, views: number, sourceContentId: string | null) {
    const created = (await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic, contentType: "solution", sourceRetrospectiveId: retroId, sourceContentId } })).json().data;
    const generated = (await app.inject({ method: "POST", url: `${base}/contents/${created.id}/generate`, payload: { revision: 0 } })).json().data;
    const ready = (await app.inject({ method: "PUT", url: `${base}/contents/${created.id}/review`, payload: { revision: generated.revision, writing: generated.writing, english: null, note: "", status: "ready" } })).json().data;
    await app.inject({ method: "POST", url: `${base}/contents/${created.id}/publish`, payload: { revision: ready.revision, publishTime: twelveHoursAgo() } });
    await app.inject({ method: "POST", url: `${base}/contents/${created.id}/metrics`, payload: { views, likes: Math.round(views * .05), favorites: Math.round(views * .03), comments: 1, followersGained: 1 } });
    // 让每篇的 publishedAt 严格递增，避免同毫秒带来的排序不确定性。
    await new Promise(resolve => setTimeout(resolve, 5));
    return { id: created.id as string, experiment: created.experiment as ExperimentView | null };
  }

  async function current(app: App, id: string) {
    const state = (await app.inject(base)).json().data;
    return state.contents.find((x: ContentView) => x.id === id) as ContentView;
  }

  /** 每次都用最新 revision 决策，避免受到 recordMetrics 推进修订号的影响。 */
  async function decide(app: App, id: string, outcome: string) {
    const content = await current(app, id);
    const response = await app.inject({ method: "POST", url: `${base}/contents/${id}/experiment`, payload: { revision: content.revision, outcome } });
    const body = response.json();
    return { code: response.statusCode, content: body.data as ContentView | undefined, error: body.error as { code: string } | undefined };
  }

  it("连续 continue_testing 不会结题，也不会被 EXPERIMENT_COMPLETED 拦住；promote / reject 仍正常结题", async () => {
    const app = await setup();
    const retroId = await retro(app);

    // 3 篇 100 阅读的基线，建立 24h 同账号可比基线。
    const baselines: string[] = [];
    for (const topic of ["交付前先确认范围", "接到模糊任务先问清验收标准", "把返工原因写成清单"]) {
      baselines.push((await publish(app, retroId, topic, 100, null)).id);
    }
    // 低表现链：让「上一篇」相对表现 <= -20%，推荐值就固定为 title_style=question。
    const low1 = await publish(app, retroId, "被临时消息打断的一天", 10, baselines[0]!);
    const low2 = await publish(app, retroId, "又一次被临时消息打断", 10, low1.id);
    const low3 = await publish(app, retroId, "第三次被临时消息打断", 10, low2.id);
    const target = await publish(app, retroId, "确认范围之后依然被打断", 10, low3.id);

    // 前置条件：后三篇带的是同一个实验取值，且已发布样本数达到 requiredSamples。
    expect(low2.experiment?.variable).toBe("title_style");
    expect(target.experiment?.variable).toBe("title_style");
    expect(target.experiment?.variant).toBe("question");
    expect(target.experiment?.requiredSamples).toBe(3);
    expect(target.experiment?.status).not.toBe("completed");

    // 1) 第一次「继续测试」：实验保持开放
    const first = await decide(app, target.id, "continue_testing");
    expect(first.code).toBe(200);
    expect(first.content!.experiment!.status).not.toBe("completed");
    expect(["running", "evaluating"]).toContain(first.content!.experiment!.status);
    expect(first.content!.experiment!.completedAt).toBeNull();
    const samplesAfterFirst = first.content!.experiment!.currentSamples;
    expect(samplesAfterFirst).toBeGreaterThanOrEqual(3);

    // 2) 第二次「继续测试」：修复前这里会 409 EXPERIMENT_COMPLETED
    const second = await decide(app, target.id, "continue_testing");
    expect(second.code).toBe(200);
    expect(second.error).toBeUndefined();
    expect(second.content!.experiment!.status).not.toBe("completed");
    expect(second.content!.experiment!.completedAt).toBeNull();
    expect(second.content!.experiment!.currentSamples).toBeGreaterThanOrEqual(samplesAfterFirst);

    // 3) promote_to_strategy 仍然正常结题
    const promoted = await decide(app, target.id, "promote_to_strategy");
    expect(promoted.code).toBe(200);
    expect(promoted.content!.experiment!.status).toBe("completed");
    expect(promoted.content!.experiment!.completedAt).not.toBeNull();
    expect(promoted.content!.experiment!.confidence).toBe("MEDIUM");

    // 结题之后才允许被守卫拦住
    const afterCompleted = await decide(app, target.id, "continue_testing");
    expect(afterCompleted.code).toBe(409);
    expect(afterCompleted.error!.code).toBe("EXPERIMENT_COMPLETED");

    // 4) reject 仍然正常结题
    const rejected = await decide(app, low3.id, "reject");
    expect(rejected.code).toBe(200);
    expect(rejected.content!.experiment!.status).toBe("completed");
    expect(rejected.content!.experiment!.completedAt).not.toBeNull();
  });
});
