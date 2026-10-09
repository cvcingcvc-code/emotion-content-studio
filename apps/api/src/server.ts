import { createConfiguredContentGenerator } from "./ai/provider-factory.js";
import { buildApp } from "./app.js";
import { createGrowthLoopAgent } from "./growth-loop/provider.js";
import { readServerConfig } from "./config.js";
import { MockContentAnalyzer } from "./content/analyzer.js";
import { createConfiguredRepository, projectRoot } from "./content/repository-factory.js";
import { resolve } from "node:path";
import { createConfiguredPipelines } from "./studio/pipelines/index.js";

const config = readServerConfig();
const persistence = createConfiguredRepository(config);
const contentRepository = persistence.repository;
const contentGenerator = createConfiguredContentGenerator(config);
const ingestionAnalyzer = new MockContentAnalyzer();
const app = await buildApp({
  englishWorkflow: { root: config.ENGLISH_ROOT ? resolve(projectRoot, config.ENGLISH_ROOT) : projectRoot },
  growthLoopAgent: createGrowthLoopAgent(config),
  logger: true,
  webOrigin: config.WEB_ORIGIN,
  contentRepository,
  contentRepositoryMode: config.CONTENT_REPOSITORY,
  contentGenerator,
  contentAnalyzer: ingestionAnalyzer,
  aiProvider: config.AI_PROVIDER,
  pipelines: createConfiguredPipelines(config),
});
app.addHook("onClose", persistence.close);

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
