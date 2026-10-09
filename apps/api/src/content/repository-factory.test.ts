import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readServerConfig } from "../config.js";
import { createGrowthLoopMcpContext } from "../mcp/context.js";
import { createConfiguredRepository } from "./repository-factory.js";
import { buildApp } from "../app.js";

describe("configured durable local repository", { timeout: 15000 }, () => {
  it("shares persisted records with a separately opened MCP context and a restarted API", async () => {
    const root = mkdtempSync(join(tmpdir(), "emotion-configured-sqlite-"));
    const config = readServerConfig({ CONTENT_REPOSITORY: "sqlite", SQLITE_PATH: join(root, "studio.sqlite"), NODE_ENV: "test" });
    const persistence = createConfiguredRepository(config);
    const app = await buildApp({ contentRepository: persistence.repository, contentRepositoryMode: "sqlite", englishWorkflow: { root } });
    let context: ReturnType<typeof createGrowthLoopMcpContext> | undefined;
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/growth-loop/retrospectives", payload: { date: "2026-10-09", whatHappened: "测试复盘记录：先确认范围。" } });
      expect(response.statusCode).toBe(200);
      const created = response.json().data;
      expect((await app.inject("/api/v1/health")).json().data.repository).toBe("sqlite");
      context = createGrowthLoopMcpContext(config);
      expect(context.repository.mode).toBe("sqlite");
      expect((await context.repository.snapshot()).retrospectives).toEqual([created]);
      await context.close(); context = undefined;
      await app.close(); await persistence.close();
      const reopened = createConfiguredRepository(config);
      try { expect((await reopened.repository.growthLoop.snapshot()).retrospectives).toEqual([created]); }
      finally { await reopened.close(); }
    } finally { await context?.close(); await app.close(); await persistence.close(); }
  });
  it("keeps explicit memory mode ephemeral and rejects production memory", async () => {
    const config = readServerConfig({ CONTENT_REPOSITORY: "memory", NODE_ENV: "test" });
    const memory = createConfiguredRepository(config);
    expect(memory.repository.growthLoop.mode).toBe("memory");
    await memory.close();
    expect(() => readServerConfig({ CONTENT_REPOSITORY: "memory", NODE_ENV: "production" })).toThrow();
    expect(readServerConfig({ NODE_ENV: "production" }).CONTENT_REPOSITORY).toBe("sqlite");
  });
});
