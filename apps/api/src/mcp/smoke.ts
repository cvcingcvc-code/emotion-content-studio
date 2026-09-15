import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { GrowthDashboardSchema, RetrospectiveSchema } from "@emotion-studio/contracts";
import { InMemoryGrowthLoopRepository } from "../growth-loop/repository.js";
import { localDate } from "../growth-loop/dashboard.js";
import { seedGrowthLoopDemo } from "../growth-loop/demo.js";
import type { GrowthLoopMcpContext } from "./context.js";
import { createGrowthLoopMcpHttpServer, MCP_HTTP_PATH } from "./http.js";
import { HistoryOutputSchema, OpportunitiesOutputSchema, RetrospectivesOutputSchema } from "./read-models.js";
import { GROWTH_LOOP_TOOL_NAMES } from "./tools.js";

// Real Streamable HTTP MCP server → official MCP client → all four read-only tools.
// Uses an explicitly seeded in-memory repository (demo rows are marked isDemo=true); no model calls.
const repository = new InMemoryGrowthLoopRepository();
const now = new Date().toISOString();
await repository.saveRetrospective(RetrospectiveSchema.parse({
  id: randomUUID(), revision: 0, date: localDate(now),
  whatHappened: "今天没有确认交付范围就开始修改，下午返工。", myReaction: "直接开始", whatBotheredMe: "反复返工",
  whatCouldBeHandledBetter: "先确认交付标准", lessonLearned: "先确认再行动", nextAction: "开始前确认三项标准",
  createdAt: now, updatedAt: now,
  analysis: {
    summary: "未确认范围导致返工", coreProblem: "交付对象和验收标准不清", decisionPattern: "先动手再对齐",
    betterApproach: "开始前列出确认清单", lesson: "先确认再行动", nextAction: "发出三项确认问题",
    contentPotential: 8, contentReason: "真实且通用", recommendedAccount: "growth", recommendedContentType: "solution",
    contentAngle: "从返工经历切入", recommendedTitleIdeas: ["返工之前先确认三件事", "别急着开始", "一次返工换来的清单"],
    facts: ["没有确认交付范围就开始修改"], interpretations: ["担心追问显得不专业"],
  },
  analysisProvider: "mock",
}), null);
await seedGrowthLoopDemo(repository);
const context: GrowthLoopMcpContext = { repository, agentMode: "mock", close: async () => {} };

const server = createGrowthLoopMcpHttpServer(context);
const { url } = await server.listen(0, "127.0.0.1");
const client = new Client({ name: "mcp-smoke", version: "0.0.1" });
try {
  // Cast bridges the SDK's `| undefined` optional properties vs this repo's exactOptionalPropertyTypes.
  await client.connect(new StreamableHTTPClientTransport(new URL(url + MCP_HTTP_PATH)) as unknown as Transport);
  const tools = (await client.listTools()).tools.map(tool => tool.name).sort();
  const expected = [...GROWTH_LOOP_TOOL_NAMES].sort();
  if (JSON.stringify(tools) !== JSON.stringify(expected)) throw new Error(`tools/list mismatch: ${tools.join(",")}`);

  const dashboard = GrowthDashboardSchema.parse((await client.callTool({ name: "get_growth_dashboard", arguments: {} })).structuredContent);
  const retrospectives = RetrospectivesOutputSchema.parse((await client.callTool({ name: "list_retrospectives", arguments: { limit: 5 } })).structuredContent);
  const opportunities = OpportunitiesOutputSchema.parse((await client.callTool({ name: "list_content_opportunities", arguments: {} })).structuredContent);
  const history = HistoryOutputSchema.parse((await client.callTool({ name: "get_growth_history", arguments: {} })).structuredContent);

  console.log(JSON.stringify({
    result: "PASS",
    endpoint: url + MCP_HTTP_PATH,
    tools,
    get_growth_dashboard: { ok: true, repository: dashboard.repository, opportunities: dashboard.contentOpportunities, nextPosts: dashboard.focus.NEXT_3_POSTS.length },
    list_retrospectives: { ok: true, total: retrospectives.total },
    list_content_opportunities: { ok: true, total: opportunities.total, threshold: opportunities.threshold },
    get_growth_history: { ok: true, published: history.contentCount, feedback: history.feedbackCount },
  }, null, 2));
} finally {
  await client.close().catch(() => {});
  await server.close();
  await context.close();
}
