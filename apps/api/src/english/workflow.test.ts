import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnglishWritingSchema, ENGLISH_DEMO_TOPICS, normalizeEnglishTopic, similarEnglishTopics } from "@emotion-studio/contracts";
import { InMemoryContentRepository } from "../content/repository.js";
import { buildApp } from "../app.js";
import { EnglishWorkflow } from "./workflow.js";
import { createEnglishWriter } from "./provider.js";
import { demoEnglishWriting } from "./demo-content.js";
import { englishCardHtml } from "./cards.js";

const topic = ENGLISH_DEMO_TOPICS[0];
const input = { topic, tone: "日常" as const };
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "english-mvp-test-"));
  const writer = createEnglishWriter({});
  const generate = vi.spyOn(writer, "generate");
  const render = vi.fn(async (_writing, directory: string) => {
    for (let i = 1; i <= 5; i++) await writeFile(join(directory, `page-0${i}.png`), "unit-test-render-placeholder");
  });
  const repository = new InMemoryContentRepository();
  const workflow = new EnglishWorkflow(repository, { root, writer, render });
  return { root, writer, generate, render, repository, workflow };
}

describe("English Account MVP", () => {
  it("splits the current review into five pages and reflects edits only on the corresponding page", () => {
    const writing = demoEnglishWriting(input);
    writing.sentences[10] = { number: 11, english: "Let me say that again.", chinese: "让我再说一遍。" };
    const pages = [1, 2, 3, 4, 5].map((page) => englishCardHtml(writing, page));
    expect(pages).toHaveLength(5);
    pages.forEach((html, index) => {
      expect(html.match(/<li>/g)).toHaveLength(10);
      for (const line of writing.sentences.slice(index * 10, index * 10 + 10)) expect(html).toContain(line.chinese);
    });
    expect(pages[1]).toContain("Let me say that again.");
    expect(pages[0]).not.toContain("Let me say that again.");
  });
  it.each(ENGLISH_DEMO_TOPICS)("provides newly authored 50-sentence demo %s", (topic) => {
    const draft = demoEnglishWriting({ ...input, topic });
    expect(EnglishWritingSchema.parse(draft).sentences).toHaveLength(50);
    expect(draft.titles).toHaveLength(5);
    expect(draft.tags.length).toBeGreaterThanOrEqual(5);
    for (let page = 1; page <= 5; page++) {
      const html = englishCardHtml(draft, page);
      expect(html.match(/<li>/g)).toHaveLength(10);
      expect(html).toContain(String(page).padStart(2, "0") + " / 05");
    }
  });
  it("blocks duplicates before calls, survives restart, and warns on normalized similar names", async () => {
    const { workflow, root, writer, generate, repository } = await setup();
    const first = await workflow.generate(input);
    expect(first.duplicate).toBe(false);
    expect(first.draft?.status).toBe("needs_revision");
    const restarted = new EnglishWorkflow(repository, { root, writer });
    const again = await restarted.generate({ ...input, topic: "尴尬时刻 英语５０句！" });
    expect(again.duplicate).toBe(true);
    expect(again.draft?.id).toBe(first.draft?.id);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(normalizeEnglishTopic("尴尬时刻 英语五十句")).toBe(normalizeEnglishTopic(topic));
    expect(similarEnglishTopics("尴尬时刻口语50句", await restarted.history())).toHaveLength(1);
  });
  it("preserves user-provided old-topic history without fabricating dates or re-generating", async () => {
    const { root, workflow, generate } = await setup();
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(join(root, "data", "english-topic-history.json"), JSON.stringify([{
      topic: "拖延症英语50句", generated_at: null, status: "previously_generated", output_path: null, draft_id: null,
    }]));
    expect((await workflow.generate({ ...input, topic: "拖延症英语50句" })).duplicate).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });
  it("requires review, saves edits, exports exactly seven files, and does not render unchanged exports twice", async () => {
    const { workflow, root, render } = await setup();
    const result = await workflow.generate(input);
    const draft = result.draft!;
    await expect(workflow.export(draft.id, 0)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    const writing = structuredClone(draft.writing);
    writing.sentences[0]!.english = "Sorry, I thought you were my friend.";
    writing.sentences[0]!.chinese = "不好意思，我还以为你是我朋友。";
    writing.title = "尴尬也能接住｜50句日常英语";
    writing.body += "\n先从第一句练起。";
    const approved = await workflow.review(draft.id, { revision: 0, writing, status: "approved" });
    expect(approved.revision).toBe(1);
    const output = await workflow.export(draft.id, 1);
    expect(output.files.map((file) => file.name)).toEqual(["page-01.png", "page-02.png", "page-03.png", "page-04.png", "page-05.png", "content.md", "content.json"]);
    const json = JSON.parse(await readFile(join(root, output.output_path, "content.json"), "utf8"));
    expect(json.writing).toEqual(writing);
    expect(json.pages).toHaveLength(5);
    expect(json.pages[4].sentences[9].number).toBe(50);
    const md = await readFile(join(root, output.output_path, "content.md"), "utf8");
    expect(md).toContain(writing.sentences[0]!.english);
    await workflow.export(draft.id, 1);
    expect(render).toHaveBeenCalledTimes(1);
    await expect(workflow.review(draft.id, { revision: 0, writing, status: "approved" })).rejects.toMatchObject({ code: "STALE_REVISION" });
    const changed = await workflow.review(draft.id, { revision: 1, writing: { ...writing, body: "重新修改的正文。" }, status: "needs_revision" });
    await expect(workflow.export(draft.id, changed.revision)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
  });
  it("validates count, numbering and duplicate English before approval; escapes card HTML", () => {
    const data = demoEnglishWriting(input);
    const bad = structuredClone(data);
    bad.sentences.pop();
    expect(EnglishWritingSchema.safeParse(bad).success).toBe(false);
    bad.sentences.push({ ...bad.sentences[0]! });
    expect(EnglishWritingSchema.safeParse(bad).success).toBe(false);
    const html = englishCardHtml({ ...data, topic: '<script>alert("x")</script>' }, 1);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("uses one main HTTP model request for an unseen topic; failures do not trigger repair or fallback", async () => {
    const content = demoEnglishWriting(input);
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    }), { status: 200 }));
    const writer = createEnglishWriter({ ENGLISH_AI_MODE: "real", AI_API_KEY: "test-only-key", AI_MODEL: "test-model" }, fetchImpl);
    const newInput = { topic: "朋友搬家帮忙英语50句", tone: "日常" as const };
    const result = await writer.generate(newInput);
    expect(result.provider).toBe("deepseek");
    expect(result.writing.topic).toBe(newInput.topic);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(newInput.topic);
    fetchImpl.mockResolvedValue(new Response("private upstream details", { status: 503 }));
    await expect(writer.generate(newInput)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("connects generate, preview, review and duplicate APIs without external requests", async () => {
    const { root, writer, render } = await setup();
    const app = await buildApp({ englishWorkflow: { root, writer, render } });
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/api/v1/english/generate", payload: input });
    expect(response.statusCode, response.body).toBe(200);
    const draft = response.json().data.draft;
    const preview = await app.inject(`/api/v1/english/drafts/${draft.id}/pages/5`);
    expect(preview.statusCode).toBe(200);
    expect(preview.body.match(/<li>/g)).toHaveLength(10);
    const approved = await app.inject({ method: "PUT", url: `/api/v1/english/drafts/${draft.id}`, payload: { revision: 0, writing: draft.writing, status: "approved" } });
    expect(approved.json().data.status).toBe("approved");
    const duplicate = await app.inject({ method: "POST", url: "/api/v1/english/generate", payload: input });
    expect(duplicate.json().data.duplicate).toBe(true);
  });
});
