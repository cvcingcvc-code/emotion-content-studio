import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, mkdtemp, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import {
  EnglishWorkflowInputSchema, EnglishWorkflowDraftSchema, EnglishHistorySchema, EnglishReviewInputSchema,
  normalizeEnglishTopic, type EnglishWorkflowDraft, type EnglishHistoryEntry, type EnglishWriting,
} from "@emotion-studio/contracts";
import { z } from "zod";
import { AppError } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import type { ContentRepository } from "../content/repository.js";
import { createEnglishWriter, type EnglishWriter } from "./provider.js";
import { englishCardHtml, renderEnglishPngs, renderEnglishPagePng } from "./cards.js";
import { EnglishWritingSchema } from "@emotion-studio/contracts";

const defaultRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const files = ["page-01.png", "page-02.png", "page-03.png", "page-04.png", "page-05.png", "content.md", "content.json"];
const IdSchema = z.string().regex(/^[a-f0-9]{24}$/);
async function readJson(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new AppError(503, "LOCAL_STORAGE_ERROR", "本地内容文件无法读取，请检查文件，不会覆盖已有记录。");
  }
}
async function writeJson(path: string, value: unknown) {
  const temporary = path + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}
function markdown(writing: EnglishWriting): string {
  return "# " + writing.title + "\n\n" + writing.body + "\n\n" + writing.tags.join(" ") + "\n\n" +
    writing.groupNames.map((name, index) => "## " + name + "\n\n" + writing.sentences.slice(index * 10, index * 10 + 10)
      .map((line) => line.number + ". " + line.english + "\n\n" + line.chinese).join("\n\n")).join("\n\n") + "\n";
}

export interface EnglishWorkflowOptions {
  root?: string;
  writer?: EnglishWriter;
  render?: (writing: EnglishWriting, directory: string) => Promise<void>;
}

export class EnglishWorkflow {
  readonly root: string;
  readonly writer: EnglishWriter;
  private readonly renderer: NonNullable<EnglishWorkflowOptions["render"]>;
  private busy = false;
  constructor(private readonly repository: ContentRepository, options: EnglishWorkflowOptions = {}) {
    this.root = resolve(options.root ?? defaultRoot);
    this.writer = options.writer ?? createEnglishWriter();
    this.renderer = options.render ?? renderEnglishPngs;
  }
  private get historyPath() { return join(this.root, "data", "english-topic-history.json"); }
  private draftPath(id: string) { return join(this.root, "data", "english-drafts", IdSchema.parse(id) + ".json"); }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) throw new AppError(429, "ENGLISH_BUSY", "正在处理一个任务，请稍后再试；不会重复调用模型。");
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }
  async history(): Promise<EnglishHistoryEntry[]> {
    const history = EnglishHistorySchema.parse(await readJson(this.historyPath) ?? []);
    // Import already-generated topics from the existing project repository, not just the new tool.
    const generated = await this.repository.listGenerated("fun_english");
    for (const draft of generated) {
      if (draft.output?.kind !== "english_50.v1") continue;
      const topic = draft.output.topic;
      if (!history.some((entry) => normalizeEnglishTopic(entry.topic) === normalizeEnglishTopic(topic))) {
        history.push({ topic, generated_at: draft.createdAt, status: "previously_generated", output_path: null, draft_id: null });
      }
    }
    return history;
  }
  async draft(id: string): Promise<EnglishWorkflowDraft> {
    const value = await readJson(this.draftPath(id));
    if (!value) throw new AppError(404, "ENGLISH_NOT_FOUND", "未找到这份英语稿件");
    return EnglishWorkflowDraftSchema.parse(value);
  }
  private async persist(draft: EnglishWorkflowDraft, history: EnglishHistoryEntry[]) {
    await mkdir(join(this.root, "data", "english-drafts"), { recursive: true });
    // Draft first: the deterministic topic ID recovers it without another LLM call after interruption.
    await writeJson(this.draftPath(draft.id), draft);
    const key = normalizeEnglishTopic(draft.writing.topic);
    let matched = false;
    const updated = history.map((entry) => {
      if (entry.draft_id !== draft.id && normalizeEnglishTopic(entry.topic) !== key) return entry;
      if (normalizeEnglishTopic(entry.topic) === key) matched = true;
      return { ...entry, draft_id: draft.id, generated_at: draft.generated_at, status: draft.output_path ? "exported" as const : draft.status, output_path: draft.output_path };
    });
    if (!matched) updated.push({ topic: draft.writing.topic, generated_at: draft.generated_at, status: draft.output_path ? "exported" : draft.status, output_path: draft.output_path, draft_id: draft.id });
    await writeJson(this.historyPath, updated);
  }
  async generate(raw: unknown, signal?: AbortSignal) {
    const input = parseOrThrow(EnglishWorkflowInputSchema, raw);
    return this.exclusive(async () => {
      const history = await this.history();
      const key = normalizeEnglishTopic(input.topic);
      const existing = history.find((entry) => normalizeEnglishTopic(entry.topic) === key);
      if (existing) return { duplicate: true, existing, draft: existing.draft_id ? await this.draft(existing.draft_id) : null };
      const id = createHash("sha256").update(key).digest("hex").slice(0, 24);
      const recovered = await readJson(this.draftPath(id));
      if (recovered) {
        const draft = EnglishWorkflowDraftSchema.parse(recovered);
        await this.persist(draft, history);
        return { duplicate: true, existing: null, draft };
      }
      const result = await this.writer.generate(input, signal);
      signal?.throwIfAborted();
      const now = new Date().toISOString();
      const draft = EnglishWorkflowDraftSchema.parse({
        id, revision: 0, generated_at: now, updated_at: now, status: "needs_revision",
        provider: result.provider, model: result.model, writing: result.writing, output_path: null,
      });
      await this.persist(draft, history);
      return { duplicate: false, draft, existing: null };
    });
  }
  async review(id: string, raw: unknown) {
    const input = parseOrThrow(EnglishReviewInputSchema, raw);
    return this.exclusive(async () => {
      const draft = await this.draft(id);
      if (input.revision !== draft.revision) throw new AppError(409, "STALE_REVISION", "稿件已经更新，请重新打开后编辑");
      const history = await this.history();
      if (history.some((entry) => normalizeEnglishTopic(entry.topic) === normalizeEnglishTopic(input.writing.topic) && entry.draft_id !== id)) {
        throw new AppError(409, "TOPIC_EXISTS", "该主题已经生成过，是否查看已有内容？");
      }
      const unchanged = JSON.stringify(input.writing) === JSON.stringify(draft.writing) && input.status === draft.status;
      if (unchanged) return draft;
      const updated = EnglishWorkflowDraftSchema.parse({ ...draft, writing: input.writing, status: input.status, revision: draft.revision + 1, updated_at: new Date().toISOString(), output_path: null });
      await this.persist(updated, history);
      return updated;
    });
  }
  async export(id: string, revision: number) {
    return this.exclusive(async () => {
      const draft = await this.draft(id);
      if (revision !== draft.revision) throw new AppError(409, "STALE_REVISION", "请先保存并审核最新修改");
      if (draft.status !== "approved") throw new AppError(409, "REVIEW_REQUIRED", "请先人工审核并批准，再生成发布包");
      const slug = draft.writing.topic.normalize("NFKC").replace(/[^\p{L}\p{N}-]/gu, "-").slice(0, 55);
      const relative = `output/${slug}-${id.slice(0, 6)}-r${revision}`;
      const target = join(this.root, relative);
      await mkdir(join(this.root, "output"), { recursive: true });
      let complete = true;
      for (const name of files) { try { await access(join(target, name)); } catch { complete = false; } }
      if (!complete) {
        const temporary = await mkdtemp(join(this.root, "output", ".render-"));
        try { await this.renderer(draft.writing, temporary); }
        catch (error) {
          throw new AppError(422, "CARD_RENDER_ERROR", error instanceof Error && error.message === "CARD_OVERFLOW"
            ? "卡片文字过长，请缩短后重新批准；未导出截断图片。" : "PNG 渲染失败，请确认已安装 Edge（Windows）或 Playwright Chromium。");
        }
        const packaged = { ...draft, output_path: relative, pages: draft.writing.groupNames.map((name, index) => ({
          page: index + 1, group: name, width: 900, height: 1200, sentences: draft.writing.sentences.slice(index * 10, index * 10 + 10),
        })) };
        await writeFile(join(temporary, "content.md"), markdown(draft.writing), "utf8");
        await writeFile(join(temporary, "content.json"), JSON.stringify(packaged, null, 2) + "\n", "utf8");
        await rename(temporary, target);
      }
      await this.persist({ ...draft, output_path: relative }, await this.history());
      return { output_path: relative, files: files.map((name) => ({ name, url: `/api/v1/english/drafts/${id}/files/${name}` })) };
    });
  }
  async file(id: string, name: string) {
    if (!files.includes(name)) throw new AppError(404, "FILE_NOT_FOUND", "未找到发布文件");
    const draft = await this.draft(id);
    if (!draft.output_path) throw new AppError(409, "EXPORT_REQUIRED", "请先生成当前版本发布包");
    const directory = resolve(this.root, draft.output_path);
    if (!directory.startsWith(resolve(this.root, "output") + (process.platform === "win32" ? "\\" : "/"))) throw new AppError(400, "INVALID_PATH", "文件路径无效");
    return readFile(join(directory, name));
  }
}

export async function registerEnglishWorkflow(app: FastifyInstance, repository: ContentRepository, options?: EnglishWorkflowOptions) {
  const workflow = new EnglishWorkflow(repository, options);
  const ok = (id: string, data: unknown) => ({ ok: true, data, requestId: id });
  const idOf = (params: unknown) => parseOrThrow(z.object({ id: IdSchema }), params).id;
  let rendering = false;
  app.post("/api/v1/english/preview/png", async (request, reply) => {
    const input = parseOrThrow(z.object({ writing: EnglishWritingSchema, page: z.number().int().min(1).max(5) }).strict(), request.body);
    if (rendering) throw new AppError(429, "ENGLISH_BUSY", "正在导出图片，请稍后再试");
    rendering = true;
    try {
      const png = await renderEnglishPagePng(input.writing, input.page);
      reply.header("content-disposition", `attachment; filename="english-topic-page-${input.page}.png"`);
      return reply.type("image/png").send(png);
    } catch (error) {
      throw new AppError(422, "CARD_RENDER_ERROR", error instanceof Error && error.message === "CARD_OVERFLOW"
        ? "文字超出卡片范围，请缩短当前页句子后再导出。" : "PNG 导出失败，请确认本机 Edge 或 Chromium 可用。");
    } finally { rendering = false; }
  });
  app.get("/api/v1/english", async (request) => ok(request.id, { mode: workflow.writer.mode, history: await workflow.history() }));
  app.post("/api/v1/english/generate", async (request, reply) => {
    const controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    request.raw.once("aborted", abort);
    reply.raw.once("close", abort);
    try { return ok(request.id, await workflow.generate(request.body, controller.signal)); }
    finally { request.raw.removeListener("aborted", abort); reply.raw.removeListener("close", abort); }
  });
  app.get("/api/v1/english/drafts/:id", async (request) => ok(request.id, await workflow.draft(idOf(request.params))));
  app.put("/api/v1/english/drafts/:id", async (request) => ok(request.id, await workflow.review(idOf(request.params), request.body)));
  app.post("/api/v1/english/drafts/:id/export", async (request) => {
    const input = parseOrThrow(z.object({ revision: z.number().int().nonnegative() }).strict(), request.body);
    return ok(request.id, await workflow.export(idOf(request.params), input.revision));
  });
  app.get("/api/v1/english/drafts/:id/pages/:page", async (request, reply) => {
    const params = parseOrThrow(z.object({ id: IdSchema, page: z.coerce.number().int().min(1).max(5) }), request.params);
    const draft = await workflow.draft(params.id);
    reply.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'");
    reply.header("cache-control", "no-store");
    return reply.type("text/html; charset=utf-8").send(englishCardHtml(draft.writing, params.page));
  });
  app.get("/api/v1/english/drafts/:id/files/:name", async (request, reply) => {
    const params = parseOrThrow(z.object({ id: IdSchema, name: z.string() }), request.params);
    const bytes = await workflow.file(params.id, params.name);
    reply.header("content-disposition", `attachment; filename="${params.name}"`);
    return reply.type(params.name.endsWith(".png") ? "image/png" : params.name.endsWith(".json") ? "application/json" : "text/markdown; charset=utf-8").send(bytes);
  });
}
