import { mkdtempSync, mkdirSync, copyFileSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase, restoreSqliteDatabase, sqliteMigrationsDirectory } from "@emotion-studio/database";
import { RetrospectiveSchema } from "@emotion-studio/contracts";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SQLiteContentRepository, captureRepositorySnapshot, importPersistenceSnapshot } from "./sqlite-repository.js";
import { createDemoContentItems } from "./demo-data.js";
import { MockContentAnalyzer } from "./analyzer.js";

describe("SQLite persistence and recovery", () => {
  it("preserves sources, favorites, retrospective edits and revisions across reopen", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sqlite-restart-")), "studio.sqlite");
    const db = createSqliteDatabase(path), repo = new SQLiteContentRepository(db);
    const [item] = (await repo.addMany((await createDemoContentItems(new MockContentAnalyzer(), "2026-10-09T00:00:00.000Z")).slice(0, 1))).items;
    await repo.setFavorite(item!.id, true);
    const retro = RetrospectiveSchema.parse({ id: randomUUID(), revision: 0, date: "2026-10-09", whatHappened: "保留原始复盘", createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z", analysis: null, analysisProvider: null });
    await repo.growthLoop.saveRetrospective(retro, null);
    await repo.growthLoop.saveRetrospective({ ...retro, revision: 1, whatHappened: "保存编辑后的复盘" }, 0);
    db.close(); const reopened = createSqliteDatabase(path), second = new SQLiteContentRepository(reopened);
    try {
      expect(await second.findById(item!.id)).toMatchObject({ isFavorite: true, originalContent: item!.originalContent });
      expect((await second.growthLoop.snapshot()).retrospectives[0]).toMatchObject({ revision: 1, whatHappened: "保存编辑后的复盘" });
      await expect(second.growthLoop.saveRetrospective({ ...retro, revision: 1 }, 0)).rejects.toMatchObject({ code: "STALE_REVISION" });
    } finally { reopened.close(); }
  });
  it("imports validated snapshots idempotently, refuses tampering and rolls back collisions", async () => {
    const source = createSqliteDatabase(":memory:"), target = createSqliteDatabase(":memory:");
    try {
      const repo = new SQLiteContentRepository(source);
      await repo.addMany((await createDemoContentItems(new MockContentAnalyzer(), "2026-10-09T00:00:00.000Z")).slice(0, 2));
      const snapshot = await captureRepositorySnapshot(repo);
      expect(importPersistenceSnapshot(target, snapshot).inserted).toBe(2);
      expect(importPersistenceSnapshot(target, snapshot).inserted).toBe(0);
      const tampered = structuredClone(snapshot); tampered.data.items[0]!.content = "被修改";
      expect(() => importPersistenceSnapshot(target, tampered)).toThrow("checksum");
      expect(await new SQLiteContentRepository(target).list()).toEqual(await repo.list());
      const corrupt = structuredClone(snapshot); corrupt.data.items.push({ ...corrupt.data.items[0]!, id: "new-id" });
      const { createPersistenceSnapshot } = await import("./sqlite-repository.js");
      expect(() => importPersistenceSnapshot(target, createPersistenceSnapshot(corrupt.data))).toThrow();
      expect(await new SQLiteContentRepository(target).list()).toHaveLength(2);
    } finally { source.close(); target.close(); }
  });
  it("backs up online to new files only, restores independently and preserves source data", async () => {
    const root = mkdtempSync(join(tmpdir(), "sqlite-backup-")), source = createSqliteDatabase(join(root, "studio.sqlite"));
    try {
      const repo = new SQLiteContentRepository(source);
      await repo.addMany((await createDemoContentItems(new MockContentAnalyzer(), "2026-10-09T00:00:00.000Z")).slice(0, 1));
      const backupPath = await source.backup(join(root, "backup.sqlite"));
      const liveRestore = await restoreSqliteDatabase(source.path, join(root, "live-restored.sqlite"));
      const live = createSqliteDatabase(liveRestore);
      try { expect(await new SQLiteContentRepository(live).list()).toEqual(await repo.list()); } finally { live.close(); }
      const empty = join(root, "empty.sqlite"); writeFileSync(empty, "");
      await expect(restoreSqliteDatabase(empty, join(root, "invalid-restored.sqlite"))).rejects.toThrow();
      await expect(source.backup(backupPath)).rejects.toMatchObject({ code: "EEXIST" });
      const restored = createSqliteDatabase(backupPath);
      try { expect(await new SQLiteContentRepository(restored).list()).toEqual(await repo.list()); }
      finally { restored.close(); }
      expect(await repo.list()).toHaveLength(1);
    } finally { source.close(); }
  });
  it("checks migration checksums, rejects newer schemas and rolls back failed upgrades", () => {
    const root = mkdtempSync(join(tmpdir(), "sqlite-migration-")), directory = join(root, "migrations"); mkdirSync(directory);
    const migration = "0001_local_persistence.sql";
    copyFileSync(join(sqliteMigrationsDirectory, migration), join(directory, migration));
    const path = join(root, "studio.sqlite"), db = createSqliteDatabase(path, directory); db.close();
    appendFileSync(join(directory, migration), "\n-- modified history\n");
    expect(() => createSqliteDatabase(path, directory)).toThrow("checksum");
    copyFileSync(join(sqliteMigrationsDirectory, migration), join(directory, migration));
    writeFileSync(join(directory, "0002_failure.sql"), "CREATE TABLE temporary_upgrade(id TEXT); INVALID SQL;");
    expect(() => createSqliteDatabase(path, directory)).toThrow();
    const preserved = createSqliteDatabase(path);
    try {
      expect(preserved.db.prepare("SELECT name FROM sqlite_master WHERE name='temporary_upgrade'").get()).toBeUndefined();
      preserved.db.prepare("INSERT INTO local_schema_migrations VALUES (?, ?)").run("0099_future.sql", "future");
    }
    finally { preserved.close(); }
    expect(() => createSqliteDatabase(path)).toThrow("newer");
  });
});
