import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ACCOUNT_PROFILES, AccountIdSchema, ContentItemSchema, CreateContentInputSchema,
  EmotionAnalysisSchema, English50PackageSchema, EmotionPostPackageSchema,
  GenerateContentInputSchema, GeneratedContentSchema, GrowthAnalysisSchema, GrowthPostPackageSchema,
  PerformanceSchema, PostRecordSchema, SavePostInputSchema,
  type ApiSuccess, type ContentItem, type GeneratedContent, type StudioAnalysis, type StudioOutput,
} from "@emotion-studio/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AiResult } from "../ai/types.js";
import { AppError } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import type { ContentRepository, NewContentItem } from "../content/repository.js";
import {
  assessSimilarity, createTruthAnchors, validateGrowthAnalysis, validateGrowthPost,
  findGrowthGroundingIssues,
  type PipelineRegistry,
} from "./pipelines/index.js";
import { studioDashboard } from "./stats.js";

const AccountQuerySchema = z.object({ accountId: AccountIdSchema.optional() });
const IdParamsSchema = z.object({ id: z.string().min(1).max(100) });
function success<T>(request: FastifyRequest, data: T): ApiSuccess<T> {
  return { ok: true, data, requestId: request.id };
}
function idOf(request: FastifyRequest) { return parseOrThrow(IdParamsSchema, request.params).id; }

function cleanExternal(content: string): string {
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)(?:\+?86[ -]?)?1[3-9]\d{9}(?!\d)|(?:微信|电话|QQ|手机号)\s*[:：]?\s*[\w-]{5,}/i.test(content)) {
    throw new AppError(400, "PRIVACY_CONTENT", "素材包含联系方式，请先移除个人信息后保存");
  }
  if (/生日快乐|生日祝福|粉丝签到|控评|求互关|加我微信|扫码购买/.test(content)) {
    throw new AppError(400, "FILTERED_CONTENT", "这条素材属于祝福、粉丝互动或广告内容，请更换研究素材");
  }
  return content.normalize("NFC").trim().replace(/https?:\/\/\S+/gi, "[链接已移除]").replace(/@[\p{L}\p{N}_-]+/gu, "[署名已移除]");
}

export async function registerStudioRoutes(app: FastifyInstance, repository: ContentRepository, pipelines: PipelineRegistry) {
  // A bounded in-flight guard is not a queue. It prevents double-click costs and unbounded AI concurrency.
  const inFlight = new Set<string>();
  async function providerCall<T>(request: FastifyRequest, reply: FastifyReply, key: string, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (inFlight.has(key) || inFlight.size >= 4) throw new AppError(429, "AI_BUSY", "内容正在处理中，请稍后重试");
    inFlight.add(key);
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => { if (!reply.raw.writableEnded) abort(); };
    request.raw.once("aborted", abort);
    reply.raw.once("close", close);
    try { return await action(controller.signal); }
    finally {
      inFlight.delete(key);
      request.raw.removeListener("aborted", abort);
      reply.raw.removeListener("close", close);
    }
  }
  async function findItem(id: string) {
    const item = await repository.findById(id);
    if (!item) throw new AppError(404, "CONTENT_NOT_FOUND", "未找到素材");
    return item;
  }
  async function analyze(item: ContentItem, signal: AbortSignal): Promise<ContentItem> {
    if (item.licenseStatus === "prohibited") throw new AppError(409, "LICENSE_RESTRICTED", "禁止使用的素材不能分析或生成");
    let result: AiResult<StudioAnalysis>;
    if (item.accountId === "personal_growth") {
      const input = { content: item.content, truthAnchors: createTruthAnchors(item.content) };
      const response = await pipelines.growthAnalyzer.analyze(input, { signal });
      const data = GrowthAnalysisSchema.parse(response.data);
      validateGrowthAnalysis(input, data);
      result = { ...response, data };
    } else if (item.accountId === "emotion_library") {
      const response = await pipelines.emotionAnalyzer.analyze({ content: cleanExternal(item.content) }, { signal });
      result = { ...response, data: EmotionAnalysisSchema.parse(response.data) };
    } else {
      throw new AppError(409, "ANALYSIS_NOT_REQUIRED", "英语主题直接进入独立的 50 句生成流程");
    }
    const saved = await repository.saveAnalysis(item.id, result);
    if (!saved) throw new AppError(404, "CONTENT_NOT_FOUND", "未找到素材");
    return saved;
  }

  app.get("/api/v1/accounts", async (request) => success(request, ACCOUNT_PROFILES));
  app.get("/api/v1/studio-dashboard", async (request) => {
    const [items, posts] = await Promise.all([repository.list(), repository.listPosts()]);
    return success(request, studioDashboard(items, posts));
  });
  app.post("/api/v1/studio/content-items", async (request) => {
    const input = parseOrThrow(CreateContentInputSchema, request.body);
    if (input.sourceUrl) {
      const url = new URL(input.sourceUrl);
      if (url.username || url.password || Array.from(url.searchParams.keys()).some((key) => /token|secret|password|authorization|api.?key/i.test(key))) {
        throw new AppError(400, "UNSAFE_SOURCE_URL", "来源链接不能包含凭据或访问密钥");
      }
    }
    const now = new Date().toISOString();
    const content = input.accountId === "emotion_library" ? cleanExternal(input.content) : input.content.normalize("NFC").trim();
    const item: NewContentItem = {
      accountId: input.accountId, sourceType: input.sourceType, contentLane: input.contentLane,
      originalContent: input.content, content, author: input.sourceAuthor, likes: 0,
      source: input.sourcePlatform ?? "本人手动输入", sourcePlatform: input.sourcePlatform,
      sourceUrl: input.sourceUrl, licenseStatus: input.licenseStatus,
      emotion: null, emotionScore: null, resonanceScore: null, category: null, tags: [],
      scene: null, relationshipType: null, theme: null, analysisKind: null, analysis: null,
      analysisProvider: null, analysisModel: null, analyzedAt: null,
      isFavorite: false, isPublished: false, collectedAt: input.collectedAt ?? now, importedAt: now,
    };
    const result = await repository.addMany([item]);
    const saved = result.items[0] ?? (await repository.list({ accountId: input.accountId, sort: "newest", highResonance: false }))
      .find((candidate) => candidate.content === content);
    if (!saved) throw new AppError(500, "SAVE_FAILED", "素材保存失败，请重试");
    return success(request, ContentItemSchema.parse(saved));
  });
  app.post("/api/v1/studio/content-items/:id/analyze", async (request, reply) => {
    const item = await findItem(idOf(request));
    return success(request, await providerCall(request, reply, `analysis:${item.id}`, (signal) => analyze(item, signal)));
  });
  app.post("/api/v1/studio/generated-contents", async (request, reply) => {
    const input = parseOrThrow(GenerateContentInputSchema, request.body);
    const items = await Promise.all(input.contentIds.map(findItem));
    const first = items[0]!;
    if (items.some((item) => item.accountId !== first.accountId)) {
      throw new AppError(409, "ACCOUNT_MISMATCH", "一次生成只能使用同一账号的素材");
    }
    if (first.accountId !== "emotion_library" && items.length !== 1) {
      throw new AppError(400, "SINGLE_SOURCE_REQUIRED", "成长复盘和英语主题每次使用一条输入");
    }
    if (items.some((item) => item.licenseStatus === "prohibited")) {
      throw new AppError(409, "LICENSE_RESTRICTED", "禁止使用的素材不能进入生成流程");
    }
    const generated = await providerCall(request, reply, `generate:${[...input.contentIds].sort().join(",")}`, async (signal) => {
      let result: AiResult<StudioOutput>;
      const reviewIssues: string[] = [];
      let publishability: GeneratedContent["publishability"] = items.some((item) => item.licenseStatus === "reference_only") ? "research_only" : "eligible";
      if (first.accountId === "personal_growth") {
        const analyzed = first.analysis?.kind === "growth.v1" ? first : await analyze(first, signal);
        if (analyzed.analysis?.kind !== "growth.v1") throw new AppError(409, "ANALYSIS_REQUIRED", "请先完成成长分析");
        const response = await pipelines.growthGenerator.generate({ analysis: analyzed.analysis }, { signal });
        const data = GrowthPostPackageSchema.parse(response.data);
        validateGrowthPost(analyzed.analysis, data);
        reviewIssues.push("请逐条核对事实锚点；问题拆解属于建议，不代表已验证的事实。", ...analyzed.analysis.riskFlags);
        result = { ...response, data };
      } else if (first.accountId === "fun_english") {
        const response = await pipelines.englishGenerator.generate({ topic: first.content }, { signal });
        result = { ...response, data: English50PackageSchema.parse(response.data) };
        reviewIssues.push("请人工核对英文自然度、中文含义和使用语境。");
      } else {
        const themes = [];
        for (const item of items) {
          const analyzed = item.analysis?.kind === "emotion.v1" ? item : await analyze(item, signal);
          if (analyzed.analysis?.kind === "emotion.v1") themes.push(analyzed.analysis);
        }
        const response = await pipelines.emotionGenerator.generate({ themes }, { signal });
        const data = EmotionPostPackageSchema.parse(response.data);
        const risk = assessSimilarity(data.body, items.map((item) => item.content));
        if (risk.level === "high") publishability = "needs_rewrite";
        reviewIssues.push(...risk.reasons, "文本相似度只用于提醒，不能证明版权清白。请人工确认原创转换。");
        result = { ...response, data: { ...data, originalityRisk: risk } };
      }
      if (publishability === "research_only") reviewIssues.push("含仅供研究的素材：本稿只能研究，不能记录为发布。");
      const value = GeneratedContentSchema.parse({
        id: `generated-${randomUUID()}`, accountId: first.accountId,
        contentLane: first.accountId === "emotion_library" ? "emotion_post" : first.contentLane,
        outputKind: result.data.kind, output: result.data, title: result.data.recommendedTitle,
        body: result.data.body, hashtags: result.data.hashtags, status: "draft", confirmedAt: null,
        publishability, reviewIssues: Array.from(new Set(reviewIssues)).slice(0, 20),
        generatorLabel: result.provider === "mock" ? "DEMO AI 生成结果" : "AI 生成草稿",
        provider: result.provider, model: result.model, contentIds: items.map((item) => item.id), createdAt: new Date().toISOString(),
      });
      await repository.saveGenerated(value);
      return value;
    });
    return success(request, generated);
  });
  app.get("/api/v1/generated-contents", async (request) => {
    const query = parseOrThrow(AccountQuerySchema, request.query);
    return success(request, await repository.listGenerated(query.accountId));
  });
  app.get("/api/v1/post-records", async (request) => {
    const query = parseOrThrow(AccountQuerySchema, request.query);
    return success(request, await repository.listPosts(query.accountId));
  });
  app.post("/api/v1/post-records", async (request) => {
    const input = parseOrThrow(SavePostInputSchema, request.body);
    const generated = await repository.findGeneratedById(input.generatedContentId);
    if (!generated) throw new AppError(404, "GENERATED_CONTENT_NOT_FOUND", "未找到生成草稿");
    const items = await Promise.all(generated.contentIds.map(findItem));
    if (generated.publishability !== "eligible" || items.some((item) => !["original", "licensed"].includes(item.licenseStatus))) {
      throw new AppError(409, "PUBLISH_RESTRICTED", "研究素材或高相似稿不能记录发布，请使用已授权素材重新创作");
    }
    if (generated.accountId === "emotion_library" && assessSimilarity(input.bodyUsed, items.map((item) => item.content)).level === "high") {
      throw new AppError(409, "SIMILARITY_RESTRICTED", "编辑后的正文与素材过于相似，请重新表达");
    }
    if (generated.accountId === "personal_growth") {
      const analysis = items[0]?.analysis;
      if (analysis?.kind !== "growth.v1" || findGrowthGroundingIssues(analysis, input.titleUsed + "\n" + input.bodyUsed).length) {
        throw new AppError(409, "GROUNDING_RESTRICTED", "编辑后的正文含事实锚点无法支持的陈述，请基于原始经历修改");
      }
    }
    const now = new Date().toISOString();
    const existing = (await repository.listPosts(generated.accountId)).find((post) => post.generatedContentId === generated.id);
    const post = PostRecordSchema.parse({
      id: existing?.id ?? randomUUID(), accountId: generated.accountId, contentId: generated.contentIds[0],
      generatedContentId: generated.id, status: input.status, publishedAt: input.publishedAt,
      titleUsed: input.titleUsed, bodyUsed: input.bodyUsed, hashtagsUsed: input.hashtagsUsed,
      contentLane: generated.contentLane, coverType: input.coverType, performance: existing?.performance ?? null,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    });
    return success(request, await repository.savePost(post));
  });
  app.put("/api/v1/post-records/:id/performance", async (request) => {
    const input = parseOrThrow(PerformanceSchema, request.body);
    const post = await repository.findPostById(idOf(request));
    if (!post) throw new AppError(404, "POST_NOT_FOUND", "未找到发布记录");
    if (post.status !== "published") throw new AppError(409, "POST_NOT_PUBLISHED", "仅已发布内容可以记录表现数据");
    return success(request, await repository.savePerformance(post.id, input));
  });
}
