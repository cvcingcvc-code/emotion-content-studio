import { buildApp } from "./app.js";
import { readServerConfig } from "./config.js";

const config = readServerConfig();
const app = await buildApp({ logger: true, webOrigin: config.WEB_ORIGIN });

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
