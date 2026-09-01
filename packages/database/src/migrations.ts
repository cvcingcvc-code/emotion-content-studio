import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_ID = 1_903_044_291;

export const defaultMigrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

export interface AppliedMigration {
  name: string;
  checksum: string;
}

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function runMigrations(
  pool: Pool,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<AppliedMigration[]> {
  const files = (await readdir(migrationsDirectory))
    .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en"));
  const client = await pool.connect();
  const newlyApplied: AppliedMigration[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "name" text PRIMARY KEY,
        "checksum" text NOT NULL,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query<{ name: string; checksum: string }>(
      'SELECT "name", "checksum" FROM "schema_migrations"',
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));

    for (const fileName of files) {
      const sql = await readFile(join(migrationsDirectory, fileName), "utf8");
      const migrationChecksum = checksum(sql);
      const recordedChecksum = applied.get(fileName);

      if (recordedChecksum) {
        if (recordedChecksum !== migrationChecksum) {
          throw new Error(`Migration checksum mismatch: ${fileName}`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "schema_migrations" ("name", "checksum") VALUES ($1, $2)',
          [fileName, migrationChecksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      newlyApplied.push({ name: fileName, checksum: migrationChecksum });
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }

  return newlyApplied;
}
