import { createHash } from "node:crypto";
import {
  ContentItemSchema,
  GeneratedContentSchema,
  PostRecordSchema,
  PerformanceSchema,
  type AccountId,
  type PostRecord,
  type Performance,
  type StudioAnalysis,
  type ContentItem,
  type ContentItemQuery,
  type GeneratedContent,
} from "@emotion-studio/contracts";
import {
  contentItems,
  generatedContents,
  postRecords,
  postPerformances,
  type DatabaseContext,
} from "@emotion-studio/database";
import { and, asc, desc, eq, sql, getTableColumns, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  analysisFields,
  assertGeneratedSources,
  assertPostSources,
  type AddContentItemsResult,
  type ContentRepository,
  type NewContentItem,
} from "./repository.js";
import type { AiResult } from "../ai/types.js";

type ContentItemRow = typeof contentItems.$inferSelect;
type GeneratedContentRow = typeof generatedContents.$inferSelect;
const ContentItemIdSchema = z.string().uuid();
const publishedExpression = sql<boolean>`exists (
  select 1 from ${postRecords} p join ${generatedContents} g on p.generated_content_id = g.id
  where p.status = 'published' and g.selected_content_ids @> jsonb_build_array(${contentItems.id}::text)
)`;
const contentSelection = { ...getTableColumns(contentItems), isPublished: publishedExpression };

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function mapContentItem(row: ContentItemRow & { isPublished?: boolean }): ContentItem {
  return ContentItemSchema.parse({
    id: row.id,
    accountId: row.accountId,
    sourceType: row.sourceType,
    contentLane: row.contentLane,
    sourcePlatform: row.sourcePlatform,
    collectedAt: row.collectedAt?.toISOString() ?? null,
    scene: row.scene,
    relationshipType: row.relationshipType,
    theme: row.theme,
    analysisKind: row.analysisKind,
    analysis: row.analysisPayload,
    analysisProvider: row.analysisProvider,
    analysisModel: row.analysisModel,
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
    isPublished: row.isPublished ?? false,
    originalContent: row.originalContent,
    content: row.cleanedContent,
    author: row.author,
    likes: row.likes,
    source: row.source,
    sourceUrl: row.sourceUrl,
    licenseStatus: row.licenseStatus,
    emotion: row.emotion,
    emotionScore: row.emotionScore,
    resonanceScore: row.resonanceScore,
    category: row.category,
    tags: row.tags,
    isFavorite: row.isFavorite,
    importedAt: row.createdAt.toISOString(),
  });
}

function mapGeneratedContent(row: GeneratedContentRow): GeneratedContent {
  return GeneratedContentSchema.parse({
    id: row.id,
    accountId: row.accountId,
    contentLane: row.contentLane,
    outputKind: row.outputKind,
    output: row.outputPayload,
    reviewIssues: row.reviewIssues,
    publishability: row.publishability,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    title: row.title,
    body: row.body,
    hashtags: row.tags,
    status: row.status,
    generatorLabel: row.generatorLabel,
    provider: row.generator,
    model: row.model,
    contentIds: row.selectedContentIds,
    createdAt: row.createdAt.toISOString(),
  });
}

export class DatabaseContentRepository implements ContentRepository {
  readonly #db: DatabaseContext["db"];

  constructor(database: DatabaseContext["db"]) {
    this.#db = database;
  }

  async addMany(items: NewContentItem[]): Promise<AddContentItemsResult> {
    items.forEach((item) => ContentItemSchema.parse({ ...item, id: "candidate" }));
    return this.#db.transaction(async (transaction) => {
      const inserted: ContentItem[] = [];
      const duplicateIndexes: number[] = [];

      for (const [index, item] of items.entries()) {
        const createdAt = new Date(item.importedAt);
        const [row] = await transaction
          .insert(contentItems)
          .values({
            accountId: item.accountId,
            sourceType: item.sourceType,
            contentLane: item.contentLane,
            sourcePlatform: item.sourcePlatform,
            collectedAt: item.collectedAt ? new Date(item.collectedAt) : null,
            scene: item.scene,
            relationshipType: item.relationshipType,
            theme: item.theme,
            analysisKind: item.analysisKind,
            analysisPayload: item.analysis,
            analysisProvider: item.analysisProvider,
            analysisModel: item.analysisModel,
            analyzedAt: item.analyzedAt ? new Date(item.analyzedAt) : null,
            originalContent: item.originalContent,
            cleanedContent: item.content,
            contentHash: hashContent(item.content),
            author: item.author,
            source: item.source,
            sourceUrl: item.sourceUrl,
            licenseStatus: item.licenseStatus,
            likes: item.likes,
            emotion: item.emotion,
            emotionScore: item.emotionScore,
            resonanceScore: item.resonanceScore,
            category: item.category,
            tags: item.tags,
            isFavorite: item.isFavorite,
            createdAt,
            updatedAt: createdAt,
          })
          .onConflictDoNothing({ target: [contentItems.accountId, contentItems.contentHash] })
          .returning();

        if (!row) {
          duplicateIndexes.push(index);
          continue;
        }
        inserted.push(mapContentItem(row));
      }

      return { items: inserted, duplicateIndexes };
    });
  }

  async list(
    query: ContentItemQuery = { sort: "newest", highResonance: false },
  ): Promise<ContentItem[]> {
    const conditions: SQL[] = [];
    if (query.accountId) conditions.push(eq(contentItems.accountId, query.accountId));
    if (query.sourceType) conditions.push(eq(contentItems.sourceType, query.sourceType));
    if (query.contentLane) conditions.push(eq(contentItems.contentLane, query.contentLane));
    if (query.scene) conditions.push(sql`position(${query.scene} in ${contentItems.scene}) > 0`);
    if (query.relationship) conditions.push(eq(contentItems.relationshipType, query.relationship));
    if (query.theme) conditions.push(sql`position(${query.theme} in ${contentItems.theme}) > 0`);
    if (query.favorite !== undefined) conditions.push(eq(contentItems.isFavorite, query.favorite));
    if (query.published !== undefined) conditions.push(sql`${publishedExpression} = ${query.published}`);
    if (query.emotion) conditions.push(eq(contentItems.emotion, query.emotion));
    if (query.category) conditions.push(eq(contentItems.category, query.category));
    if (query.highResonance) {
      conditions.push(sql`${contentItems.resonanceScore} >= 80`);
    }
    if (query.search) {
      const search = query.search.toLocaleLowerCase("zh-CN");
      conditions.push(sql<boolean>`position(
        ${search} in lower(concat_ws(
          ' ',
          ${contentItems.cleanedContent},
          coalesce(${contentItems.author}, ''),
          ${contentItems.source},
          ${contentItems.emotion},
          ${contentItems.category},
          ${contentItems.theme},
          ${contentItems.tags}::text
        ))
      ) > 0`);
    }

    const orderBy = query.sort === "resonance_desc"
      ? [sql`${contentItems.resonanceScore} desc nulls last`, desc(contentItems.likes), asc(contentItems.sequence)]
      : query.sort === "likes_desc"
        ? [desc(contentItems.likes), sql`${contentItems.resonanceScore} desc nulls last`, asc(contentItems.sequence)]
        : [desc(contentItems.createdAt), asc(contentItems.sequence)];
    const rows = await this.#db
      .select(contentSelection)
      .from(contentItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBy);
    return rows.map(mapContentItem);
  }

  async findById(id: string): Promise<ContentItem | undefined> {
    if (!ContentItemIdSchema.safeParse(id).success) return undefined;
    const [row] = await this.#db
      .select(contentSelection)
      .from(contentItems)
      .where(eq(contentItems.id, id))
      .limit(1);
    return row ? mapContentItem(row) : undefined;
  }

  async saveAnalysis(id: string, result: AiResult<StudioAnalysis>): Promise<ContentItem | undefined> {
    const item = await this.findById(id);
    if (!item) return undefined;
    const updated = ContentItemSchema.parse({ ...item, ...analysisFields(result) });
    await this.#db.update(contentItems).set({
      analysisKind: updated.analysisKind, analysisPayload: updated.analysis,
      analysisProvider: updated.analysisProvider, analysisModel: updated.analysisModel,
      analyzedAt: updated.analyzedAt ? new Date(updated.analyzedAt) : null,
      emotion: updated.emotion, emotionScore: updated.emotionScore, tags: updated.tags,
      scene: updated.scene, relationshipType: updated.relationshipType, theme: updated.theme,
      updatedAt: new Date(),
    }).where(eq(contentItems.id, id));
    return this.findById(id);
  }

  async setFavorite(id: string, favorite: boolean): Promise<ContentItem | undefined> {
    if (!ContentItemIdSchema.safeParse(id).success) return undefined;
    const [row] = await this.#db
      .update(contentItems)
      .set({ isFavorite: favorite, updatedAt: new Date() })
      .where(eq(contentItems.id, id))
      .returning();
    return row ? this.findById(id) : undefined;
  }

  async listFavorites(): Promise<ContentItem[]> {
    const rows = await this.#db
      .select(contentSelection)
      .from(contentItems)
      .where(eq(contentItems.isFavorite, true))
      .orderBy(asc(contentItems.sequence));
    return rows.map(mapContentItem);
  }

  async saveGenerated(content: GeneratedContent): Promise<void> {
    assertGeneratedSources(content, await Promise.all(content.contentIds.map((id) => this.findById(id))));
    await this.#db
      .insert(generatedContents)
      .values({
        id: content.id,
        accountId: content.accountId,
        contentLane: content.contentLane,
        primaryContentId: content.contentIds[0],
        outputKind: content.outputKind,
        outputPayload: content.output,
        reviewIssues: content.reviewIssues,
        publishability: content.publishability,
        confirmedAt: content.confirmedAt ? new Date(content.confirmedAt) : null,
        selectedContentIds: content.contentIds,
        title: content.title,
        body: content.body,
        tags: content.hashtags,
        generator: content.provider,
        model: content.model,
        generatorLabel: content.generatorLabel,
        status: content.status,
        createdAt: new Date(content.createdAt),
        updatedAt: new Date(content.createdAt),
      })
      .onConflictDoUpdate({
        target: generatedContents.id,
        set: {
          accountId: content.accountId,
          contentLane: content.contentLane,
          primaryContentId: content.contentIds[0],
          outputKind: content.outputKind,
          outputPayload: content.output,
          reviewIssues: content.reviewIssues,
          publishability: content.publishability,
          confirmedAt: content.confirmedAt ? new Date(content.confirmedAt) : null,
          selectedContentIds: content.contentIds,
          title: content.title,
          body: content.body,
          tags: content.hashtags,
          generator: content.provider,
          model: content.model,
          generatorLabel: content.generatorLabel,
          status: content.status,
          updatedAt: new Date(),
        },
      });
  }

  async findGeneratedById(id: string): Promise<GeneratedContent | undefined> {
    const [row] = await this.#db
      .select()
      .from(generatedContents)
      .where(eq(generatedContents.id, id))
      .limit(1);
    return row ? mapGeneratedContent(row) : undefined;
  }

  async listGenerated(accountId?: AccountId): Promise<GeneratedContent[]> {
    const rows = await this.#db.select().from(generatedContents)
      .where(accountId ? eq(generatedContents.accountId, accountId) : undefined)
      .orderBy(desc(generatedContents.createdAt));
    return rows.map(mapGeneratedContent);
  }

  async savePost(post: PostRecord): Promise<PostRecord> {
    const generated = await this.findGeneratedById(post.generatedContentId);
    assertPostSources(post, generated, await Promise.all((generated?.contentIds ?? []).map((id) => this.findById(id))));
    const savedId = await this.#db.transaction(async (tx) => {
      const [existing] = await tx.select().from(postRecords).where(eq(postRecords.generatedContentId, post.generatedContentId));
      if (existing && existing.id !== post.id) return existing.id;
      await tx.update(generatedContents).set({ status: "confirmed", confirmedAt: new Date(post.updatedAt), updatedAt: new Date() })
        .where(eq(generatedContents.id, post.generatedContentId));
      const values = {
        accountId: post.accountId, contentId: post.contentId, generatedContentId: post.generatedContentId,
        status: post.status, publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
        titleUsed: post.titleUsed, bodyUsed: post.bodyUsed, hashtagsUsed: post.hashtagsUsed,
        contentLane: post.contentLane, coverType: post.coverType, updatedAt: new Date(post.updatedAt),
      };
      const [saved] = await tx.insert(postRecords).values({ ...values, id: post.id, createdAt: new Date(post.createdAt) })
        .onConflictDoUpdate({ target: postRecords.generatedContentId, set: values }).returning({ id: postRecords.id });
      if (!saved) throw new Error("Post save failed");
      return saved.id;
    });
    const saved = await this.findPostById(savedId);
    if (!saved) throw new Error("Post save failed");
    return saved;
  }

  async listPosts(accountId?: AccountId): Promise<PostRecord[]> {
    const rows = await this.#db.select().from(postRecords)
      .leftJoin(postPerformances, eq(postRecords.id, postPerformances.postRecordId))
      .where(accountId ? eq(postRecords.accountId, accountId) : undefined)
      .orderBy(desc(postRecords.createdAt));
    return rows.map(({ post_records: post, post_performances: performance }) => mapPost(post, performance));
  }

  async findPostById(id: string): Promise<PostRecord | undefined> {
    if (!ContentItemIdSchema.safeParse(id).success) return undefined;
    const [row] = await this.#db.select().from(postRecords)
      .leftJoin(postPerformances, eq(postRecords.id, postPerformances.postRecordId))
      .where(eq(postRecords.id, id)).limit(1);
    return row ? mapPost(row.post_records, row.post_performances) : undefined;
  }

  async savePerformance(id: string, performance: Performance): Promise<PostRecord | undefined> {
    PerformanceSchema.parse(performance);
    if (!await this.findPostById(id)) return undefined;
    const values = { ...performance, metricsCapturedAt: performance.metricsCapturedAt ? new Date(performance.metricsCapturedAt) : null, updatedAt: new Date() };
    await this.#db.insert(postPerformances).values({ ...values, postRecordId: id })
      .onConflictDoUpdate({ target: postPerformances.postRecordId, set: values });
    return this.findPostById(id);
  }
}

function mapPost(post: typeof postRecords.$inferSelect, performance: typeof postPerformances.$inferSelect | null): PostRecord {
  return PostRecordSchema.parse({
    ...post, publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString(),
    performance: performance ? {
      views: performance.views, likes: performance.likes, favorites: performance.favorites,
      comments: performance.comments, shares: performance.shares, follows: performance.follows,
      metricsCapturedAt: performance.metricsCapturedAt?.toISOString() ?? null,
    } : null,
  });
}
