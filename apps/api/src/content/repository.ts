import type {
  ContentItem,
  ContentItemQuery,
  GeneratedContent,
} from "@emotion-studio/contracts";

export type NewContentItem = Omit<ContentItem, "id">;

export interface AddContentItemsResult {
  items: ContentItem[];
  duplicateIndexes: number[];
}

export interface ContentRepository {
  addMany(items: NewContentItem[]): Promise<AddContentItemsResult>;
  list(query?: ContentItemQuery): Promise<ContentItem[]>;
  findById(id: string): Promise<ContentItem | undefined>;
  setFavorite(id: string, favorite: boolean): Promise<ContentItem | undefined>;
  listFavorites(): Promise<ContentItem[]>;
  saveGenerated(content: GeneratedContent): Promise<void>;
  findGeneratedById(id: string): Promise<GeneratedContent | undefined>;
}

export interface InMemoryContentRepositoryOptions {
  maxItems?: number;
  maxGeneratedContents?: number;
}

export class InMemoryContentRepository implements ContentRepository {
  readonly #items: ContentItem[] = [];
  readonly #generatedContents = new Map<string, GeneratedContent>();
  readonly #maxItems: number;
  readonly #maxGeneratedContents: number;
  #nextContentId = 1;

  constructor(options: InMemoryContentRepositoryOptions = {}) {
    this.#maxItems = options.maxItems ?? 10_000;
    this.#maxGeneratedContents = options.maxGeneratedContents ?? 1_000;
  }

  async addMany(items: NewContentItem[]): Promise<AddContentItemsResult> {
    const existing = new Set(this.#items.map((item) => item.content));
    const incomingUnique = new Set(
      items.map((item) => item.content).filter((content) => !existing.has(content)),
    );
    if (this.#items.length + incomingUnique.size > this.#maxItems) {
      throw new Error(`In-memory content capacity exceeded (${this.#maxItems})`);
    }
    const inserted: ContentItem[] = [];
    const duplicateIndexes: number[] = [];

    items.forEach((item, index) => {
      if (existing.has(item.content)) {
        duplicateIndexes.push(index);
        return;
      }

      const stored: ContentItem = {
        ...structuredClone(item),
        id: `content-${String(this.#nextContentId).padStart(4, "0")}`,
      };
      this.#nextContentId += 1;
      existing.add(stored.content);
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
      if (query.emotion && item.emotion !== query.emotion) return false;
      if (query.category && item.category !== query.category) return false;
      if (query.highResonance && item.resonanceScore < 80) return false;
      if (search) {
        const searchable = [
          item.content,
          item.author ?? "",
          item.source,
          item.emotion,
          item.category,
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
        return right.resonanceScore - left.resonanceScore || right.likes - left.likes;
      }
      if (query.sort === "likes_desc") {
        return right.likes - left.likes || right.resonanceScore - left.resonanceScore;
      }
      return right.importedAt.localeCompare(left.importedAt);
    });

    return structuredClone(result);
  }

  async findById(id: string): Promise<ContentItem | undefined> {
    const item = this.#items.find((candidate) => candidate.id === id);
    return item ? structuredClone(item) : undefined;
  }

  async setFavorite(id: string, favorite: boolean): Promise<ContentItem | undefined> {
    const item = this.#items.find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.isFavorite = favorite;
    return structuredClone(item);
  }

  async listFavorites(): Promise<ContentItem[]> {
    return structuredClone(this.#items.filter((item) => item.isFavorite));
  }

  async saveGenerated(content: GeneratedContent): Promise<void> {
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
