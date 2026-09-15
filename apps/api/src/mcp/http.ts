import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { readServerConfig } from "../config.js";
import { createGrowthLoopMcpContext, type GrowthLoopMcpContext } from "./context.js";
import { createGrowthLoopMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./server.js";

/** Remote-capable Streamable HTTP endpoint. The API (8787) and Web (5173) ports stay untouched. */
export const MCP_HTTP_PATH = "/mcp";

export interface GrowthLoopMcpHttpServerOptions {
  path?: string;
}

export interface GrowthLoopMcpHttpServer {
  path: string;
  listen: (port: number, host: string) => Promise<{ url: string; port: number }>;
  close: () => Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(payload);
}

/**
 * Stateless Streamable HTTP transport: every POST gets a fresh MCP server instance,
 * so read-only tools need no session state and a crashed MCP process cannot affect
 * the web demo or the API. Only `/mcp` speaks MCP; `/health` is a plain status probe.
 */
export function createGrowthLoopMcpHttpServer(context: GrowthLoopMcpContext, options: GrowthLoopMcpHttpServerOptions = {}): GrowthLoopMcpHttpServer {
  const path = options.path ?? MCP_HTTP_PATH;

  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
          mode: "read-only",
          repository: context.repository.mode,
          endpoint: path,
        });
        return;
      }
      if (url.pathname !== path) {
        sendJson(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "未找到请求的接口" } });
        return;
      }
      const server = createGrowthLoopMcpServer(context);
      // Omitted sessionIdGenerator = stateless Streamable HTTP; cast bridges the SDK's
      // `| undefined` optional properties vs this repo's exactOptionalPropertyTypes.
      const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
      response.on("close", () => {
        void transport.close().catch(() => {});
        void server.close().catch(() => {});
      });
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("[mcp] request failed:", error instanceof Error ? error.name : "UnknownError");
      if (!response.headersSent) {
        sendJson(response, 500, { ok: false, error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" } });
      } else {
        response.end();
      }
    }
  };

  const httpServer = createServer((request, response) => { void handleRequest(request, response); });

  return {
    path,
    listen: (port, host) => new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      httpServer.once("error", onError);
      httpServer.listen(port, host, () => {
        httpServer.off("error", onError);
        const address = httpServer.address();
        const actualPort = typeof address === "object" && address !== null ? address.port : port;
        resolve({ url: `http://${host}:${actualPort}`, port: actualPort });
      });
    }),
    close: () => new Promise((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve());
      httpServer.closeAllConnections();
    }),
  };
}

async function main(): Promise<void> {
  const config = readServerConfig();
  const context = createGrowthLoopMcpContext(config);
  const server = createGrowthLoopMcpHttpServer(context);
  const { url } = await server.listen(config.MCP_PORT, config.MCP_HOST);
  console.log(`Emotion Content Studio MCP (read-only) listening at ${url}${server.path}`);
  console.log(`repository=${context.repository.mode} aiProvider=${context.agentMode}; tools never call a model.`);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await server.close().catch(() => {});
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
