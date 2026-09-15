import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readServerConfig } from "../config.js";
import { createGrowthLoopMcpContext, type GrowthLoopMcpContext } from "./context.js";
import { createGrowthLoopMcpServer } from "./server.js";

/** Local debugging transport (Claude Desktop / MCP inspector). The HTTP server is the remote target. */
export async function startGrowthLoopMcpStdio(context: GrowthLoopMcpContext): Promise<void> {
  const server = createGrowthLoopMcpServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main(): Promise<void> {
  const config = readServerConfig();
  const context = createGrowthLoopMcpContext(config);
  await startGrowthLoopMcpStdio(context);
  console.error(`[mcp] stdio ready; repository=${context.repository.mode} aiProvider=${context.agentMode}; tools never call a model.`);

  const shutdown = async (): Promise<void> => {
    await context.close().catch(() => {});
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[mcp] failed to start:", error instanceof Error ? error.name : "UnknownError");
    process.exitCode = 1;
  });
}
