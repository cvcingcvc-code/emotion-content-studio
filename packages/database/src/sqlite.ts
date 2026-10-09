import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, openSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const sqliteMigrationsDirectory = fileURLToPath(new URL("../sqlite-migrations/", import.meta.url));
export type SQLiteTable = "content_items" | "generated_contents" | "posts" | "retrospectives" | "loop_contents" | "metrics" | "feedback" | "strategies";
export class SQLiteDatabaseContext {
  readonly db: DatabaseSync;
  constructor(readonly path: string, migrationsDirectory = sqliteMigrationsDirectory) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.transaction(() => {
        this.db.exec("CREATE TABLE IF NOT EXISTS local_schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)");
        const files = readdirSync(migrationsDirectory).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
        const applied = this.db.prepare("SELECT name, checksum FROM local_schema_migrations").all();
        if (applied.some(row => !files.includes(String(row.name)))) throw new Error("SQLite schema is newer than this application; preserve the database and use the matching version");
        for (const name of files) {
          const sql = readFileSync(join(migrationsDirectory, name), "utf8").replace(/\r\n/g, "\n");
          const checksum = createHash("sha256").update(sql).digest("hex");
          const previous = applied.find(row => row.name === name);
          if (previous) { if (previous.checksum !== checksum) throw new Error("SQLite migration checksum mismatch: " + name); continue; }
          this.db.exec(sql); this.db.prepare("INSERT INTO local_schema_migrations VALUES (?, ?)").run(name, checksum);
        }
      });
      if (this.db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw new Error("SQLite integrity check failed; database preserved");
    } catch (error) { this.close(); throw error; }
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = action(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  read(table: SQLiteTable, id: string): unknown | undefined {
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id);
    return row ? JSON.parse(String(row.payload)) as unknown : undefined;
  }
  all(table: SQLiteTable): unknown[] { return this.db.prepare(`SELECT payload FROM ${table} ORDER BY rowid`).all().map(row => JSON.parse(String(row.payload)) as unknown); }
  close(): void { if (this.db.isOpen) this.db.close(); }
  async backup(destination: string) {
    const target = resolve(destination);
    mkdirSync(dirname(target), { recursive: true });
    const handle = openSync(target, "wx"); closeSync(handle);
    await backup(this.db, target);
    const verify = new DatabaseSync(target, { readOnly: true });
    try { if (verify.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Backup integrity check failed; file retained for inspection"); }
    finally { verify.close(); }
    return target;
  }
}
export function createSqliteDatabase(path: string, migrationsDirectory?: string) { return new SQLiteDatabaseContext(path, migrationsDirectory); }
export async function restoreSqliteDatabase(source: string, destination: string) {
  const input = new DatabaseSync(resolve(source), { readOnly: true });
  try {
    if (input.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || !input.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='local_schema_migrations'").get()) throw new Error("Not a recognized intact Emotion Studio database");
    const target = resolve(destination); mkdirSync(dirname(target), { recursive: true });
    const handle = openSync(target, "wx"); closeSync(handle);
    // The backup API includes committed WAL pages even while the source is open.
    await backup(input, target);
    const restored = createSqliteDatabase(target); restored.close(); return target;
  } finally { input.close(); }
}
