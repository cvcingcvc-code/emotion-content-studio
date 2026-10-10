import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createMockPipelines } from "../studio/pipelines/index.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
async function createApp(pipelines = createMockPipelines()) { const app = await buildApp({ pipelines }); apps.push(app); return app; }
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const item = (topic = "把感受写下来") => ({ account: "emotion", topic, contentType: "reflection", sourceRetrospectiveId: null });
const base = "/api/v1/growth-loop";
describe("Xiaohongshu batch workspace API", { timeout: 15000 }, () => {
  it("deduplicates normalized topics within a batch and across retries without approving content", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item("ＦＯＣＵＳ  today"), item("focus today")] } });
    expect(response.statusCode).toBe(200);
    const rows = response.json().data.results;
    expect(rows.map((row: { status: string }) => row.status)).toEqual(["generated", "duplicate"]);
    expect(rows[0].content.id).toBe(rows[1].content.id);
    expect(rows[0].content.status).toBe("review");
    const retry = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item("focus today")] } });
    expect(retry.json().data.results[0].status).toBe("duplicate");
    expect((await app.inject(base)).json().data.contents).toHaveLength(1);
  });
  it("preserves failed drafts, isolates failures and retries only the existing draft", async () => {
    const pipelines = createMockPipelines();
    vi.spyOn(pipelines.emotionGenerator, "generate").mockRejectedValueOnce(new Error("private-upstream-key"));
    const app = await createApp(pipelines);
    const response = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item("失败后再试"), item("独立的第二篇")] } });
    expect(response.json().data.results.map((row: { status: string }) => row.status)).toEqual(["failed", "generated"]);
    expect(response.body).not.toContain("private-upstream-key");
    const id = response.json().data.results[0].content.id;
    const retry = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item("失败后再试")] } });
    expect(retry.json().data.results[0]).toMatchObject({ status: "generated", content: { id, status: "review" } });
    expect((await app.inject(base)).json().data.contents).toHaveLength(2);
  });
  it("rejects concurrent batches before a second generation call", async () => {
    const pipelines = createMockPipelines();
    const original = pipelines.emotionGenerator.generate.bind(pipelines.emotionGenerator);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    const generate = vi.spyOn(pipelines.emotionGenerator, "generate").mockImplementationOnce(async input => { started(); await wait; return original(input); });
    const app = await createApp(pipelines);
    const pending = app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item()] } });
    await entered;
    try {
      const second = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item("其他主题")] } });
      expect(second.statusCode).toBe(429); expect(second.json().error.code).toBe("BATCH_BUSY");
    } finally { release(); await pending; }
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("requires review and matching revisions for text and full JSON exports", async () => {
    const app = await createApp();
    const generated = (await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [item()] } })).json().data.results[0].content;
    const exportOne = (revision: number, format = "text") => app.inject({ method: "POST", url: base + "/batch/export", payload: { items: [{ id: generated.id, revision }], format } });
    expect((await exportOne(generated.revision)).json().error.code).toBe("REVIEW_REQUIRED");
    const ready = (await app.inject({ method: "PUT", url: `${base}/contents/${generated.id}/review`, payload: { revision: generated.revision, writing: generated.writing, english: null, note: "人工核对", status: "ready" } })).json().data;
    expect((await exportOne(generated.revision)).json().error.code).toBe("STALE_REVISION");
    const text = await exportOne(ready.revision);
    expect(text.json().data).toMatchObject({ total: 1, filename: "xiaohongshu-reviewed.txt" });
    expect(text.json().data.content).toContain(ready.title);
    const json = JSON.parse((await exportOne(ready.revision, "json")).json().data.content);
    expect(json.contents[0]).toMatchObject({ id: ready.id, revision: ready.revision, status: "ready", writing: ready.writing });
    const duplicates = await app.inject({ method: "POST", url: base + "/batch/export", payload: { items: [{ id: ready.id, revision: ready.revision }, { id: ready.id, revision: ready.revision }], format: "json" } });
    expect(duplicates.statusCode).toBe(400);
  });
  it("validates batch limits and leaves unfinished growth drafts recoverable", async () => {
    const app = await createApp();
    const malformed = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: Array.from({ length: 11 }, () => item()) } });
    expect(malformed.statusCode).toBe(400);
    const missing = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [{ ...item(), account: "growth" }] } });
    expect(missing.json().data.results[0]).toMatchObject({ status: "failed", error: { code: "RETROSPECTIVE_REQUIRED" }, content: { status: "draft" } });
  });
  it("keeps repeated failed inputs failed instead of claiming a missing draft was reused", async () => {
    const app = await createApp();
    const missing = { ...item(), account: "growth", sourceRetrospectiveId: "00000000-0000-4000-8000-000000000001" };
    const response = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [missing, missing] } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.results).toMatchObject([
      { index: 0, status: "failed", content: null, error: { code: "NOT_FOUND" } },
      { index: 1, status: "failed", content: null, error: { code: "NOT_FOUND" } },
    ]);
    expect((await app.inject(base)).json().data.contents).toHaveLength(0);
  });
  it("keeps separate retrospective sources and content formats independent in real growth batches", async () => {
    const app = await createApp();
    const sources: string[] = [];
    for (const optionalNote of ["合成复盘甲", "合成复盘乙"]) {
      let retro = (await app.inject({ method: "POST", url: base + "/retrospectives", payload: {
        date: "2026-10-09", whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。", myReaction: "直接开始做", whatBotheredMe: "反复返工", whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动", nextAction: "开始前确认三项标准", optionalNote,
      } })).json().data;
      retro = (await app.inject({ method: "POST", url: `${base}/retrospectives/${retro.id}/analyze`, payload: { revision: retro.revision } })).json().data;
      sources.push(retro.id);
    }
    const row = { account: "growth", topic: "同一个方向", contentType: "solution", sourceRetrospectiveId: sources[0] };
    const response = await app.inject({ method: "POST", url: base + "/batch/generate", payload: { items: [row, { ...row, sourceRetrospectiveId: sources[1] }, { ...row, contentType: "story" }, row] } });
    expect(response.statusCode).toBe(200);
    const results = response.json().data.results;
    expect(results.map((value: { status: string }) => value.status)).toEqual(["generated", "generated", "generated", "duplicate"]);
    expect(new Set(results.slice(0, 3).map((value: { content: { id: string } }) => value.content.id)).size).toBe(3);
    expect(results[3].content.id).toBe(results[0].content.id);
    expect((await app.inject(base)).json().data.contents).toHaveLength(3);
  });
});
