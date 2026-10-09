import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createSqliteDatabase, restoreSqliteDatabase } from "@emotion-studio/database";
import { readServerConfig } from "../config.js";
import { createConfiguredRepository, projectRoot } from "./repository-factory.js";
import { captureRepositorySnapshot, createPersistenceSnapshot, importPersistenceSnapshot } from "./sqlite-repository.js";

const command = process.argv[2];
function option(name: string) { const index = process.argv.indexOf("--" + name); return index >= 0 ? process.argv[index + 1] : undefined; }
function requiredPath(name: string) { const value = option(name); if (!value) throw new Error("Missing --" + name); return resolve(projectRoot, value); }
function writeExclusive(path: string, data: unknown) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
async function main() {
  if (command === "capture-memory") {
    const url = new URL(option("url") ?? "http://127.0.0.1:8787");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search) throw new Error("Capture requires a credential-free local API URL");
    const read = async (path: string) => { const response = await fetch(new URL(path, url), { signal: AbortSignal.timeout(10000) }); const json = await response.json() as { ok: boolean; data: unknown }; if (!response.ok || !json.ok) throw new Error("Local API snapshot endpoint unavailable"); return json.data; };
    if ((await read("/api/v1/health") as { repository?: string }).repository !== "memory") throw new Error("Expected a running memory API; use export for durable storage");
    const capture = async () => { const [items, generated, posts, growthLoop] = await Promise.all(["/api/v1/content-items", "/api/v1/generated-contents", "/api/v1/post-records", "/api/v1/growth-loop"].map(read)); return { items, generated, posts, growthLoop }; };
    const first = await capture(), second = await capture();
    if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Records changed during capture; retry while idle");
    writeExclusive(requiredPath("out"), createPersistenceSnapshot(first)); console.log("Memory snapshot captured; source API unchanged"); return;
  }
  const config = readServerConfig({ ...process.env, ...(option("database") ? { CONTENT_REPOSITORY: "sqlite", SQLITE_PATH: option("database")! } : {}) });
  if (command === "export") {
    if (config.CONTENT_REPOSITORY === "memory") throw new Error("Use capture-memory before the live API exits; a new memory process contains no old data");
    const persistence = createConfiguredRepository(config);
    try { writeExclusive(requiredPath("out"), await captureRepositorySnapshot(persistence.repository)); console.log("Snapshot exported"); }
    finally { await persistence.close(); } return;
  }
  const path = resolve(projectRoot, config.SQLITE_PATH);
  if (command === "restore") {
    await restoreSqliteDatabase(requiredPath("input"), requiredPath("out"));
    console.log("Backup restored to new database; originals preserved"); return;
  }
  if (!["status", "backup", "import"].includes(command ?? "")) throw new Error("Usage: persistence status|export|backup|import|restore|capture-memory [--database path] [--input path] [--out NEW-path]");
  if (config.CONTENT_REPOSITORY !== "sqlite") throw new Error("This operation requires SQLite mode");
  const existed = existsSync(path);
  const database = createSqliteDatabase(path);
  try {
    if (command === "backup") { await database.backup(requiredPath("out")); console.log("Backup saved and integrity verified"); }
    if (command === "status") console.log(JSON.stringify({ repository: "sqlite", migrations: database.db.prepare("SELECT name FROM local_schema_migrations ORDER BY name").all(), integrity: database.db.prepare("PRAGMA integrity_check").get() }));
    if (command === "import") {
      const raw: unknown = JSON.parse(readFileSync(requiredPath("input"), "utf8"));
      if (existed) await database.backup(path + ".before-import-" + Date.now() + ".sqlite");
      console.log(JSON.stringify(importPersistenceSnapshot(database, raw)));
    }
  } finally { database.close(); }
}
try { await main(); } catch (error) { console.error(error instanceof Error && !/secret|password|api.?key/i.test(error.message) ? error.message : "Persistence operation failed; originals preserved"); process.exitCode = 1; }
