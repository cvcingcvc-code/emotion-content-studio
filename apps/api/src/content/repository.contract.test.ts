import { randomUUID } from "node:crypto";
import { ContentItemSchema, GeneratedContentSchema, type GeneratedContent, type PostRecord } from "@emotion-studio/contracts";
import {
  createDatabase,
  runMigrations,
  type DatabaseContext,
} from "@emotion-studio/database";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseContentRepository } from "./database-repository.js";
import {
  InMemoryContentRepository,
  legacyContentFields,
  legacyGeneratedFields,
  type ContentRepository,
  type NewContentItem,
} from "./repository.js";
import { createMockPipelines, createTruthAnchors } from "../studio/pipelines/index.js";

function contentItem(
  content: string,
  overrides: Partial<NewContentItem> = {},
): NewContentItem {
  return {
    ...legacyContentFields,
    originalContent: `  ${content}  `,
    content,
    author: null,
    likes: 10,
    source: "测试素材",
    sourceUrl: null,
    licenseStatus: "original",
    emotion: "其他",
    emotionScore: 60,
    resonanceScore: 60,
    category: "其他",
    tags: ["测试"],
    isFavorite: false,
    importedAt: "2026-09-01T01:00:00.000Z",
    ...overrides,
  };
}

function generatedContent(contentIds: string[]): GeneratedContent {
  return {
    ...legacyGeneratedFields,
    reviewIssues: [],
    id: `generated-${randomUUID()}`,
    title: "一份仍需人工确认的情绪草稿",
    body: "这是一段用于仓库契约测试的原创草稿。".repeat(12).slice(0, 220),
    hashtags: ["#情绪", "#成长"],
    status: "draft",
    generatorLabel: "DEMO AI 生成结果",
    provider: "mock",
    model: "mock-rules-v1",
    contentIds,
    createdAt: "2026-09-01T02:00:00.000Z",
  };
}

function repositoryContract(getRepository: () => ContentRepository): void {
  it("isolates accounts, keeps unanalysed inputs nullable, and deduplicates only inside an account", async () => {
    const repository = getRepository();
    const result = await repository.addMany([
      contentItem("同一份私人输入", { accountId: "personal_growth", sourceType: "daily_review", contentLane: "growth_review", emotion: null, emotionScore: null, resonanceScore: null, category: null }),
      contentItem("同一份私人输入"),
    ]);
    expect(result.items).toHaveLength(2);
    const items = await repository.list({ accountId: "personal_growth", sort: "newest", highResonance: false });
    expect(items).toHaveLength(1);
    expect(items[0]?.emotion).toBeNull();
    expect(ContentItemSchema.safeParse(items[0]).success).toBe(true);
    const duplicated = await repository.addMany([contentItem("同一份私人输入")]);
    expect(duplicated.duplicateIndexes).toEqual([0]);
  });

  it("round-trips analysis, typed packages, publication snapshots and nullable metrics", async () => {
    const repository = getRepository();
    const pipelines = createMockPipelines();
    const [item] = (await repository.addMany([contentItem("今天准备面试时我很焦虑。我决定先整理项目经历。", {
      accountId: "personal_growth", sourceType: "daily_review", contentLane: "growth_review",
      emotion: null, emotionScore: null, resonanceScore: null, category: null,
    })])).items;
    const analysis = await pipelines.growthAnalyzer.analyze({ content: item!.content, truthAnchors: createTruthAnchors(item!.content) });
    const analyzed = await repository.saveAnalysis(item!.id, analysis);
    expect(analyzed?.analysis).toEqual(analysis.data);
    expect(analyzed?.originalContent).toBe(item!.originalContent);
    expect(analyzed?.analysisProvider).toBe("mock");
    const result = await pipelines.growthGenerator.generate({ analysis: analysis.data });
    const generated = GeneratedContentSchema.parse({
      ...generatedContent([item!.id]), accountId: "personal_growth", contentLane: "growth_review",
      outputKind: result.data.kind, output: result.data, title: result.data.recommendedTitle,
      body: result.data.body, hashtags: result.data.hashtags, provider: result.provider, model: result.model,
    });
    await repository.saveGenerated(generated);
    expect(await repository.findGeneratedById(generated.id)).toEqual(generated);
    expect(await repository.listGenerated("fun_english")).toEqual([]);
    const now = new Date().toISOString();
    const post: PostRecord = {
      id: randomUUID(), accountId: "personal_growth", contentId: item!.id, generatedContentId: generated.id,
      status: "published", publishedAt: now, titleUsed: "人工修改的实际发布标题", bodyUsed: generated.body,
      hashtagsUsed: generated.hashtags, contentLane: "growth_review", coverType: null, performance: null,
      createdAt: now, updatedAt: now,
    };
    expect(await repository.savePost(post)).toEqual(post);
    expect((await repository.findGeneratedById(generated.id))?.status).toBe("confirmed");
    const performance = { views: 100, likes: 0, favorites: null, comments: 2, shares: null, follows: null, metricsCapturedAt: now };
    expect((await repository.savePerformance(post.id, performance))?.performance).toEqual(performance);
    expect((await repository.listPosts("personal_growth"))[0]?.titleUsed).toBe(post.titleUsed);
    expect((await repository.findById(item!.id))?.isPublished).toBe(true);
    expect(await repository.list({ published: false, sort: "newest", highResonance: false })).toEqual([]);
    await expect(repository.savePost({ ...post, accountId: "fun_english", contentLane: "english_50" })).rejects.toThrow();
    await expect(repository.saveGenerated({ ...generated, contentIds: ["missing"] })).rejects.toThrow();
  });

  it("filters emotion research projections without changing sources", async () => {
    const repository = getRepository();
    const [item] = (await repository.addMany([contentItem("夜里独处时想起家人。", { sourceType: "external_emotion_source", sourcePlatform: "手动授权素材", licenseStatus: "reference_only" })])).items;
    const analysis = await createMockPipelines().emotionAnalyzer.analyze({ content: item!.content });
    await repository.saveAnalysis(item!.id, analysis);
    await repository.setFavorite(item!.id, true);
    const filtered = await repository.list({ accountId: "emotion_library", scene: analysis.data.scene, relationship: analysis.data.relationshipType,
      theme: analysis.data.reusableTheme, favorite: true, sourceType: "external_emotion_source", sort: "newest", highResonance: false });
    expect(filtered.map((value) => value.id)).toEqual([item!.id]);
    expect(filtered[0]?.licenseStatus).toBe("reference_only");
    expect(filtered[0]?.sourcePlatform).toBe("手动授权素材");
  });

  it("creates, lists, and reads content without overwriting the original", async () => {
    const repository = getRepository();
    const result = await repository.addMany([
      contentItem("清洗后的第一条"),
      contentItem("清洗后的第二条"),
    ]);

    expect(result.duplicateIndexes).toEqual([]);
    expect(await repository.list()).toHaveLength(2);
    const stored = await repository.findById(result.items[0]!.id);
    expect(stored).toMatchObject({
      originalContent: "  清洗后的第一条  ",
      content: "清洗后的第一条",
    });
  });

  it("searches content, author, source, and tags", async () => {
    const repository = getRepository();
    await repository.addMany([
      contentItem("雨停以后继续走", {
        author: "原创作者",
        source: "个人笔记",
        tags: ["雨天", "成长"],
      }),
      contentItem("另一条素材"),
    ]);

    for (const search of ["雨停", "原创作者", "个人笔记", "成长"]) {
      const result = await repository.list({
        search,
        sort: "newest",
        highResonance: false,
      });
      expect(result.map((item) => item.content)).toEqual(["雨停以后继续走"]);
    }
  });

  it("filters by emotion, category, and high resonance", async () => {
    const repository = getRepository();
    await repository.addMany([
      contentItem("孤独高共鸣", {
        emotion: "孤独",
        category: "孤独",
        resonanceScore: 91,
      }),
      contentItem("孤独低共鸣", {
        emotion: "孤独",
        category: "生活",
        resonanceScore: 60,
      }),
    ]);

    const result = await repository.list({
      emotion: "孤独",
      category: "孤独",
      sort: "newest",
      highResonance: true,
    });
    expect(result.map((item) => item.content)).toEqual(["孤独高共鸣"]);
  });

  it("sorts by resonance, likes, and newest with the same tie behavior", async () => {
    const repository = getRepository();
    await repository.addMany([
      contentItem("较早素材", {
        likes: 200,
        resonanceScore: 70,
        importedAt: "2026-09-01T01:00:00.000Z",
      }),
      contentItem("较新素材", {
        likes: 100,
        resonanceScore: 90,
        importedAt: "2026-09-01T02:00:00.000Z",
      }),
    ]);

    expect((await repository.list({ sort: "resonance_desc", highResonance: false }))[0]?.content)
      .toBe("较新素材");
    expect((await repository.list({ sort: "likes_desc", highResonance: false }))[0]?.content)
      .toBe("较早素材");
    expect((await repository.list({ sort: "newest", highResonance: false }))[0]?.content)
      .toBe("较新素材");
  });

  it("favorites and unfavorites content", async () => {
    const repository = getRepository();
    const [item] = (await repository.addMany([contentItem("收藏测试")])).items;
    expect(item).toBeDefined();

    expect((await repository.setFavorite(item!.id, true))?.isFavorite).toBe(true);
    expect((await repository.listFavorites()).map((favorite) => favorite.id)).toEqual([item!.id]);
    expect((await repository.setFavorite(item!.id, false))?.isFavorite).toBe(false);
    expect(await repository.listFavorites()).toEqual([]);
  });

  it("reports duplicates within a batch and across writes", async () => {
    const repository = getRepository();
    const first = await repository.addMany([
      contentItem("重复素材"),
      contentItem("重复素材"),
      contentItem("独立素材"),
    ]);
    const second = await repository.addMany([contentItem("重复素材")]);

    expect(first.items).toHaveLength(2);
    expect(first.duplicateIndexes).toEqual([1]);
    expect(second).toMatchObject({ items: [], duplicateIndexes: [0] });
  });

  it("saves, reads, and replaces generated content", async () => {
    const repository = getRepository();
    const [item] = (await repository.addMany([contentItem("生成来源")])).items;
    const generated = generatedContent([item!.id]);
    await repository.saveGenerated(generated);
    expect(await repository.findGeneratedById(generated.id)).toEqual(generated);

    const updated = { ...generated, title: "更新后的草稿标题" };
    await repository.saveGenerated(updated);
    expect(await repository.findGeneratedById(generated.id)).toEqual(updated);
  });

  it("returns undefined for unknown or malformed identifiers", async () => {
    const repository = getRepository();
    expect(await repository.findById("not-a-database-id")).toBeUndefined();
    expect(await repository.setFavorite("not-a-database-id", true)).toBeUndefined();
    expect(await repository.findGeneratedById("missing-generated-id")).toBeUndefined();
  });
}

describe("InMemoryContentRepository contract", () => {
  let repository: ContentRepository;

  beforeEach(() => {
    repository = new InMemoryContentRepository();
  });

  repositoryContract(() => repository);
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

databaseDescribe("DatabaseContentRepository contract", () => {
  const schemaName = `repository_test_${randomUUID().replaceAll("-", "")}`;
  let adminPool: Pool;
  let database: DatabaseContext;
  let repository: ContentRepository;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: testDatabaseUrl! });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    database = createDatabase(testDatabaseUrl!, { searchPath: schemaName });
    await runMigrations(database.pool);
  });

  beforeEach(async () => {
    await database.pool.query(
      'TRUNCATE TABLE "generated_contents", "content_items" RESTART IDENTITY CASCADE',
    );
    repository = new DatabaseContentRepository(database.db);
  });

  afterAll(async () => {
    await database?.close();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  repositoryContract(() => repository);
});
