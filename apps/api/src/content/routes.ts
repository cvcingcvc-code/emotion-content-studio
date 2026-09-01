import {
  GeneratedContentSchema,
  ContentItemQuerySchema,
  CsvImportInputSchema,
  GenerateContentInputSchema,
  SetFavoriteInputSchema,
  type ApiSuccess,
  type ContentDashboard,
  type ContentDistribution,
  type ContentItem,
  type CsvImportSummary,
  type DemoDataLoadResult,
  type GeneratedContent,
} from "@emotion-studio/contracts";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import type { ContentAnalyzer } from "./analyzer.js";
import { parseContentCsv } from "./csv.js";
import { createDemoContentItems } from "./demo-data.js";
import type { ContentGenerator } from "./generator.js";
import type { ContentRepository } from "./repository.js";

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
        highResonanceCount: items.filter((item) => item.resonanceScore >= 80).length,
        favoriteCount: items.filter((item) => item.isFavorite).length,
        emotionDistribution: countDistribution(items.map((item) => item.emotion)),
        categoryDistribution: countDistribution(items.map((item) => item.category)),
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
}
