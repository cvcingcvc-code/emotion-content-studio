import type { FastifyInstance } from "fastify";
import { BatchGenerateInputSchema, ContentTextExportInputSchema, batchContentKey, growthPublishText, type BatchGenerateResult } from "@emotion-studio/contracts";
import { AiProviderError } from "../ai/errors.js";
import { AppError } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import type { GrowthLoopService } from "./service.js";

export async function registerBatchContentRoutes(app: FastifyInstance, service: GrowthLoopService) {
  let generating = false;
  const base = "/api/v1/growth-loop/batch";
  app.post(base + "/generate", async request => {
    const input = parseOrThrow(BatchGenerateInputSchema, request.body);
    if (generating) throw new AppError(429, "BATCH_BUSY", "批量生成正在进行，请等待结果后再试。");
    generating = true;
    const results: BatchGenerateResult["results"] = [];
    const attempted = new Map<string, BatchGenerateResult["results"][number]>();
    try {
      for (const [index, item] of input.items.entries()) {
        const key = batchContentKey(item);
        const prior = attempted.get(key);
        if (prior) {
          results.push({ ...prior, index, status: prior.status === "failed" ? "failed" : "duplicate" });
          continue;
        }
        let content = (await service.repository.snapshot()).contents.find(existing => !existing.isDemo && !existing.sourceContentId && batchContentKey(existing) === key) ?? null;
        if (content && content.status !== "draft") {
          results.push({ index, status: "duplicate", content, error: null });
          attempted.set(key, results.at(-1)!);
          continue;
        }
        try {
          content ??= await service.createContent({ ...item, sourceContentId: null });
          content = await service.generate(content.id, content.revision);
          results.push({ index, status: "generated", content, error: null });
        } catch (error) {
          results.push({ index, status: "failed", content, error: error instanceof AppError || error instanceof AiProviderError
            ? { code: error.code, message: error.message }
            : { code: "GENERATION_FAILED", message: "本条生成失败，已保存的草稿可重试。" } });
        }
        attempted.set(key, results.at(-1)!);
      }
      return { ok: true, data: { results }, requestId: request.id };
    } finally { generating = false; }
  });
  app.post(base + "/export", async request => {
    const input = parseOrThrow(ContentTextExportInputSchema, request.body);
    const state = await service.repository.snapshot();
    const ids = new Set<string>();
    const contents = input.items.map(ref => {
      if (ids.has(ref.id)) throw new AppError(400, "DUPLICATE_SELECTION", "导出列表不能重复选择同一篇。");
      ids.add(ref.id);
      const content = state.contents.find(item => item.id === ref.id);
      if (!content) throw new AppError(404, "NOT_FOUND", "所选内容不存在。");
      if (content.revision !== ref.revision) throw new AppError(409, "STALE_REVISION", "内容已更新，请刷新后再导出。");
      if (!["ready", "published"].includes(content.status)) throw new AppError(409, "REVIEW_REQUIRED", "每篇内容须人工通过审核后才能导出发布文案。");
      if (!content.writing && !content.english) throw new AppError(409, "CONTENT_REQUIRED", "内容尚未生成。");
      return content;
    });
    const exported = contents.map(content => ({ id: content.id, revision: content.revision, account: content.account, status: content.status, provider: content.provider, title: content.title, publishText: growthPublishText(content), writing: content.writing, english: content.english }));
    const text = input.format === "json" ? JSON.stringify({ format: "emotion-studio-reviewed-content.v1", contents: exported }, null, 2) + "\n"
      : exported.map(content => `${content.title}\n\n${content.publishText}`).join("\n\n————————\n\n") + "\n";
    return { ok: true, data: { filename: `xiaohongshu-reviewed.${input.format === "json" ? "json" : "txt"}`, mimeType: input.format === "json" ? "application/json" : "text/plain", content: text, total: contents.length }, requestId: request.id };
  });
}
