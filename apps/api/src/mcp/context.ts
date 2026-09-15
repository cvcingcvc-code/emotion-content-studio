import { createDatabase } from "@emotion-studio/database";
import type { AiProvider } from "@emotion-studio/contracts";
import type { ServerConfig } from "../config.js";
import { DatabaseContentRepository } from "../content/database-repository.js";
import { createContentRepository } from "../content/repository.js";
import type { GrowthLoopRepository } from "../growth-loop/repository.js";

/**
 * Read-only context for the Growth Loop MCP server.
 * It reuses exactly the same repository selection rules as the API server:
 * `CONTENT_REPOSITORY=database` requires `DATABASE_URL` and never silently falls
 * back to an in-memory (or demo) store; `memory` is only used when explicitly configured.
 */
export interface GrowthLoopMcpContext {
  repository: GrowthLoopRepository;
  /** Provider mode reported by the existing dashboard projection. Read tools never call a model. */
  agentMode: AiProvider;
  close: () => Promise<void>;
}

export function createGrowthLoopMcpContext(config: ServerConfig): GrowthLoopMcpContext {
  if (config.CONTENT_REPOSITORY === "database") {
    if (!config.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for the database repository");
    }
    const database = createDatabase(config.DATABASE_URL);
    return {
      repository: new DatabaseContentRepository(database.db).growthLoop,
      agentMode: config.AI_PROVIDER,
      close: () => database.close(),
    };
  }
  // Memory is explicit configuration, never a fallback: production + memory is rejected by readServerConfig.
  const contentRepository = createContentRepository({ nodeEnv: config.NODE_ENV });
  return {
    repository: contentRepository.growthLoop,
    agentMode: config.AI_PROVIDER,
    close: async () => {},
  };
}
