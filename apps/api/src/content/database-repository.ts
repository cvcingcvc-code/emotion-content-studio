import { createHash } from "node:crypto";
import {
  ContentItemSchema,
  GeneratedContentSchema,
  type ContentItem,
  type ContentItemQuery,
  type GeneratedContent,
} from "@emotion-studio/contracts";
import {
  contentItems,
  generatedContents,
  type DatabaseContext,
} from "@emotion-studio/database";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type {
  AddContentItemsResult,
  ContentRepository,
  NewContentItem,
} from "./repository.js";

type ContentItemRow = typeof contentItems.$inferSelect;
type GeneratedContentRow = typeof generatedContents.$inferSelect;
const ContentItemIdSchema = z.string().uuid();

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function mapContentItem(row: ContentItemRow): ContentItem {
  return ContentItemSchema.parse({
    id: row.id,
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
    return this.#db.transaction(async (transaction) => {
      const inserted: ContentItem[] = [];
      const duplicateIndexes: number[] = [];

      for (const [index, item] of items.entries()) {
        const createdAt = new Date(item.importedAt);
        const [row] = await transaction
          .insert(contentItems)
          .values({
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
          .onConflictDoNothing({ target: contentItems.contentHash })
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
          ${contentItems.tags}::text
        ))
      ) > 0`);
    }

    const orderBy = query.sort === "resonance_desc"
      ? [desc(contentItems.resonanceScore), desc(contentItems.likes), asc(contentItems.sequence)]
      : query.sort === "likes_desc"
        ? [desc(contentItems.likes), desc(contentItems.resonanceScore), asc(contentItems.sequence)]
        : [desc(contentItems.createdAt), asc(contentItems.sequence)];
    const rows = await this.#db
      .select()
      .from(contentItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBy);
    return rows.map(mapContentItem);
  }

  async findById(id: string): Promise<ContentItem | undefined> {
    if (!ContentItemIdSchema.safeParse(id).success) return undefined;
    const [row] = await this.#db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, id))
      .limit(1);
    return row ? mapContentItem(row) : undefined;
  }

  async setFavorite(id: string, favorite: boolean): Promise<ContentItem | undefined> {
    if (!ContentItemIdSchema.safeParse(id).success) return undefined;
    const [row] = await this.#db
      .update(contentItems)
      .set({ isFavorite: favorite, updatedAt: new Date() })
      .where(eq(contentItems.id, id))
      .returning();
    return row ? mapContentItem(row) : undefined;
  }

  async listFavorites(): Promise<ContentItem[]> {
    const rows = await this.#db
      .select()
      .from(contentItems)
      .where(eq(contentItems.isFavorite, true))
      .orderBy(asc(contentItems.sequence));
    return rows.map(mapContentItem);
  }

  async saveGenerated(content: GeneratedContent): Promise<void> {
    await this.#db
      .insert(generatedContents)
      .values({
        id: content.id,
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
}
