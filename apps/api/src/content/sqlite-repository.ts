import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { ContentItemSchema, GeneratedContentSchema, PostRecordSchema, PerformanceSchema, GrowthLoopStateSchema, type AccountId, type ContentItem, type ContentItemQuery, type GeneratedContent, type PostRecord, type Performance, type StudioAnalysis } from "@emotion-studio/contracts";
import type { SQLiteDatabaseContext, SQLiteTable } from "@emotion-studio/database";
import { analysisFields, assertGeneratedSources, assertPostSources, type ContentRepository, type NewContentItem } from "./repository.js";
import type { AiResult } from "../ai/types.js";
import { SQLiteGrowthLoopRepository } from "../growth-loop/sqlite-repository.js";

export class SQLiteContentRepository implements ContentRepository {
  readonly growthLoop: SQLiteGrowthLoopRepository;
  constructor(readonly database: SQLiteDatabaseContext) { this.growthLoop = new SQLiteGrowthLoopRepository(database); }
  private item(id: string) { const value = this.database.read("content_items", id); return value ? ContentItemSchema.parse(value) : undefined; }
  private generated(id: string) { const value = this.database.read("generated_contents", id); return value ? GeneratedContentSchema.parse(value) : undefined; }
  private publishedIds() {
    const ids = new Set<string>();
    for (const raw of this.database.all("posts")) { const post = PostRecordSchema.parse(raw); if (post.status === "published") for (const id of this.generated(post.generatedContentId)?.contentIds ?? []) ids.add(id); }
    return ids;
  }
  async addMany(items: NewContentItem[]) {
    items.forEach(item => ContentItemSchema.parse({ ...item, id: "candidate" }));
    return this.database.transaction(() => {
      const inserted: ContentItem[] = [], duplicateIndexes: number[] = [];
      items.forEach((item, index) => {
        if (this.database.db.prepare("SELECT id FROM content_items WHERE account_id=? AND content=?").get(item.accountId, item.content)) { duplicateIndexes.push(index); return; }
        const stored = ContentItemSchema.parse({ ...item, id: randomUUID() });
        this.database.db.prepare("INSERT INTO content_items VALUES (?, ?, ?, ?)").run(stored.id, stored.accountId, stored.content, JSON.stringify(stored)); inserted.push(stored);
      });
      return { items: inserted, duplicateIndexes };
    });
  }
  async list(query: ContentItemQuery = { sort: "newest", highResonance: false }) {
    const published = this.publishedIds(), search = query.search?.toLocaleLowerCase("zh-CN");
    const result = this.database.all("content_items").map(raw => ContentItemSchema.parse(raw)).map(item => ({ ...item, isPublished: published.has(item.id) })).filter(item => {
      if (query.accountId && item.accountId !== query.accountId || query.sourceType && item.sourceType !== query.sourceType || query.contentLane && item.contentLane !== query.contentLane) return false;
      if (query.scene && !item.scene?.includes(query.scene) || query.relationship && item.relationshipType !== query.relationship || query.theme && !item.theme?.includes(query.theme)) return false;
      if (query.favorite !== undefined && item.isFavorite !== query.favorite || query.published !== undefined && item.isPublished !== query.published) return false;
      if (query.emotion && item.emotion !== query.emotion || query.category && item.category !== query.category || query.highResonance && (item.resonanceScore ?? -1) < 80) return false;
      return !search || [item.content, item.author ?? "", item.source, item.emotion, item.category, item.theme, ...item.tags].join(" ").toLocaleLowerCase("zh-CN").includes(search);
    });
    return result.sort((a, b) => query.sort === "resonance_desc" ? (b.resonanceScore ?? -1) - (a.resonanceScore ?? -1) || b.likes - a.likes : query.sort === "likes_desc" ? b.likes - a.likes || (b.resonanceScore ?? -1) - (a.resonanceScore ?? -1) : b.importedAt.localeCompare(a.importedAt));
  }
  async findById(id: string) { const item = this.item(id); return item ? { ...item, isPublished: this.publishedIds().has(id) } : undefined; }
  async saveAnalysis(id: string, result: AiResult<StudioAnalysis>) {
    this.database.transaction(() => { const item = this.item(id); if (item) this.database.db.prepare("UPDATE content_items SET payload=? WHERE id=?").run(JSON.stringify(ContentItemSchema.parse({ ...item, ...analysisFields(result) })), id); });
    return this.findById(id);
  }
  async setFavorite(id: string, favorite: boolean) {
    this.database.transaction(() => { const item = this.item(id); if (item) this.database.db.prepare("UPDATE content_items SET payload=? WHERE id=?").run(JSON.stringify({ ...item, isFavorite: favorite }), id); });
    return this.findById(id);
  }
  async listFavorites() { return this.list({ sort: "newest", highResonance: false, favorite: true }); }
  async saveGenerated(content: GeneratedContent) {
    content = GeneratedContentSchema.parse(content);
    this.database.transaction(() => { assertGeneratedSources(content, content.contentIds.map(id => this.item(id))); this.database.db.prepare("INSERT INTO generated_contents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(content.id, JSON.stringify(content)); });
  }
  async findGeneratedById(id: string) { return this.generated(id); }
  async listGenerated(accountId?: AccountId) { return this.database.all("generated_contents").map(raw => GeneratedContentSchema.parse(raw)).filter(value => !accountId || value.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async savePost(post: PostRecord) {
    post = PostRecordSchema.parse(post);
    return this.database.transaction(() => {
      const generated = this.generated(post.generatedContentId);
      assertPostSources(post, generated, (generated?.contentIds ?? []).map(id => this.item(id)));
      const existing = this.database.db.prepare("SELECT payload FROM posts WHERE generated_id=?").get(post.generatedContentId);
      if (existing) { const previous = PostRecordSchema.parse(JSON.parse(String(existing.payload))); if (previous.id !== post.id) return previous; }
      this.database.db.prepare("UPDATE generated_contents SET payload=? WHERE id=?").run(JSON.stringify({ ...generated!, status: "confirmed", confirmedAt: post.updatedAt }), post.generatedContentId);
      this.database.db.prepare("INSERT INTO posts VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET generated_id=excluded.generated_id,payload=excluded.payload").run(post.id, post.generatedContentId, JSON.stringify(post)); return post;
    });
  }
  async listPosts(accountId?: AccountId) { return this.database.all("posts").map(raw => PostRecordSchema.parse(raw)).filter(value => !accountId || value.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async findPostById(id: string) { const value = this.database.read("posts", id); return value ? PostRecordSchema.parse(value) : undefined; }
  async savePerformance(id: string, performance: Performance) {
    return this.database.transaction(() => { const value = this.database.read("posts", id); if (!value) return undefined; const updated = PostRecordSchema.parse({ ...PostRecordSchema.parse(value), performance: PerformanceSchema.parse(performance), updatedAt: new Date().toISOString() }); this.database.db.prepare("UPDATE posts SET payload=? WHERE id=?").run(JSON.stringify(updated), id); return updated; });
  }
}

export const PersistenceDataSchema = z.object({ items: z.array(ContentItemSchema), generated: z.array(GeneratedContentSchema), posts: z.array(PostRecordSchema), growthLoop: GrowthLoopStateSchema }).strict();
const PersistenceSnapshotSchema = z.object({ format: z.literal("emotion-studio.persistence.v1"), exportedAt: z.iso.datetime(), checksum: z.string().regex(/^[a-f0-9]{64}$/), data: PersistenceDataSchema }).strict();
function digest(data: z.infer<typeof PersistenceDataSchema>) { return createHash("sha256").update(JSON.stringify(data)).digest("hex"); }
export function createPersistenceSnapshot(raw: unknown) { const data = PersistenceDataSchema.parse(raw); return { format: "emotion-studio.persistence.v1" as const, exportedAt: new Date().toISOString(), checksum: digest(data), data }; }
export async function captureRepositorySnapshot(repository: ContentRepository) {
  if (repository instanceof SQLiteContentRepository) {
    const db = repository.database;
    return db.transaction(() => createPersistenceSnapshot({ items: db.all("content_items"), generated: db.all("generated_contents"), posts: db.all("posts"), growthLoop: { retrospectives: db.all("retrospectives"), contents: db.all("loop_contents"), metrics: db.all("metrics"), feedback: db.all("feedback"), strategies: db.all("strategies") } }));
  }
  const capture = async () => ({ items: await repository.list(), generated: await repository.listGenerated(), posts: await repository.listPosts(), growthLoop: await repository.growthLoop.snapshot() });
  const first = await capture(), second = await capture();
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Repository changed during export; retry while idle");
  return createPersistenceSnapshot(first);
}
export function parsePersistenceSnapshot(raw: unknown) { const snapshot = PersistenceSnapshotSchema.parse(raw); if (digest(snapshot.data) !== snapshot.checksum) throw new Error("Snapshot checksum mismatch; source and destination preserved"); return snapshot; }
export function importPersistenceSnapshot(database: SQLiteDatabaseContext, raw: unknown) {
  const { data } = parsePersistenceSnapshot(raw);
  return database.transaction(() => {
    let inserted = 0;
    const insert = (table: SQLiteTable, value: { id: string }, sql: string, params: (string | number | null)[]) => {
      const previous = database.read(table, value.id);
      if (previous) { if (JSON.stringify(previous) !== JSON.stringify(value)) throw new Error("Conflicting record ID; restore to a new database instead"); return; }
      database.db.prepare(sql).run(...params); inserted++;
    };
    for (const item of data.items) { const value = { ...item, isPublished: false }; insert("content_items", value, "INSERT INTO content_items VALUES (?, ?, ?, ?)", [value.id, value.accountId, value.content, JSON.stringify(value)]); }
    for (const value of data.generated) { assertGeneratedSources(value, value.contentIds.map(id => { const rawItem = database.read("content_items", id); return rawItem ? ContentItemSchema.parse(rawItem) : undefined; })); insert("generated_contents", value, "INSERT INTO generated_contents VALUES (?, ?)", [value.id, JSON.stringify(value)]); }
    for (const value of data.posts) {
      const rawGenerated = database.read("generated_contents", value.generatedContentId), generated = rawGenerated ? GeneratedContentSchema.parse(rawGenerated) : undefined;
      assertPostSources(value, generated, (generated?.contentIds ?? []).map(id => { const rawItem = database.read("content_items", id); return rawItem ? ContentItemSchema.parse(rawItem) : undefined; }));
      insert("posts", value, "INSERT INTO posts VALUES (?, ?, ?)", [value.id, value.generatedContentId, JSON.stringify(value)]);
    }
    for (const value of data.growthLoop.retrospectives) insert("retrospectives", value, "INSERT INTO retrospectives VALUES (?, ?, ?)", [value.id, value.revision, JSON.stringify(value)]);
    const pending = [...data.growthLoop.contents];
    while (pending.length) {
      const index = pending.findIndex(value => (!value.sourceContentId || !!database.read("loop_contents", value.sourceContentId)) && (!value.sourceRetrospectiveId || !!database.read("retrospectives", value.sourceRetrospectiveId)));
      if (index < 0) throw new Error("Snapshot has missing or cyclic sources");
      const value = pending.splice(index, 1)[0]!;
      insert("loop_contents", value, "INSERT INTO loop_contents VALUES (?, ?, ?, ?, ?)", [value.id, value.revision, value.sourceRetrospectiveId, value.sourceContentId, JSON.stringify(value)]);
    }
    for (const value of data.growthLoop.metrics) {
      if ((database.read("loop_contents", value.contentId) as { status?: string } | undefined)?.status !== "published") throw new Error("Metrics require a published snapshot");
      insert("metrics", value, "INSERT INTO metrics VALUES (?, ?, ?)", [value.id, value.contentId, JSON.stringify(value)]);
    }
    for (const value of data.growthLoop.feedback) {
      if ((database.read("metrics", value.metricsId) as { contentId?: string } | undefined)?.contentId !== value.contentId) throw new Error("Feedback has invalid metrics source");
      insert("feedback", value, "INSERT INTO feedback VALUES (?, ?, ?, ?)", [value.id, value.metricsId, value.contentId, JSON.stringify(value)]);
    }
    for (const value of data.growthLoop.strategies) insert("strategies", value, "INSERT INTO strategies VALUES (?, ?)", [value.id, JSON.stringify(value)]);
    const keys = database.all("strategies").map(value => value as { status: string; account: string; key: string }).filter(value => value.status === "active").map(value => `${value.account}/${value.key}`);
    if (new Set(keys).size !== keys.length) throw new Error("Snapshot has conflicting active strategies");
    return { inserted };
  });
}
