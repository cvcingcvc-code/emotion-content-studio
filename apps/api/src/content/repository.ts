import {
  ContentItemSchema,
  GeneratedContentSchema,
  PostRecordSchema,
  PerformanceSchema,
  type AccountId,
  type Performance,
  type PostRecord,
  type StudioAnalysis,
  type ContentItem,
  type ContentItemQuery,
  type GeneratedContent,
} from "@emotion-studio/contracts";
import type { AiResult } from "../ai/types.js";
import { InMemoryGrowthLoopRepository, type GrowthLoopRepository } from "../growth-loop/repository.js";

export type NewContentItem = Omit<ContentItem, "id">;

// Explicit compatibility values for existing CSV/demo writers; no provenance is inferred.
export const legacyContentFields = {
  accountId: "emotion_library", sourceType: "legacy_import", contentLane: "emotion_material",
  sourcePlatform: null, collectedAt: null, scene: null, relationshipType: null, theme: null,
  analysisKind: null, analysis: null, analysisProvider: null, analysisModel: null, analyzedAt: null,
  isPublished: false,
} as const;

export const legacyGeneratedFields = {
  accountId: "emotion_library",
  contentLane: "emotion_post",
  outputKind: "legacy.v1",
  output: null,
  confirmedAt: null,
  publishability: "eligible",
  reviewIssues: [],
  promptVersion: "legacy.v1",
  reviewDecision: null,
  humanEditedOutput: null,
} as const;
export function analysisFields(result: AiResult<StudioAnalysis>) {
  const analysis = result.data;
  return {
    analysisKind: analysis.kind,
    analysis,
    analysisProvider: result.provider,
    analysisModel: result.model,
    analyzedAt: new Date().toISOString(),
    ...(analysis.kind === "emotion.v1" ? {
      emotion: analysis.primaryEmotion, emotionScore: analysis.emotionIntensity,
      scene: analysis.scene, relationshipType: analysis.relationshipType,
      theme: analysis.reusableTheme, tags: analysis.keywords,
    } : {}),
  };
}

export function assertGeneratedSources(generated: GeneratedContent, items: Array<ContentItem | undefined>): void {
  GeneratedContentSchema.parse(generated);
  if (items.length !== generated.contentIds.length || items.some((item) => !item || item.accountId !== generated.accountId)) {
    throw new Error("Generated content sources must exist and belong to its account");
  }
}

export function assertPostSources(post: PostRecord, generated: GeneratedContent | undefined, items: Array<ContentItem | undefined>): void {
  PostRecordSchema.parse(post);
  if (!generated || post.accountId !== generated.accountId || post.contentLane !== generated.contentLane ||
    post.contentId !== generated.contentIds[0] || generated.publishability !== "eligible" ||
    items.some((item) => !item || item.accountId !== post.accountId || !["original", "licensed"].includes(item.licenseStatus))) {
    throw new Error("Post record has invalid or restricted sources");
  }
}

export interface AddContentItemsResult {
  items: ContentItem[];
  duplicateIndexes: number[];
}

export interface ContentRepository {
  readonly growthLoop: GrowthLoopRepository;
  addMany(items: NewContentItem[]): Promise<AddContentItemsResult>;
  list(query?: ContentItemQuery): Promise<ContentItem[]>;
  findById(id: string): Promise<ContentItem | undefined>;
  saveAnalysis(id: string, result: AiResult<StudioAnalysis>): Promise<ContentItem | undefined>;
  setFavorite(id: string, favorite: boolean): Promise<ContentItem | undefined>;
  listFavorites(): Promise<ContentItem[]>;
  saveGenerated(content: GeneratedContent): Promise<void>;
  findGeneratedById(id: string): Promise<GeneratedContent | undefined>;
  listGenerated(accountId?: AccountId): Promise<GeneratedContent[]>;
  savePost(post: PostRecord): Promise<PostRecord>;
  listPosts(accountId?: AccountId): Promise<PostRecord[]>;
  findPostById(id: string): Promise<PostRecord | undefined>;
  savePerformance(id: string, performance: Performance): Promise<PostRecord | undefined>;
}

export interface InMemoryContentRepositoryOptions {
  maxItems?: number;
  maxGeneratedContents?: number;
}

export class InMemoryContentRepository implements ContentRepository {
  readonly growthLoop = new InMemoryGrowthLoopRepository();
  readonly #items: ContentItem[] = [];
  readonly #generatedContents = new Map<string, GeneratedContent>();
  readonly #posts = new Map<string, PostRecord>();
  readonly #maxItems: number;
  readonly #maxGeneratedContents: number;
  #nextContentId = 1;

  constructor(options: InMemoryContentRepositoryOptions = {}) {
    this.#maxItems = options.maxItems ?? 10_000;
    this.#maxGeneratedContents = options.maxGeneratedContents ?? 1_000;
  }

  async addMany(items: NewContentItem[]): Promise<AddContentItemsResult> {
    items.forEach((item) => ContentItemSchema.parse({ ...item, id: "candidate" }));
    const key = (item: NewContentItem) => `${item.accountId}\0${item.content}`;
    const existing = new Set(this.#items.map(key));
    const incomingUnique = new Set(
      items.map(key).filter((content) => !existing.has(content)),
    );
    if (this.#items.length + incomingUnique.size > this.#maxItems) {
      throw new Error(`In-memory content capacity exceeded (${this.#maxItems})`);
    }
    const inserted: ContentItem[] = [];
    const duplicateIndexes: number[] = [];

    items.forEach((item, index) => {
      if (existing.has(key(item))) {
        duplicateIndexes.push(index);
        return;
      }

      const stored: ContentItem = {
        ...structuredClone(item),
        id: `content-${String(this.#nextContentId).padStart(4, "0")}`,
      };
      this.#nextContentId += 1;
      existing.add(key(stored));
      this.#items.push(stored);
      inserted.push(structuredClone(stored));
    });

    return { items: inserted, duplicateIndexes };
  }

  async list(query: ContentItemQuery = {
    sort: "newest",
    highResonance: false,
  }): Promise<ContentItem[]> {
    const search = query.search?.toLocaleLowerCase("zh-CN");
    const result = this.#items.filter((item) => {
      if (query.accountId && item.accountId !== query.accountId) return false;
      if (query.sourceType && item.sourceType !== query.sourceType) return false;
      if (query.contentLane && item.contentLane !== query.contentLane) return false;
      if (query.scene && !item.scene?.includes(query.scene)) return false;
      if (query.relationship && item.relationshipType !== query.relationship) return false;
      if (query.theme && !item.theme?.includes(query.theme)) return false;
      if (query.favorite !== undefined && item.isFavorite !== query.favorite) return false;
      if (query.published !== undefined && this.#published(item.id) !== query.published) return false;
      if (query.emotion && item.emotion !== query.emotion) return false;
      if (query.category && item.category !== query.category) return false;
      if (query.highResonance && (item.resonanceScore ?? -1) < 80) return false;
      if (search) {
        const searchable = [
          item.content,
          item.author ?? "",
          item.source,
          item.emotion,
          item.category,
          item.theme,
          ...item.tags,
        ]
          .join(" ")
          .toLocaleLowerCase("zh-CN");
        if (!searchable.includes(search)) return false;
      }
      return true;
    });

    result.sort((left, right) => {
      if (query.sort === "resonance_desc") {
        return (right.resonanceScore ?? -1) - (left.resonanceScore ?? -1) || right.likes - left.likes;
      }
      if (query.sort === "likes_desc") {
        return right.likes - left.likes || (right.resonanceScore ?? -1) - (left.resonanceScore ?? -1);
      }
      return right.importedAt.localeCompare(left.importedAt);
    });

    return structuredClone(result.map((item) => ({ ...item, isPublished: this.#published(item.id) })));
  }

  async findById(id: string): Promise<ContentItem | undefined> {
    const item = this.#items.find((candidate) => candidate.id === id);
    return item ? structuredClone({ ...item, isPublished: this.#published(item.id) }) : undefined;
  }

  #published(id: string): boolean {
    return Array.from(this.#posts.values()).some((post) => post.status === "published" &&
      this.#generatedContents.get(post.generatedContentId)?.contentIds.includes(id));
  }

  async saveAnalysis(id: string, result: AiResult<StudioAnalysis>): Promise<ContentItem | undefined> {
    const index = this.#items.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    this.#items[index] = ContentItemSchema.parse({ ...this.#items[index], ...analysisFields(result) });
    return this.findById(id);
  }

  async setFavorite(id: string, favorite: boolean): Promise<ContentItem | undefined> {
    const item = this.#items.find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.isFavorite = favorite;
    return this.findById(id);
  }

  async listFavorites(): Promise<ContentItem[]> {
    return this.list({ sort: "newest", highResonance: false, favorite: true });
  }

  async saveGenerated(content: GeneratedContent): Promise<void> {
    assertGeneratedSources(content, await Promise.all(content.contentIds.map((id) => this.findById(id))));
    if (
      !this.#generatedContents.has(content.id) &&
      this.#generatedContents.size >= this.#maxGeneratedContents
    ) {
      throw new Error(
        `In-memory generated-content capacity exceeded (${this.#maxGeneratedContents})`,
      );
    }
    this.#generatedContents.set(content.id, structuredClone(content));
  }

  async findGeneratedById(id: string): Promise<GeneratedContent | undefined> {
    const content = this.#generatedContents.get(id);
    return content ? structuredClone(content) : undefined;
  }

  async listGenerated(accountId?: AccountId): Promise<GeneratedContent[]> {
    return structuredClone(Array.from(this.#generatedContents.values())
      .filter((item) => !accountId || item.accountId === accountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async savePost(post: PostRecord): Promise<PostRecord> {
    const generated = this.#generatedContents.get(post.generatedContentId);
    assertPostSources(post, generated, await Promise.all((generated?.contentIds ?? []).map((id) => this.findById(id))));
    if (!generated) throw new Error("Generated content not found");
    const existing = Array.from(this.#posts.values()).find((item) => item.generatedContentId === post.generatedContentId);
    if (existing && existing.id !== post.id) return structuredClone(existing);
    if (!existing && this.#posts.size >= 1_000) throw new Error("In-memory post capacity exceeded (1000)");
    this.#generatedContents.set(generated.id, { ...generated, status: "confirmed", confirmedAt: post.updatedAt });
    this.#posts.set(post.id, structuredClone(post));
    return structuredClone(post);
  }

  async listPosts(accountId?: AccountId): Promise<PostRecord[]> {
    return structuredClone(Array.from(this.#posts.values()).filter((post) => !accountId || post.accountId === accountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async findPostById(id: string): Promise<PostRecord | undefined> {
    const post = this.#posts.get(id);
    return post ? structuredClone(post) : undefined;
  }

  async savePerformance(id: string, performance: Performance): Promise<PostRecord | undefined> {
    const post = this.#posts.get(id);
    if (!post) return undefined;
    post.performance = PerformanceSchema.parse(performance);
    post.updatedAt = new Date().toISOString();
    return structuredClone(post);
  }
}

export interface CreateContentRepositoryOptions extends InMemoryContentRepositoryOptions {
  nodeEnv?: string;
}

export function createContentRepository(
  options: CreateContentRepositoryOptions = {},
): ContentRepository {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    throw new Error("InMemoryContentRepository is not allowed in production");
  }
  return new InMemoryContentRepository(options);
}
