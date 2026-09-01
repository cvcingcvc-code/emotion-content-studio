import { createDatabase, type DatabaseContext } from "@emotion-studio/database";
import { createConfiguredContentGenerator } from "./ai/provider-factory.js";
import { buildApp } from "./app.js";
import { readServerConfig } from "./config.js";
import { MockContentAnalyzer } from "./content/analyzer.js";
import { DatabaseContentRepository } from "./content/database-repository.js";
import { createContentRepository } from "./content/repository.js";

const config = readServerConfig();
let database: DatabaseContext | undefined;
const contentRepository = config.CONTENT_REPOSITORY === "database"
  ? (() => {
      if (!config.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for the database repository");
      }
      const databaseContext = createDatabase(config.DATABASE_URL);
      database = databaseContext;
      return new DatabaseContentRepository(databaseContext.db);
    })()
  : createContentRepository({ nodeEnv: config.NODE_ENV });
const contentGenerator = createConfiguredContentGenerator(config);
const ingestionAnalyzer = new MockContentAnalyzer();
const app = await buildApp({
  logger: true,
  webOrigin: config.WEB_ORIGIN,
  contentRepository,
  contentRepositoryMode: config.CONTENT_REPOSITORY,
  contentGenerator,
  contentAnalyzer: ingestionAnalyzer,
  aiProvider: config.AI_PROVIDER,
});
if (database) {
  app.addHook("onClose", async () => database?.close());
}

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "API failed");
  process.exitCode = 1;
  await app.close();
}
