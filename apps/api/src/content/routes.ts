import {
  GeneratedContentSchema,
  ContentItemQuerySchema,
  CsvImportInputSchema,
  GenerateContentInputSchema,
  RegenerateContentInputSchema,
  ReviewGeneratedContentInputSchema,
  SetFavoriteInputSchema,
  type ApiSuccess,
  type ContentDashboard,
  type ContentDistribution,
  type ContentItem,
  type CsvImportSummary,
  type DemoDataLoadResult,
  type GeneratedContent,
} from "@emotion-studio/contracts";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import type { ContentAnalyzer } from "./analyzer.js";
import { parseContentCsv } from "./csv.js";
import { createDemoContentItems } from "./demo-data.js";
import type { ContentGenerator } from "./generator.js";
import { legacyGeneratedFields, type ContentRepository } from "./repository.js";

function success<T>(request: FastifyRequest, data: T, total?: number): ApiSuccess<T> {
  return total === undefined
    ? { ok: true, data, requestId: request.id }
    : { ok: true, data, requestId: request.id, meta: { total } };
}

function getId(request: FastifyRequest): string {
  const params = request.params as { id?: unknown };
  if (typeof params.id !== "string" || params.id.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "缺少有效的资源标识");
  }
  return params.id;
}

function countDistribution(values: string[]): ContentDistribution[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"),
  );
}

function regenerateDraft(generated: GeneratedContent, section: z.infer<typeof RegenerateContentInputSchema>["section"]): GeneratedContent {
  if (!generated.output) throw new AppError(409, "LEGACY_CONTENT", "旧版草稿不支持局部重生成");
  const output = structuredClone(generated.output) as typeof generated.output;
  const alternatives = generated.accountId === "personal_growth"
    ? ["先别急着给新环境下结论", "把观察变成可验证的问题", "成长不是立刻得到答案"]
    : generated.accountId === "fun_english"
      ? ["换个角度，把今天的表达说出来", "日常英语从一句真实的话开始", "把想说的话练成自己的句子"]
      : ["你不必马上解释所有情绪", "先照顾感受，再决定下一步", "有些答案可以慢一点出现"];
  if (section === "title") {
    const current = generated.title;
    const next = output.titles.find((title) => title !== current) ?? alternatives.find((title) => title !== current) ?? current;
    output.recommendedTitle = next;
    output.titles = [next, ...output.titles.filter((title) => title !== next)].slice(0, 3);
  } else if (section === "hook") {
    output.hook = alternatives[(alternatives.indexOf(output.hook ?? "") + 1 + alternatives.length) % alternatives.length] ?? alternatives[0];
  } else if (section === "body") {
    const bodyEnding = generated.accountId === "fun_english"
      ? "先挑一句最接近自己的表达，替换成真实信息练习；能在生活里说出来，比一次记住全部更重要。"
      : generated.accountId === "personal_growth"
        ? "把今天的观察留给明天验证，也给自己留一点调整的空间。"
        : "先承认感受，再做一个足够小的照顾自己的动作；原创表达从看见自己开始。";
    output.body = `${output.hook ?? alternatives[0]}\n\n${bodyEnding}`;
  } else if (section === "ending") {
    output.endingQuestion = generated.accountId === "emotion_library"
      ? "你最近一次选择先照顾自己，是什么时候？"
      : generated.accountId === "personal_growth"
        ? "你会先验证哪一个信号，再做下一步判断？"
        : "你最想先练会哪一句？";
  } else {
    output.hashtags = generated.accountId === "fun_english"
      ? ["#生活英语", "#口语表达", "#可直接使用"]
      : generated.accountId === "personal_growth"
        ? ["#成长复盘", "#问题拆解", "#真实记录"]
        : ["#情绪共鸣", "#自我理解", "#原创表达"];
  }
  const title = output.recommendedTitle;
  const body = output.body;
  const hashtags = output.hashtags;
  return {
    ...generated,
    output,
    title,
    body,
    hashtags,
    status: "draft",
    confirmedAt: null,
    reviewDecision: null,
    humanEditedOutput: null,
  };
}

export async function registerContentRoutes(
  app: FastifyInstance,
  repository: ContentRepository,
  analyzer: ContentAnalyzer,
  generator: ContentGenerator,
): Promise<void> {
  app.post(
    "/api/v1/demo-data/load",
    async (request): Promise<ApiSuccess<DemoDataLoadResult>> => {
      const result = await repository.addMany(await createDemoContentItems(analyzer));
      const totalCount = (await repository.list()).length;
      return success(request, { loadedCount: result.items.length, totalCount });
    },
  );

  app.post(
    "/api/v1/imports/csv",
    async (request): Promise<ApiSuccess<CsvImportSummary>> => {
      const input = parseOrThrow(CsvImportInputSchema, request.body);
      const parsed = await parseContentCsv(
        input.csvText,
        input.licenseStatus,
        input.sourceName,
        analyzer,
      );
      const result = await repository.addMany(parsed.candidates.map((candidate) => candidate.item));
      const duplicateErrors = result.duplicateIndexes.map((index) => ({
        row: parsed.candidates[index]?.row ?? 2,
        message: "content 与已有素材重复",
      }));
      const errors = [...parsed.errors, ...duplicateErrors].sort((left, right) => left.row - right.row);
      const summary: CsvImportSummary = {
        totalRows: parsed.totalRows,
        importedCount: result.items.length,
        failedCount: errors.length,
        duplicateCount: duplicateErrors.length,
        errors,
      };
      return success(request, summary);
    },
  );

  app.get(
    "/api/v1/content-items",
    async (request): Promise<ApiSuccess<ContentItem[]>> => {
      const query = parseOrThrow(ContentItemQuerySchema, request.query);
      const items = await repository.list(query);
      return success(request, items, items.length);
    },
  );

  app.get(
    "/api/v1/content-items/:id",
    async (request): Promise<ApiSuccess<ContentItem>> => {
      const item = await repository.findById(getId(request));
      if (!item) throw new AppError(404, "CONTENT_NOT_FOUND", "未找到指定情绪素材");
      return success(request, item);
    },
  );

  app.post(
    "/api/v1/content-items/:id/favorite",
    async (request): Promise<ApiSuccess<ContentItem>> => {
      const input = parseOrThrow(SetFavoriteInputSchema, request.body);
      const item = await repository.setFavorite(getId(request), input.favorite);
      if (!item) throw new AppError(404, "CONTENT_NOT_FOUND", "未找到指定情绪素材");
      return success(request, item);
    },
  );

  app.get("/api/v1/favorites", async (request): Promise<ApiSuccess<ContentItem[]>> => {
    const items = await repository.listFavorites();
    return success(request, items, items.length);
  });

  app.delete(
    "/api/v1/favorites/:id",
    async (request): Promise<ApiSuccess<ContentItem>> => {
      const item = await repository.setFavorite(getId(request), false);
      if (!item) throw new AppError(404, "CONTENT_NOT_FOUND", "未找到指定情绪素材");
      return success(request, item);
    },
  );

  app.get(
    "/api/v1/content-dashboard",
    async (request): Promise<ApiSuccess<ContentDashboard>> => {
      const items = await repository.list();
      const today = new Date().toISOString().slice(0, 10);
      const dashboard: ContentDashboard = {
        todayCount: items.filter((item) => item.importedAt.startsWith(today)).length,
        totalCount: items.length,
        highResonanceCount: items.filter((item) => (item.resonanceScore ?? 0) >= 80).length,
        favoriteCount: items.filter((item) => item.isFavorite).length,
        emotionDistribution: countDistribution(items.flatMap((item) => item.emotion ? [item.emotion] : [])),
        categoryDistribution: countDistribution(items.flatMap((item) => item.category ? [item.category] : [])),
      };
      return success(request, dashboard);
    },
  );

  app.post(
    "/api/v1/generated-contents",
    async (request): Promise<ApiSuccess<GeneratedContent>> => {
      const input = parseOrThrow(GenerateContentInputSchema, request.body);
      const items = await Promise.all(input.contentIds.map((id) => repository.findById(id)));
      const missingIndex = items.findIndex((item) => item === undefined);
      if (missingIndex >= 0) {
        throw new AppError(
          404,
          "CONTENT_NOT_FOUND",
          `未找到素材 ${input.contentIds[missingIndex]}`,
        );
      }

      const resolvedItems = items.filter((item): item is ContentItem => item !== undefined);
      if (resolvedItems.some((item) => item.accountId !== "emotion_library")) {
        throw new AppError(409, "ACCOUNT_MISMATCH", "请从对应账号工作区生成内容");
      }
      const restrictedItem = resolvedItems.find(
        (item) => item.licenseStatus !== "original" && item.licenseStatus !== "licensed",
      );
      if (restrictedItem) {
        throw new AppError(
          409,
          "LICENSE_RESTRICTED",
          "仅本人原创或已明确获得许可的素材可以生成文案",
        );
      }

      const controller = new AbortController();
      const abortProvider = () => controller.abort();
      request.raw.once("aborted", abortProvider);
      const result = await (async () => {
        try {
          return await generator.generate(
            {
              items: resolvedItems.map(({ id, content, emotion, category, tags }) => ({
                id,
                content,
                emotion,
                category,
                tags,
              })),
            },
            { signal: controller.signal },
          );
        } finally {
          request.raw.removeListener("aborted", abortProvider);
        }
      })();
      const generated = GeneratedContentSchema.parse({
        ...legacyGeneratedFields,
        id: `generated-${randomUUID()}`,
        ...result.data,
        status: "draft",
        generatorLabel: result.provider === "mock" ? "DEMO AI 生成结果" : "AI 生成草稿",
        provider: result.provider,
        model: result.model,
        contentIds: resolvedItems.map((item) => item.id),
        createdAt: new Date().toISOString(),
      });
      await repository.saveGenerated(generated);
      return success(request, generated);
    },
  );

  app.get(
    "/api/v1/generated-contents/:id",
    async (request): Promise<ApiSuccess<GeneratedContent>> => {
      const generated = await repository.findGeneratedById(getId(request));
      if (!generated) {
        throw new AppError(404, "GENERATED_CONTENT_NOT_FOUND", "未找到指定生成草稿");
      }
      return success(request, generated);
    },
  );

  app.post(
    "/api/v1/generated-contents/:id/regenerate",
    async (request): Promise<ApiSuccess<GeneratedContent>> => {
      const input = parseOrThrow(RegenerateContentInputSchema, request.body);
      const generated = await repository.findGeneratedById(getId(request));
      if (!generated) throw new AppError(404, "GENERATED_CONTENT_NOT_FOUND", "未找到指定生成草稿");
      const updated = regenerateDraft(generated, input.section);
      await repository.saveGenerated(updated);
      return success(request, updated);
    },
  );
  app.post(
    "/api/v1/generated-contents/:id/review",
    async (request): Promise<ApiSuccess<GeneratedContent>> => {
      const input = parseOrThrow(ReviewGeneratedContentInputSchema, request.body);
      const generated = await repository.findGeneratedById(getId(request));
      if (!generated) throw new AppError(404, "GENERATED_CONTENT_NOT_FOUND", "未找到指定生成草稿");
      const reviewed = GeneratedContentSchema.parse({
        ...generated,
        status: input.decision === "rejected" ? "rejected" : generated.status,
        confirmedAt: input.decision === "rejected" ? null : generated.confirmedAt,
        reviewDecision: input.decision,
        humanEditedOutput: input.decision === "accepted" ? {
          title: input.title ?? generated.title,
          body: input.body ?? generated.body,
          hashtags: input.hashtags ?? generated.hashtags,
        } : null,
      });
      await repository.saveGenerated(reviewed);
      return success(request, reviewed);
    },
  );
}
