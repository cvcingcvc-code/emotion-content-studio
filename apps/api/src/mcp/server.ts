import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GrowthLoopMcpContext } from "./context.js";
import { registerGrowthLoopTools } from "./tools.js";

export const MCP_SERVER_NAME = "emotion-content-studio";
export const MCP_SERVER_VERSION = "0.1.0";

const instructions = [
  "Read-only MCP access to the Emotion Content Studio Growth Loop:",
  "retrospective → content opportunity → growth content → published content → metrics → feedback (KEEP / CHANGE / NEXT_EXPERIMENT) → next round.",
  "Every tool is read-only and never creates, updates, deletes, publishes, records metrics, sends messages, or runs commands.",
  "Records explicitly marked isDemo=true are synthetic demo entries; never treat them as real performance evidence.",
].join(" ");

export interface GrowthLoopMcpServerOptions {
  name?: string;
  version?: string;
}

export function createGrowthLoopMcpServer(context: GrowthLoopMcpContext, options: GrowthLoopMcpServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: options.name ?? MCP_SERVER_NAME, version: options.version ?? MCP_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions },
  );
  registerGrowthLoopTools(server, context);
  return server;
}
