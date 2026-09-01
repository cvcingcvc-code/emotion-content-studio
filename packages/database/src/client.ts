import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export interface DatabaseContext {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
  close: () => Promise<void>;
}

export interface DatabaseOptions {
  maxConnections?: number;
  connectionTimeoutMs?: number;
  searchPath?: string;
}

export function createDatabase(
  databaseUrl: string,
  options: DatabaseOptions = {},
): DatabaseContext {
  if (!databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required to create a database connection");
  }
  if (options.searchPath && !/^[a-z][a-z0-9_]{0,62}$/.test(options.searchPath)) {
    throw new Error("Database searchPath must be a safe PostgreSQL identifier");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
    ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
  });

  return {
    pool,
    db: drizzle(pool, { schema }),
    close: async () => pool.end(),
  };
}
