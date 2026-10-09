import type { AiProvider } from "@emotion-studio/contracts";
import type { ServerConfig } from "../config.js";
import { createConfiguredRepository } from "../content/repository-factory.js";
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
  const persistence = createConfiguredRepository(config);
  return {
    repository: persistence.repository.growthLoop,
    agentMode: config.AI_PROVIDER,
    close: persistence.close,
  };
}
