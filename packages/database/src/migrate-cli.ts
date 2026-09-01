import { createDatabase } from "./client.js";
import { runMigrations } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const database = createDatabase(databaseUrl);

try {
  const applied = await runMigrations(database.pool);
  process.stdout.write(`Applied ${applied.length} migration(s).\n`);
} finally {
  await database.close();
}
