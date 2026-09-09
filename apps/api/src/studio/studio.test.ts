import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  AccountProfileListSchema, ContentItemSchema, English50PackageSchema, GeneratedContentSchema,
  PostRecordSchema, StudioDashboardSchema,
} from "@emotion-studio/contracts";
import { buildApp } from "../app.js";
import { InMemoryContentRepository } from "../content/repository.js";
import { AiProviderError } from "../ai/errors.js";
import { createMockPipelines } from "./pipelines/index.js";

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function setup() {
  const repository = new InMemoryContentRepository();
  const pipelines = createMockPipelines();
  const app = await buildApp({ contentRepository: repository, pipelines });
  apps.push(app);
  return { app, repository, pipelines };
}
async function create(app: FastifyInstance, payload: Record<string, unknown>) {
  const response = await app.inject({ method: "POST", url: "/api/v1/studio/content-items", payload });
  expect(response.statusCode, response.body).toBe(200);
  return ContentItemSchema.parse(response.json().data);
}
async function generate(app: FastifyInstance, ids: string[]) {
  const response = await app.inject({ method: "POST", url: "/api/v1/studio/generated-contents", payload: { contentIds: ids } });
  expect(response.statusCode, response.body).toBe(200);
  return GeneratedContentSchema.parse(response.json().data);
}
const growthInput = { accountId: "personal_growth", sourceType: "daily_review", contentLane: "growth_review", licenseStatus: "original", content: "今天准备面试时我很焦虑。我决定先整理项目经历。" };
const englishInput = { accountId: "fun_english", sourceType: "english_topic", contentLane: "english_50", licenseStatus: "original", content: "熬夜人的英语50句" };
const emotionInput = { accountId: "emotion_library", sourceType: "external_emotion_source", contentLane: "emotion_material", licenseStatus: "licensed", sourcePlatform: "本人获许可的测试材料", content: "夜里独处时，窗边的小灯陪我整理心情。" };

describe("three-account product workflow", () => {
  it("completes all pipelines, manual confirmation, publication and nullable performance", async () => {
    const { app } = await setup();
    const accounts = await app.inject({ method: "GET", url: "/api/v1/accounts" });
    expect(AccountProfileListSchema.parse(accounts.json().data).map((account) => account.id))
      .toEqual(["personal_growth", "fun_english", "emotion_library"]);
    for (const input of [growthInput, englishInput, emotionInput]) {
      const item = await create(app, input);
      expect(item.analysis).toBeNull();
      if (item.accountId !== "fun_english") {
        const response = await app.inject({ method: "POST", url: `/api/v1/studio/content-items/${item.id}/analyze` });
        expect(response.statusCode, response.body).toBe(200);
        expect(ContentItemSchema.parse(response.json().data).analysisProvider).toBe("mock");
      }
      const generated = await generate(app, [item.id]);
      expect(generated.status).toBe("draft");
      expect(generated.confirmedAt).toBeNull();
      expect(generated.accountId).toBe(input.accountId);
      if (generated.output?.kind === "english_50.v1") {
        const output = English50PackageSchema.parse(generated.output);
        expect(output.groups).toHaveLength(5);
        expect(output.groups.flatMap((group) => group.sentences)).toHaveLength(50);
        expect(output.fivePageLayout).toHaveLength(5);
      }
      const payload = { generatedContentId: generated.id, humanConfirmed: true, status: "published", publishedAt: new Date().toISOString(),
        titleUsed: generated.title, bodyUsed: generated.body, hashtagsUsed: generated.hashtags, coverType: "文字封面" };
      const denied = await app.inject({ method: "POST", url: "/api/v1/post-records", payload: { ...payload, humanConfirmed: false } });
      expect(denied.statusCode).toBe(400);
      const response = await app.inject({ method: "POST", url: "/api/v1/post-records", payload });
      expect(response.statusCode, response.body).toBe(200);
      const post = PostRecordSchema.parse(response.json().data);
      const second = await app.inject({ method: "POST", url: "/api/v1/post-records", payload });
      expect(second.json().data.id).toBe(post.id);
      const performance = { views: 100, likes: 5, favorites: null, comments: 0, shares: null, follows: null, metricsCapturedAt: new Date().toISOString() };
      const metrics = await app.inject({ method: "PUT", url: `/api/v1/post-records/${post.id}/performance`, payload: performance });
      expect(PostRecordSchema.parse(metrics.json().data).performance).toEqual(performance);
      const invalid = await app.inject({ method: "PUT", url: `/api/v1/post-records/${post.id}/performance`, payload: { ...performance, views: -1 } });
      expect(invalid.statusCode).toBe(400);
    }
    const dashboard = StudioDashboardSchema.parse((await app.inject({ method: "GET", url: "/api/v1/studio-dashboard" })).json().data);
    dashboard.forEach((account) => expect(account.performance).toMatchObject({ publishedCount: 1, totalViews: 100, averageLikeRate: 0.05, averageFavoriteRate: null, averageCommentRate: 0, insufficientSample: true }));
  });

  it("isolates routers, preserves raw content on failure, and retries without duplicate input", async () => {
    const { app, repository, pipelines } = await setup();
    const item = await create(app, { ...growthInput, content: `  ${growthInput.content}  ` });
    const english = vi.spyOn(pipelines.englishGenerator, "generate");
    vi.spyOn(pipelines.growthAnalyzer, "analyze").mockRejectedValueOnce(new AiProviderError({
      provider: "deepseek", code: "AI_UNAVAILABLE", statusCode: 503, message: "AI 服务暂时不可用", attempts: 1,
    }));
    const failed = await app.inject({ method: "POST", url: `/api/v1/studio/content-items/${item.id}/analyze` });
    expect(failed.statusCode).toBe(503);
    expect((await repository.findById(item.id))?.originalContent).toBe(`  ${growthInput.content}  `);
    const retried = await app.inject({ method: "POST", url: `/api/v1/studio/content-items/${item.id}/analyze` });
    expect(retried.statusCode, retried.body).toBe(200);
    expect((await create(app, growthInput)).id).toBe(item.id);
    await generate(app, [item.id]);
    expect(english).not.toHaveBeenCalled();
    const topic = await create(app, englishInput);
    const cross = await app.inject({ method: "POST", url: "/api/v1/studio/generated-contents", payload: { contentIds: [item.id, topic.id] } });
    expect(cross.statusCode).toBe(409);
    expect(cross.json().error.code).toBe("ACCOUNT_MISMATCH");
  });

  it("keeps external reference material research-only and sends themes rather than source text", async () => {
    const { app, pipelines } = await setup();
    const item = await create(app, { ...emotionInput, licenseStatus: "reference_only", sourceUrl: "https://example.org/authorized-research" });
    const generator = vi.spyOn(pipelines.emotionGenerator, "generate");
    const result = await generate(app, [item.id]);
    expect(result.publishability).toBe("research_only");
    const providerInput = JSON.stringify(generator.mock.calls[0]?.[0]);
    expect(providerInput).not.toContain(item.content);
    expect(providerInput).not.toContain(item.sourceUrl);
    expect(providerInput).not.toContain("sourceAuthor");
    const post = await app.inject({ method: "POST", url: "/api/v1/post-records", payload: {
      generatedContentId: result.id, humanConfirmed: true, status: "published", publishedAt: new Date().toISOString(),
      titleUsed: result.title, bodyUsed: result.body, hashtagsUsed: result.hashtags, coverType: null,
    } });
    expect(post.statusCode).toBe(409);
    const favorite = await app.inject({ method: "POST", url: `/api/v1/content-items/${item.id}/favorite`, payload: { favorite: true } });
    expect(favorite.json().data.isFavorite).toBe(true);
    const prohibited = await create(app, { ...emotionInput, content: "这条原始测试素材明确禁止使用。", licenseStatus: "prohibited" });
    const denied = await app.inject({ method: "POST", url: `/api/v1/studio/content-items/${prohibited.id}/analyze` });
    expect(denied.statusCode).toBe(409);
  });

  it("rejects account/lane mismatch, privacy and credential-bearing URLs at HTTP input", async () => {
    const { app } = await setup();
    for (const payload of [
      { ...growthInput, contentLane: "english_50" },
      { ...emotionInput, content: "联系测试邮箱 private@example.org" },
      { ...emotionInput, sourceUrl: "https://example.org/?api_key=do-not-save" },
      { ...emotionInput, sourceAuthor: "署名未获得记录许可" },
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/studio/content-items", payload });
      expect(response.statusCode, response.body).toBe(400);
      expect(response.json().requestId).toBeTruthy();
    }
  });
});
