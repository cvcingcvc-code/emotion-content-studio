import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ContentFeedbackSchema,
  GrowthDashboardSchema,
  PublishedContentSchema,
  RetrospectiveSchema,
  type RetrospectiveAnalysis,
} from "@emotion-studio/contracts";
import { readServerConfig } from "../config.js";
import { InMemoryGrowthLoopRepository } from "../growth-loop/repository.js";
import { localDate } from "../growth-loop/dashboard.js";
import { seedGrowthLoopDemo } from "../growth-loop/demo.js";
import { createGrowthLoopMcpContext, type GrowthLoopMcpContext } from "./context.js";
import { createGrowthLoopMcpHttpServer, MCP_HTTP_PATH } from "./http.js";
import { listRetrospectives, RetrospectivesOutputSchema, OpportunitiesOutputSchema, HistoryOutputSchema } from "./read-models.js";
import { createGrowthLoopMcpServer } from "./server.js";
import { GROWTH_LOOP_TOOL_NAMES } from "./tools.js";

const analysis = (overrides: Partial<RetrospectiveAnalysis> = {}): RetrospectiveAnalysis => ({
  summary: "交付前没有确认范围，下午返工。",
  coreProblem: "接到任务后直接开始，交付对象和验收标准不清楚。",
  decisionPattern: "怕拖慢进度，先动手再对齐。",
  betterApproach: "开始前确认使用对象、交付格式和验收标准。",
  lesson: "先确认范围，再投入时间。",
  nextAction: "把三项确认问题发给对方，收到回复后再开始。",
  contentPotential: 8,
  contentReason: "真实经历，且很多创作者会遇到同样的返工问题。",
  recommendedAccount: "growth",
  recommendedContentType: "solution",
  contentAngle: "从一次返工经历切入，给出三项确认清单。",
  recommendedTitleIdeas: ["返工之前先确认三件事", "别急着开始：先确认交付标准", "一次返工换来的确认清单"],
  facts: ["没有确认交付范围就开始修改材料"],
  interpretations: ["可能是担心追问会显得自己不专业"],
  ...overrides,
});

function retrospective(id: string, overrides: Partial<Parameters<typeof RetrospectiveSchema.parse>[0]> = {}) {
  const now = new Date().toISOString();
  return RetrospectiveSchema.parse({
    id,
    revision: 0,
    date: localDate(now),
    whatHappened: "今天接到材料修改任务，没有确认交付范围就开始做，下午返工。",
    myReaction: "直接开始修改",
    whatBotheredMe: "反复返工浪费时间",
    whatCouldBeHandledBetter: "先确认交付标准",
    lessonLearned: "先确认再行动",
    nextAction: "开始前确认三项标准",
    createdAt: now,
    updatedAt: now,
    analysis: analysis(),
    analysisProvider: "mock",
    ...overrides,
  });
}

async function seededContext(): Promise<{ context: GrowthLoopMcpContext; repository: InMemoryGrowthLoopRepository; retrospectiveId: string }> {
  const repository = new InMemoryGrowthLoopRepository();
  const retrospectiveId = randomUUID();
  const yesterday = localDate(new Date(Date.now() - 86_400_000).toISOString());
  await repository.saveRetrospective(retrospective(retrospectiveId), null);
  await repository.saveRetrospective(retrospective(randomUUID(), { date: yesterday, analysis: null, analysisProvider: null }), null);
  await seedGrowthLoopDemo(repository);
  return {
    repository,
    retrospectiveId,
    context: { repository, agentMode: "mock", close: async () => {} },
  };
}

async function connectClient(context: GrowthLoopMcpContext) {
  const server = createGrowthLoopMcpServer(context);
  const client = new Client({ name: "mcp-test-client", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

// e2e MCP protocol tests; generous timeout to absorb machine load, not assertion regressions.
describe("growth loop MCP server", { timeout: 30_000 }, () => {
  const clients: Array<Pick<Client, "close">> = [];
  afterEach(async () => { for (const client of clients.splice(0)) await client.close().catch(() => {}); });

  it("initializes and exposes exactly the four read-only tools via tools/list", async () => {
    const { context } = await seededContext();
    const { client } = await connectClient(context);
    clients.push(client);
    const tools = (await client.listTools()).tools;
    expect(tools.map(tool => tool.name).sort()).toEqual([...GROWTH_LOOP_TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description && tool.description.length).toBeGreaterThan(80);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).not.toBe(true);
    }
    const withParameters = tools.filter(tool => tool.name !== "get_growth_dashboard");
    expect(withParameters).toHaveLength(3);
    for (const tool of withParameters) {
      const schema = tool.inputSchema as { type?: string; properties?: Record<string, unknown> };
      expect(schema.type).toBe("object");
      expect(schema.properties?.limit).toBeDefined();
    }
  });

  it("get_growth_dashboard returns a valid GrowthDashboard structure", async () => {
    const { context } = await seededContext();
    const { client } = await connectClient(context);
    clients.push(client);
    const result = await client.callTool({ name: "get_growth_dashboard", arguments: {} });
    expect(result.isError ?? false).toBe(false);
    const parsed = GrowthDashboardSchema.parse(result.structuredContent);
    expect(parsed.repository).toBe("memory");
    expect(parsed.retrospectiveDone).toBe(true);
    expect(parsed.contentOpportunities).toBeGreaterThanOrEqual(1);
    expect(parsed.focus.NEXT_3_POSTS).toHaveLength(3);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("list_retrospectives returns valid records, newest first, with limit and date filters", async () => {
    const { context, retrospectiveId } = await seededContext();
    const { client } = await connectClient(context);
    clients.push(client);
    const result = await client.callTool({ name: "list_retrospectives", arguments: { limit: 1 } });
    expect(result.isError ?? false).toBe(false);
    const parsed = RetrospectivesOutputSchema.parse(result.structuredContent);
    expect(parsed.total).toBe(2);
    expect(parsed.count).toBe(1);
    expect(parsed.retrospectives[0]?.id).toBe(retrospectiveId);
    expect(parsed.retrospectives[0]?.whatHappened.length).toBeGreaterThan(0);
    const filtered = await client.callTool({ name: "list_retrospectives", arguments: { date: "1999-01-01" } });
    expect(RetrospectivesOutputSchema.parse(filtered.structuredContent).total).toBe(0);
  });

  it("list_content_opportunities returns analyzed opportunities with linked content", async () => {
    const { context, retrospectiveId } = await seededContext();
    const { client } = await connectClient(context);
    clients.push(client);
    const result = await client.callTool({ name: "list_content_opportunities", arguments: {} });
    expect(result.isError ?? false).toBe(false);
    const parsed = OpportunitiesOutputSchema.parse(result.structuredContent);
    expect(parsed.threshold).toBe(6);
    expect(parsed.total).toBe(1);
    const opportunity = parsed.opportunities[0]!;
    expect(opportunity.retrospective.id).toBe(retrospectiveId);
    expect(opportunity.retrospective.analysis?.coreProblem).toBeTruthy();
    expect(opportunity.retrospective.analysis?.contentAngle).toBeTruthy();
    expect(Array.isArray(opportunity.linkedContents)).toBe(true);
  });

  it("get_growth_history returns published content, metrics, comparisons and KEEP/CHANGE/NEXT feedback", async () => {
    const { context } = await seededContext();
    const { client } = await connectClient(context);
    clients.push(client);
    const result = await client.callTool({ name: "get_growth_history", arguments: {} });
    expect(result.isError ?? false).toBe(false);
    const parsed = HistoryOutputSchema.parse(result.structuredContent);
    expect(parsed.contentCount).toBe(7);
    expect(parsed.feedbackCount).toBe(7);
    expect(parsed.published).toHaveLength(7);
    for (const item of parsed.published) {
      expect(PublishedContentSchema.parse(item.content).status).toBe("published");
      expect(item.latestMetric).not.toBeNull();
      expect(item.rates).not.toBeNull();
      expect(item.relative).not.toBeNull();
      expect(item.comparisons?.recent3).toBeDefined();
      expect(item.content.isDemo).toBe(true);
    }
    for (const feedback of parsed.feedback) {
      ContentFeedbackSchema.parse(feedback);
      expect(feedback.NEXT_EXPERIMENT).toBeDefined();
      expect(["KEEP", "WATCH", "CHANGE", "NEXT_EXPERIMENT", "INSUFFICIENT_EVIDENCE"]).toContain(feedback.verdict);
    }
    expect(parsed.focus.KEEP_DOING.length).toBeGreaterThan(0);
    expect(parsed.focus.NEXT_3_POSTS).toHaveLength(3);
  });

  it("exposes no destructive, shell, filesystem or SQL tools", async () => {
    const { context } = await seededContext();
    const { client } = await connectClient(context);
    clients.push(client);
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(4);
    const forbidden = /(delete|remove|create|update|write|edit|publish|record|execute|exec|shell|command|terminal|file|filesystem|path|sql|query|eval|http|fetch|request)/i;
    for (const tool of tools) {
      expect(tool.name).not.toMatch(forbidden);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).not.toBe(true);
      expect(tool.annotations?.openWorldHint).not.toBe(true);
    }
  });

  it("never returns API keys, secrets, tokens, passwords, env values or filesystem paths", async () => {
    const secrets = {
      DEEPSEEK_API_KEY: "sk-mcp-secret-do-not-leak",
      DATABASE_URL: "postgresql://user:password-do-not-leak@127.0.0.1:5432/emotion_studio",
    };
    const previousKey = process.env.DEEPSEEK_API_KEY;
    const previousUrl = process.env.DATABASE_URL;
    Object.assign(process.env, secrets);
    try {
      const { context } = await seededContext();
      const { client } = await connectClient(context);
      clients.push(client);
      const results = [];
      for (const name of GROWTH_LOOP_TOOL_NAMES) results.push(await client.callTool({ name, arguments: {} }));
      const serialized = JSON.stringify(results);
      for (const value of Object.values(secrets)) expect(serialized).not.toContain(value);
      expect(serialized).not.toMatch(/API_KEY|SECRET|TOKEN|PASSWORD/i);
      expect(serialized).not.toContain(process.cwd());
      expect(serialized).not.toMatch(/[A-Za-z]:\\[\\/]/);
    } finally {
      if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
      if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    }
  });

  it("does not silently fall back to demo data: empty memory stays empty, database failure is a clean error", async () => {
    const repository = new InMemoryGrowthLoopRepository();
    const context: GrowthLoopMcpContext = { repository, agentMode: "mock", close: async () => {} };
    const { client } = await connectClient(context);
    clients.push(client);
    const dashboard = GrowthDashboardSchema.parse((await client.callTool({ name: "get_growth_dashboard", arguments: {} })).structuredContent);
    expect(dashboard.repository).toBe("memory");
    expect(dashboard.contentOpportunities).toBe(0);
    expect((await client.callTool({ name: "list_retrospectives", arguments: {} })).structuredContent).toMatchObject({ total: 0 });
    expect((await client.callTool({ name: "list_content_opportunities", arguments: {} })).structuredContent).toMatchObject({ total: 0 });
    expect((await client.callTool({ name: "get_growth_history", arguments: {} })).structuredContent).toMatchObject({ contentCount: 0, feedbackCount: 0 });

    expect(() => readServerConfig({ NODE_ENV: "production", CONTENT_REPOSITORY: "memory" })).toThrow();
    const databaseConfig = readServerConfig({
      ...process.env,
      CONTENT_REPOSITORY: "database",
      DATABASE_URL: "postgresql://user:password-do-not-leak@127.0.0.1:1/emotion_studio",
    });
    const databaseContext = createGrowthLoopMcpContext(databaseConfig);
    await expect(listRetrospectives(databaseContext, { limit: 5 })).rejects.toThrow();
    const brokenClient = await connectClient(databaseContext);
    clients.push(brokenClient.client);
    const broken = await brokenClient.client.callTool({ name: "list_retrospectives", arguments: {} });
    expect(broken.isError).toBe(true);
    expect(JSON.stringify(broken)).not.toContain("password-do-not-leak");
    expect(JSON.stringify(broken)).not.toContain("127.0.0.1:1");
    await databaseContext.close();
  });

  it("serves the same tools over Streamable HTTP at the /mcp endpoint", async () => {
    const { context } = await seededContext();
    const server = createGrowthLoopMcpHttpServer(context);
    const { url } = await server.listen(0, "127.0.0.1");
    try {
      const health = await fetch(url + "/health");
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true, mode: "read-only", repository: "memory", endpoint: MCP_HTTP_PATH });
      const client = new Client({ name: "mcp-http-test", version: "0.0.1" });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(url + MCP_HTTP_PATH)));
      expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual([...GROWTH_LOOP_TOOL_NAMES].sort());
      const result = await client.callTool({ name: "get_growth_dashboard", arguments: {} });
      expect(result.isError ?? false).toBe(false);
      expect(GrowthDashboardSchema.parse(result.structuredContent).repository).toBe("memory");
      expect((await fetch(url + "/other")).status).toBe(404);
    } finally {
      for (const client of clients.splice(0)) await client.close().catch(() => {});
      await server.close();
      await context.close();
    }
  });
});
