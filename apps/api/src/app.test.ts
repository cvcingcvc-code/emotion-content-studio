import {
  ApiErrorSchema,
  ContentDashboardSchema,
  ContentItemSchema,
  CsvImportSummarySchema,
  DemoDataLoadResultSchema,
  DraftSchema,
  ExportRecordSchema,
  MaterialSchema,
  GeneratedContentSchema,
  VideoProjectSchema,
  createSuccessResponseSchema,
} from "@emotion-studio/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuildAppOptions } from "./app.js";
import { readServerConfig } from "./config.js";
import { MockContentAnalyzer } from "./content/analyzer.js";
import { createDemoContentItems } from "./content/demo-data.js";
import { InMemoryContentRepository } from "./content/repository.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function createApp(options: BuildAppOptions = {}) {
  const app = await buildApp(options);
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("mock API", () => {
  it("binds local development to loopback unless explicitly configured", () => {
    expect(readServerConfig({})).toMatchObject({ HOST: "127.0.0.1", PORT: 8787 });
  });

  it("returns a request id and mock health state", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe(body.requestId);
    expect(body.data).toEqual({ status: "ok", service: "emotion-studio-api", mode: "mock" });
  });

  it("serves exactly twenty newly authored material fixtures", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/materials" });
    const parsed = createSuccessResponseSchema(MaterialSchema.array()).parse(response.json());

    expect(parsed.data).toHaveLength(20);
    expect(new Set(parsed.data.map((item) => item.reviewStatus))).toEqual(
      new Set(["approved", "rejected", "needs_edit", "reference_only", "pending"]),
    );
    expect(JSON.stringify(parsed.data)).not.toContain("storageKey");
  });

  it("uses the unified validation error envelope", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/materials/material-18/review",
      payload: { decision: "rejected" },
    });
    const error = ApiErrorSchema.parse(response.json());

    expect(response.statusCode).toBe(400);
    expect(error.error.code).toBe("VALIDATION_ERROR");
    expect(error.requestId).toBeTruthy();
  });

  it("prevents reference-only material from entering an approved state", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/materials/material-15/review",
      payload: { decision: "approved" },
    });
    const error = ApiErrorSchema.parse(response.json());

    expect(response.statusCode).toBe(409);
    expect(error.error.code).toBe("LICENSE_RESTRICTED");
  });

  it("confirms a safe AI draft only after explicit human acknowledgement", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/draft-01/confirm",
      payload: { humanConfirmed: true },
    });
    const parsed = createSuccessResponseSchema(DraftSchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(parsed.data.status).toBe("confirmed");
    expect(parsed.data.confirmedAt).toBeTruthy();
  });

  it("creates a mock video project for the same confirmed draft", async () => {
    const app = await createApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/drafts/draft-01/confirm",
      payload: { humanConfirmed: true, text: "我把今天的停顿，留成一段可以继续阅读的空白。" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/drafts/draft-01/video-project",
      payload: { templateKey: "blank_subtitle" },
    });
    const parsed = createSuccessResponseSchema(VideoProjectSchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(parsed.data.draftId).toBe("draft-01");
    expect(parsed.data.templateKey).toBe("blank_subtitle");
  });

  it("retries a failed export as a simulation without creating a file URL", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/video-projects/video-03/simulated-export",
      payload: { acknowledgedRights: true },
    });
    const parsed = createSuccessResponseSchema(ExportRecordSchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(parsed.data.status).toBe("processing");
    expect(parsed.data.downloadable).toBe(false);
    expect(JSON.stringify(parsed.data)).not.toContain("storageKey");
  });

  it("uses the unified envelope for unknown routes", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/not-real" });
    const error = ApiErrorSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(error.error.code).toBe("NOT_FOUND");
  });

  it("loads forty synthetic content items idempotently and supports filtering and sorting", async () => {
    const app = await createApp();
    const first = await app.inject({ method: "POST", url: "/api/v1/demo-data/load" });
    const second = await app.inject({ method: "POST", url: "/api/v1/demo-data/load" });
    const firstResult = createSuccessResponseSchema(DemoDataLoadResultSchema).parse(first.json());
    const secondResult = createSuccessResponseSchema(DemoDataLoadResultSchema).parse(second.json());

    expect(firstResult.data).toEqual({ loadedCount: 40, totalCount: 40 });
    expect(secondResult.data).toEqual({ loadedCount: 0, totalCount: 40 });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/content-items?emotion=%E5%AD%A4%E7%8B%AC&sort=resonance_desc&highResonance=true",
    });
    const parsed = createSuccessResponseSchema(ContentItemSchema.array()).parse(response.json());
    expect(response.statusCode).toBe(200);
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.data.every((item) => item.emotion === "孤独" && item.resonanceScore >= 80)).toBe(true);
    expect(parsed.data.map((item) => item.resonanceScore)).toEqual(
      [...parsed.data.map((item) => item.resonanceScore)].sort((left, right) => right - left),
    );
  });

  it("imports BOM and CRLF CSV while preserving quoted commas, newlines, emoji and original text", async () => {
    const app = await createApp();
    const csvText = [
      "\uFEFFcontent,author,likes,source,url",
      '"  夜晚，安静😀  ",,125,"授权笔记","https://example.com/a"',
      '"第一行\n第二行 ""仍然完整""",,8,,',
      '"  夜晚，安静😀  ",,0,,',
      ",,,,",
    ].join("\r\n");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      payload: { csvText, licenseStatus: "licensed", sourceName: "本地测试文件" },
    });
    const summary = createSuccessResponseSchema(CsvImportSummarySchema).parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(summary.data).toMatchObject({
      totalRows: 4,
      importedCount: 2,
      failedCount: 2,
      duplicateCount: 1,
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/v1/content-items" });
    const list = createSuccessResponseSchema(ContentItemSchema.array()).parse(listResponse.json()).data;
    expect(list).toHaveLength(2);
    expect(list.find((item) => item.content.includes("😀"))).toMatchObject({
      originalContent: "  夜晚，安静😀  ",
      content: "夜晚，安静😀",
      author: null,
      likes: 125,
      source: "授权笔记",
      sourceUrl: "https://example.com/a",
      licenseStatus: "licensed",
    });
    expect(list.some((item) => item.content === '第一行\n第二行 "仍然完整"')).toBe(true);
  });

  it("rejects a missing content header before writing and deduplicates across imports", async () => {
    const app = await createApp();
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      payload: { csvText: "text\r\n不会写入", licenseStatus: "original" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(invalid.json()).error.code).toBe("CSV_CONTENT_REQUIRED");

    const emptyList = await app.inject({ method: "GET", url: "/api/v1/content-items" });
    expect(createSuccessResponseSchema(ContentItemSchema.array()).parse(emptyList.json()).data).toHaveLength(0);

    await app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      payload: { csvText: "content\n  保留中文和Emoji🌙  ", licenseStatus: "original" },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      payload: { csvText: "content\n保留中文和Emoji🌙", licenseStatus: "original" },
    });
    expect(createSuccessResponseSchema(CsvImportSummarySchema).parse(duplicate.json()).data).toMatchObject({
      importedCount: 0,
      failedCount: 1,
      duplicateCount: 1,
    });
  });

  it("rejects malformed or excessive CSV input before repository writes", async () => {
    const app = await createApp();
    const malformed = await app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      payload: { csvText: 'content\n"有效内容"尾随字符', licenseStatus: "original" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(malformed.json()).error.code).toBe("CSV_INVALID");

    const excessive = await app.inject({
      method: "POST",
      url: "/api/v1/imports/csv",
      payload: {
        csvText: `content\n${Array.from({ length: 10_001 }, (_, index) => `第${index}行`).join("\n")}`,
        licenseStatus: "original",
      },
    });
    expect(excessive.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(excessive.json()).error.code).toBe("CSV_ROW_LIMIT");

    const list = await app.inject({ method: "GET", url: "/api/v1/content-items" });
    expect(createSuccessResponseSchema(ContentItemSchema.array()).parse(list.json()).data).toHaveLength(0);
  });

  it("favorites content, updates the dashboard and generates a retrievable 200-400 character draft", async () => {
    const app = await createApp();
    await app.inject({ method: "POST", url: "/api/v1/demo-data/load" });
    const listResponse = await app.inject({ method: "GET", url: "/api/v1/content-items?sort=likes_desc" });
    const items = createSuccessResponseSchema(ContentItemSchema.array()).parse(listResponse.json()).data;
    const selected = items.slice(0, 3);
    const favoriteResponse = await app.inject({
      method: "POST",
      url: `/api/v1/content-items/${selected[0]?.id}/favorite`,
      payload: { favorite: true },
    });
    expect(ContentItemSchema.parse(favoriteResponse.json().data).isFavorite).toBe(true);

    const dashboardResponse = await app.inject({ method: "GET", url: "/api/v1/content-dashboard" });
    const dashboard = createSuccessResponseSchema(ContentDashboardSchema).parse(dashboardResponse.json());
    expect(dashboard.data).toMatchObject({ totalCount: 40, favoriteCount: 1 });

    const generatedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/generated-contents",
      payload: { contentIds: selected.map((item) => item.id) },
    });
    const generated = createSuccessResponseSchema(GeneratedContentSchema).parse(generatedResponse.json()).data;
    expect(generated.generatorLabel).toBe("DEMO AI 生成结果");
    expect(generated.status).toBe("draft");
    expect(generated.body.length).toBeGreaterThanOrEqual(200);
    expect(generated.body.length).toBeLessThanOrEqual(400);
    expect(selected.every((item) => !generated.body.includes(item.content))).toBe(true);

    const fetched = await app.inject({
      method: "GET",
      url: `/api/v1/generated-contents/${generated.id}`,
    });
    expect(createSuccessResponseSchema(GeneratedContentSchema).parse(fetched.json()).data).toEqual(generated);
  });

  it("rejects zero or six generation sources with the unified error envelope", async () => {
    const app = await createApp();
    for (const contentIds of [[], ["1", "2", "3", "4", "5", "6"]]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/generated-contents",
        payload: { contentIds },
      });
      expect(response.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(response.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("blocks reference-only content at the generation boundary", async () => {
    const analyzer = new MockContentAnalyzer();
    const repository = new InMemoryContentRepository();
    const seed = createDemoContentItems(analyzer)[0];
    expect(seed).toBeDefined();
    const inserted = await repository.addMany([
      { ...seed!, licenseStatus: "reference_only" },
    ]);
    const restrictedId = inserted.items[0]?.id;
    expect(restrictedId).toBeTruthy();

    const app = await createApp({ contentAnalyzer: analyzer, contentRepository: repository });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/generated-contents",
      payload: { contentIds: [restrictedId] },
    });
    expect(response.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(response.json()).error.code).toBe("LICENSE_RESTRICTED");
  });
});
