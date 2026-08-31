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
}

export function createDatabase(
  databaseUrl: string,
  options: DatabaseOptions = {},
): DatabaseContext {
  if (!databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required to create a database connection");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
  });

  return {
    pool,
    db: drizzle(pool, { schema }),
    close: async () => pool.end(),
  };
}
