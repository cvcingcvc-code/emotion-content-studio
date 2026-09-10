import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createDatabase, runMigrations, type DatabaseContext } from "@emotion-studio/database";
import { RetrospectiveSchema, PublishedContentSchema } from "@emotion-studio/contracts";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { InMemoryGrowthLoopRepository, type GrowthLoopRepository } from "./repository.js";
import { DatabaseGrowthLoopRepository } from "./database-repository.js";

function contract(factory: () => GrowthLoopRepository) {
  it("creates and updates retrospectives, guards revisions, isolates snapshots", async () => {
    const repo = factory(), now = new Date().toISOString();
    const retro = RetrospectiveSchema.parse({ id: randomUUID(), revision: 0, date: "2026-09-10", whatHappened: "返工", createdAt: now, updatedAt: now, analysis: null, analysisProvider: null });
    await repo.saveRetrospective(retro, null);
    await repo.saveRetrospective({ ...retro, revision: 1, whatHappened: "先确认范围" }, 0);
    await expect(repo.saveRetrospective({ ...retro, revision: 1 }, 0)).rejects.toThrow();
    const state = await repo.snapshot();
    expect(state.retrospectives.find(x => x.id === retro.id)?.whatHappened).toBe("先确认范围");
    state.retrospectives.length = 0;
    expect((await repo.snapshot()).retrospectives.length).toBeGreaterThan(0);
  });
  it("round-trips a published snapshot and metrics, rejects metrics before publication", async () => {
    const repo = factory(), now = new Date().toISOString();
    const content = PublishedContentSchema.parse({ id: randomUUID(), revision: 0, account: "growth", title: "确认范围", topic: "返工", contentType: "solution", sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null, createdAt: now, updatedAt: now, publishedAt: null, publishTime: null, status: "draft", writing: null, english: null, note: "", provider: "mock", isDemo: false });
    await repo.saveContent(content, null);
    const metrics = { id: randomUUID(), contentId: content.id, capturedAt: now, views: 0, likes: 0, favorites: 0, comments: 0, followersGained: 0, note: "" };
    await expect(repo.addMetrics(metrics)).rejects.toThrow();
    await repo.saveContent({ ...content, revision: 1, status: "published", publishedAt: now, publishTime: now, writing: { title: content.title, body: "先确认范围", corePoint: "确认", solution: "列标准", endingQuestion: "你呢？", tags: ["#工作"] } }, 0);
    await repo.addMetrics(metrics);
    expect((await repo.snapshot()).metrics.find(x => x.id === metrics.id)).toEqual(metrics);
    await expect(repo.addMetrics(metrics)).rejects.toThrow();
  });
}
describe("growth loop memory repository", () => contract(() => new InMemoryGrowthLoopRepository()));
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("growth loop database repository", () => {
  const schema = `growth_loop_test_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool, database: DatabaseContext;
  beforeAll(async () => { admin = new Pool({ connectionString: url! }); await admin.query(`CREATE SCHEMA "${schema}"`); database = createDatabase(url!, { searchPath: schema }); await runMigrations(database.pool); });
  afterAll(async () => { await database?.close(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
  contract(() => new DatabaseGrowthLoopRepository(database.db));
});
