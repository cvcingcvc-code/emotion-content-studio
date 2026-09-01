import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseContext } from "./client.js";
import { runMigrations } from "./migrations.js";

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
    ]);
    expect(secondRun).toEqual([]);

    const tables = await database.pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('content_items', 'generated_contents', 'schema_migrations')
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "content_items",
      "generated_contents",
      "schema_migrations",
    ]);
  });
});
