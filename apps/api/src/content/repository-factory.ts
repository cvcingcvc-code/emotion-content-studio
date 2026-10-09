import { createDatabase, createSqliteDatabase } from "@emotion-studio/database";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerConfig } from "../config.js";
import { DatabaseContentRepository } from "./database-repository.js";
import { createContentRepository, type ContentRepository } from "./repository.js";
import { SQLiteContentRepository } from "./sqlite-repository.js";

export const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export function createConfiguredRepository(config: ServerConfig): { repository: ContentRepository; close: () => Promise<void> } {
  if (config.CONTENT_REPOSITORY === "database") {
    const database = createDatabase(config.DATABASE_URL!);
    return { repository: new DatabaseContentRepository(database.db), close: () => database.close() };
  }
  if (config.CONTENT_REPOSITORY === "sqlite") {
    const database = createSqliteDatabase(resolve(projectRoot, config.SQLITE_PATH));
    return { repository: new SQLiteContentRepository(database), close: async () => { database.close(); } };
  }
  return { repository: createContentRepository({ nodeEnv: config.NODE_ENV }), close: async () => {} };
}
