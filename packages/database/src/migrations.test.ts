import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseContext } from "./client.js";
import { defaultMigrationsDirectory, runMigrations } from "./migrations.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

integrationDescribe("database migrations", () => {
  const schemaName = `migration_test_${randomUUID().replaceAll("-", "")}`;
  let adminPool: Pool;
  let database: DatabaseContext;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: testDatabaseUrl! });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    database = createDatabase(testDatabaseUrl!, { searchPath: schemaName });
  });

  afterAll(async () => {
    await database?.close();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("applies all migrations to an empty schema and is repeatable", async () => {
    const firstRun = await runMigrations(database.pool);
    const secondRun = await runMigrations(database.pool);

    expect(firstRun.map((migration) => migration.name)).toEqual([
      "0000_independent_prototype.sql",
      "0001_content_repository.sql",
      "0002_multi_account_foundation.sql",
      "0003_generation_observability.sql",
      "0004_growth_loop.sql",
    ]);
    expect(secondRun).toEqual([]);

    const tables = await database.pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN (
          'accounts',
          'content_items',
          'generated_contents',
          'post_performances',
          'post_records',
          'schema_migrations'
        )
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "accounts",
      "content_items",
      "generated_contents",
      "post_performances",
      "post_records",
      "schema_migrations",
    ]);

    const accountResult = await database.pool.query<{
      id: string;
      primary_lane: string;
      sort_order: number;
    }>(`
      SELECT "id", "primary_lane", "sort_order"
      FROM "accounts"
      ORDER BY "sort_order"
    `);
    expect(accountResult.rows).toEqual([
      { id: "personal_growth", primary_lane: "growth_review", sort_order: 1 },
      { id: "fun_english", primary_lane: "english_50", sort_order: 2 },
      { id: "emotion_library", primary_lane: "emotion_material", sort_order: 3 },
    ]);
  });

  it("upgrades 0001 data without losing content or generated draft metadata", async () => {
    const legacySchemaName = `migration_upgrade_${randomUUID().replaceAll("-", "")}`;
    const legacyMigrationsDirectory = await mkdtemp(
      join(tmpdir(), "emotion-studio-legacy-migrations-"),
    );
    let legacyDatabase: DatabaseContext | undefined;

    try {
      await adminPool.query(`CREATE SCHEMA "${legacySchemaName}"`);
      legacyDatabase = createDatabase(testDatabaseUrl!, { searchPath: legacySchemaName });
      for (const migrationName of [
        "0000_independent_prototype.sql",
        "0001_content_repository.sql",
      ]) {
        await copyFile(
          join(defaultMigrationsDirectory, migrationName),
          join(legacyMigrationsDirectory, migrationName),
        );
      }

      expect((await runMigrations(legacyDatabase.pool, legacyMigrationsDirectory))
        .map((migration) => migration.name)).toEqual([
        "0000_independent_prototype.sql",
        "0001_content_repository.sql",
      ]);

      const insertedContent = await legacyDatabase.pool.query<{ id: string }>(`
        INSERT INTO "content_items" (
          "original_content",
          "cleaned_content",
          "content_hash",
          "author",
          "source",
          "source_url",
          "license_status",
          "likes",
          "emotion",
          "emotion_score",
          "resonance_score",
          "category",
          "tags",
          "is_favorite"
        ) VALUES (
          '  历史原文保持不变  ',
          '历史原文保持不变',
          'legacy-content-hash',
          NULL,
          '历史导入',
          NULL,
          'original',
          12,
          '孤独',
          82,
          91,
          '孤独',
          '["历史"]'::jsonb,
          true
        )
        RETURNING "id"
      `);
      const legacyContentId = insertedContent.rows[0]!.id;

      await legacyDatabase.pool.query(
        `
          INSERT INTO "generated_contents" (
            "id",
            "selected_content_ids",
            "title",
            "body",
            "tags",
            "generator",
            "model",
            "generator_label",
            "status"
          ) VALUES (
            'generated-legacy-upgrade',
            $1::jsonb,
            '历史草稿标题',
            '历史草稿正文必须保持不变',
            '["#历史"]'::jsonb,
            'deepseek',
            'legacy-model',
            'AI 生成草稿',
            'draft'
          )
        `,
        [JSON.stringify([legacyContentId])],
      );

      expect((await runMigrations(legacyDatabase.pool)).map((migration) => migration.name))
        .toEqual(["0002_multi_account_foundation.sql", "0003_generation_observability.sql", "0004_growth_loop.sql"]);
      expect(await runMigrations(legacyDatabase.pool)).toEqual([]);

      const upgradedContent = await legacyDatabase.pool.query<{
        account_id: string;
        source_type: string;
        content_lane: string;
        original_content: string;
        cleaned_content: string;
        emotion: string | null;
        resonance_score: number | null;
        collected_at: Date | null;
      }>(
        `
          SELECT
            "account_id",
            "source_type",
            "content_lane",
            "original_content",
            "cleaned_content",
            "emotion",
            "resonance_score",
            "collected_at"
          FROM "content_items"
          WHERE "id" = $1
        `,
        [legacyContentId],
      );
      expect(upgradedContent.rows[0]).toMatchObject({
        account_id: "emotion_library",
        source_type: "legacy_import",
        content_lane: "emotion_material",
        original_content: "  历史原文保持不变  ",
        cleaned_content: "历史原文保持不变",
        emotion: "孤独",
        resonance_score: 91,
        collected_at: null,
      });

      const upgradedGenerated = await legacyDatabase.pool.query<{
        account_id: string;
        content_lane: string;
        primary_content_id: string | null;
        title: string;
        body: string;
        generator: string;
        model: string;
        output_kind: string;
        output_payload: Record<string, unknown> | null;
        review_issues: string[];
        publishability: string;
      }>(`
        SELECT
          "account_id",
          "content_lane",
          "primary_content_id",
          "title",
          "body",
          "generator",
          "model",
          "output_kind",
          "output_payload",
          "review_issues",
          "publishability"
        FROM "generated_contents"
        WHERE "id" = 'generated-legacy-upgrade'
      `);
      expect(upgradedGenerated.rows[0]).toEqual({
        account_id: "emotion_library",
        content_lane: "emotion_post",
        primary_content_id: legacyContentId,
        title: "历史草稿标题",
        body: "历史草稿正文必须保持不变",
        generator: "deepseek",
        model: "legacy-model",
        output_kind: "legacy.v1",
        output_payload: null,
        review_issues: ["legacy_output_requires_review"],
        publishability: "needs_rewrite",
      });

      await legacyDatabase.pool.query(
        `
          INSERT INTO "content_items" (
            "account_id",
            "source_type",
            "content_lane",
            "original_content",
            "cleaned_content",
            "content_hash",
            "source",
            "license_status"
          ) VALUES (
            'personal_growth',
            'manual',
            'growth_review',
            '同一文本可以属于另一账号',
            '同一文本可以属于另一账号',
            'legacy-content-hash',
            '手动输入',
            'original'
          )
        `,
      );
      const sameHashCount = await legacyDatabase.pool.query<{ count: string }>(`
        SELECT count(*)::text AS "count"
        FROM "content_items"
        WHERE "content_hash" = 'legacy-content-hash'
      `);
      expect(sameHashCount.rows[0]?.count).toBe("2");

      await expect(legacyDatabase.pool.query(`
        INSERT INTO "content_items" (
          "account_id",
          "source_type",
          "content_lane",
          "original_content",
          "cleaned_content",
          "content_hash",
          "source",
          "license_status"
        ) VALUES (
          'fun_english',
          'english_topic',
          'growth_review',
          '账号赛道不匹配',
          '账号赛道不匹配',
          'invalid-account-lane',
          '手动输入',
          'original'
        )
      `)).rejects.toMatchObject({ code: "23514" });

      const insertedPost = await legacyDatabase.pool.query<{ id: string }>(
        `
          INSERT INTO "post_records" (
            "account_id",
            "content_id",
            "generated_content_id",
            "status",
            "title_used",
            "body_used",
            "hashtags_used",
            "content_lane"
          ) VALUES (
            'emotion_library',
            $1,
            'generated-legacy-upgrade',
            'draft',
            '实际使用标题',
            '实际使用正文快照',
            '["#实际发布"]'::jsonb,
            'emotion_post'
          )
          RETURNING "id"
        `,
        [legacyContentId],
      );
      const postRecordId = insertedPost.rows[0]!.id;

      await expect(legacyDatabase.pool.query(
        `
          INSERT INTO "post_records" (
            "account_id",
            "content_id",
            "generated_content_id",
            "status",
            "title_used",
            "body_used",
            "content_lane"
          ) VALUES (
            'emotion_library',
            $1,
            'generated-legacy-upgrade',
            'draft',
            '重复发布记录',
            '重复发布正文',
            'emotion_post'
          )
        `,
        [legacyContentId],
      )).rejects.toMatchObject({ code: "23505" });

      await expect(legacyDatabase.pool.query(
        `
          UPDATE "post_records"
          SET "status" = 'published'
          WHERE "id" = $1
        `,
        [postRecordId],
      )).rejects.toMatchObject({ code: "23514" });

      await expect(legacyDatabase.pool.query(
        `
          INSERT INTO "post_performances" ("post_record_id", "views", "metrics_captured_at")
          VALUES ($1, -1, now())
        `,
        [postRecordId],
      )).rejects.toMatchObject({ code: "23514" });

      await expect(legacyDatabase.pool.query(
        `
          INSERT INTO "post_performances" ("post_record_id", "views")
          VALUES ($1, 10)
        `,
        [postRecordId],
      )).rejects.toMatchObject({ code: "23514" });

      await legacyDatabase.pool.query(
        `
          INSERT INTO "post_performances" ("post_record_id")
          VALUES ($1)
        `,
        [postRecordId],
      );
    } finally {
      await legacyDatabase?.close();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${legacySchemaName}" CASCADE`);
      await rm(legacyMigrationsDirectory, { recursive: true, force: true });
    }
  });
});
