import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "../english/provider.js";

const base = "/api/v1/growth-loop";
const input = { date: "2026-09-10", whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。", myReaction: "直接开始做", whatBotheredMe: "反复返工", whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动", nextAction: "开始前确认三项标准" };
describe("growth loop API", () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "growth-api-test-"));
    const app = await buildApp({ englishWorkflow: { root, writer: createEnglishWriter({}) } });
    cleanups.push(() => app.close(), () => rm(root, { recursive: true, force: true })); return app;
  }
  it("runs real-input retrospective → analysis → draft → review → ready → published → metrics", async () => {
    const app = await setup();
    let response = await app.inject({ method: "POST", url: base + "/retrospectives", payload: input });
    expect(response.statusCode).toBe(200); let retro = response.json().data;
    response = await app.inject({ method: "PUT", url: `${base}/retrospectives/${retro.id}`, payload: { revision: retro.revision, input: { ...input, optionalNote: "已确认" } } });
    retro = response.json().data; expect(retro.revision).toBe(1);
    response = await app.inject({ method: "POST", url: `${base}/retrospectives/${retro.id}/analyze`, payload: { revision: retro.revision } });
    retro = response.json().data; expect(retro.analysis).toMatchObject({ contentPotential: 8, recommendedAccount: "growth" });
    response = await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic: "返工之前先确认范围", contentType: "solution", sourceRetrospectiveId: retro.id } });
    let content = response.json().data; expect(content.status).toBe("draft");
    response = await app.inject({ method: "POST", url: `${base}/contents/${content.id}/publish`, payload: { revision: 0, publishTime: new Date().toISOString() } });
    expect(response.statusCode).toBe(409);
    response = await app.inject({ method: "POST", url: `${base}/contents/${content.id}/generate`, payload: { revision: 0 } });
    content = response.json().data; expect(content.status).toBe("review"); expect(content.writing.body).toContain(input.whatHappened);
    response = await app.inject({ method: "PUT", url: `${base}/contents/${content.id}/review`, payload: { revision: content.revision, writing: { ...content.writing, title: "审核后的标题" }, english: null, note: "已核对事实", status: "ready" } });
    content = response.json().data; expect(content.title).toBe("审核后的标题");
    response = await app.inject({ method: "POST", url: `${base}/contents/${content.id}/publish`, payload: { revision: content.revision, publishTime: new Date().toISOString() } });
    content = response.json().data; expect(content.status).toBe("published");
    for (const views of [0, 120]) {
      response = await app.inject({ method: "POST", url: `${base}/contents/${content.id}/metrics`, payload: { views, likes: 4, favorites: 2, comments: 1, followersGained: 1 } });
      expect(response.statusCode).toBe(200);
    }
    expect((await app.inject(base)).json().data.metrics).toHaveLength(2);
    response = await app.inject({ method: "POST", url: `${base}/contents/${content.id}/analyze` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.NEXT_EXPERIMENT.variable).toBe("hook");
    const feedbackId = response.json().data.id;
    expect((await app.inject({ method: "POST", url: `${base}/contents/${content.id}/analyze` })).json().data.id).toBe(feedbackId);
    expect((await app.inject(base + "/dashboard")).json().data.focus.NEXT_3_POSTS).toHaveLength(3);
    const next = (await app.inject({ method: "POST", url: base + "/contents", payload: { account: "growth", topic: "新的交付经历", contentType: "solution", sourceRetrospectiveId: retro.id, sourceContentId: content.id } })).json().data;
    expect(next.experiment.variable).toBe("hook");
    const generatedNext = (await app.inject({ method: "POST", url: `${base}/contents/${next.id}/generate`, payload: { revision: 0 } })).json().data;
    expect(generatedNext.writing.body).toContain("如果你也遇到");
    response = await app.inject({ method: "PUT", url: `${base}/retrospectives/${retro.id}`, payload: { revision: retro.revision, input } });
    expect(response.json().data.analysis).toBeNull();
  });
  it("reuses English 50-sentence workflow and emotion pipeline", async () => {
    const app = await setup();
    for (const account of ["english", "emotion"]) {
      const created = (await app.inject({ method: "POST", url: base + "/contents", payload: { account, topic: account === "english" ? "尴尬时刻英语50句" : "分别之后的想念", contentType: "list" } })).json().data;
      const response = await app.inject({ method: "POST", url: `${base}/contents/${created.id}/generate`, payload: { revision: 0 } });
      expect(response.statusCode).toBe(200);
      const value = response.json().data;
      if (account === "english") expect(value.english.sentences).toHaveLength(50); else expect(value.writing.body.length).toBeGreaterThan(0);
      expect(value.status).toBe("review");
    }
  });
});
