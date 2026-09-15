import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppError } from "../errors.js";
import type { GrowthLoopMcpContext } from "./context.js";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getGrowthDashboard,
  getGrowthHistory,
  listContentOpportunities,
  listRetrospectives,
} from "./read-models.js";

export const GROWTH_LOOP_TOOL_NAMES = [
  "get_growth_dashboard",
  "list_retrospectives",
  "list_content_opportunities",
  "get_growth_history",
] as const;

export type GrowthLoopToolName = (typeof GROWTH_LOOP_TOOL_NAMES)[number];

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const dateSchema = z.iso.date().describe("ISO date (YYYY-MM-DD)");
const limitSchema = z.number().int().min(1).max(MAX_LIMIT).optional()
  .describe(`Maximum number of records to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`);

type ToolResult =
  | { content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown> }
  | { content: Array<{ type: "text"; text: string }>; isError: true };

function toolResult(value: object): ToolResult {
  const data = { ...value } as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

/**
 * Domain errors keep their safe code/message. Anything else (database errors,
 * programming errors) becomes a generic message so stack traces, connection
 * strings, filesystem paths and environment values never reach the client.
 */
function toolError(error: unknown): ToolResult {
  if (!(error instanceof AppError)) {
    console.error("[mcp] tool call failed:", error instanceof Error ? error.name : "UnknownError");
  }
  const payload = error instanceof AppError
    ? { ok: false, error: { code: error.code, message: error.message } }
    : { ok: false, error: { code: "INTERNAL_ERROR", message: "读取 Growth Loop 数据失败，请稍后重试" } };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true };
}

export function registerGrowthLoopTools(server: McpServer, context: GrowthLoopMcpContext): void {
  server.registerTool("get_growth_dashboard", {
    title: "Growth Loop dashboard",
    description:
      "Read the current Emotion Content Studio Growth Loop dashboard. Returns: today's retrospective status (retrospectiveDone), " +
      "the number of analyzed content opportunities, ready-to-publish drafts, yesterday's published count / views / metrics count, " +
      "and the current effort direction (FOCUS_NOW, STOP_DOING, KEEP_DOING, NEXT_3_POSTS with the proposed experiment). " +
      "Use this first when the user asks for an overview of their growth loop or what to focus on today. Read-only; " +
      "it returns the same projection as the web dashboard.",
    annotations: READ_ONLY,
  }, async () => {
    try { return toolResult(await getGrowthDashboard(context)); }
    catch (error) { return toolError(error); }
  });

  server.registerTool("list_retrospectives", {
    title: "List retrospectives",
    description:
      "List the user's daily retrospectives (真实经历复盘). Each record includes id, date, whatHappened, myReaction, " +
      "whatBotheredMe, whatCouldBeHandledBetter, lessonLearned, nextAction, optionalNote, tags, emotion, eventType, " +
      "and the analysis when present (contentPotential 0-10, coreProblem, decisionPattern, betterApproach, lesson, " +
      "contentAngle, recommendedAccount, recommendedContentType, recommendedTitleIdeas, facts, interpretations). " +
      "Filter by an exact date or a date range; results are newest first. Use when the user asks what happened recently, " +
      "what they recorded, or which experiences might be worth turning into content. Read-only.",
    inputSchema: { limit: limitSchema, date: dateSchema.optional(), startDate: dateSchema.optional(), endDate: dateSchema.optional() },
    annotations: READ_ONLY,
  }, async (args) => {
    try {
      return toolResult(await listRetrospectives(context, {
        limit: args.limit ?? DEFAULT_LIMIT,
        date: args.date,
        startDate: args.startDate,
        endDate: args.endDate,
      }));
    } catch (error) { return toolError(error); }
  });

  server.registerTool("list_content_opportunities", {
    title: "List content opportunities",
    description:
      "List the content opportunities already identified by the Growth Loop: retrospectives whose analysis.contentPotential " +
      "reached the project threshold, ordered by content potential (highest first). Each opportunity contains the full " +
      "retrospective (id, date, whatHappened, analysis with coreProblem, contentAngle, recommendedTitleIdeas, " +
      "recommendedAccount, recommendedContentType) plus linkedContents: the growth content already created from it " +
      "(id, title, account, contentType, status, publishedAt, isDemo). Use when the user asks which recent real experiences " +
      "are most worth making content from. Read-only; it reuses the existing opportunity threshold and does not invent new scoring.",
    inputSchema: { limit: limitSchema },
    annotations: READ_ONLY,
  }, async (args) => {
    try { return toolResult(await listContentOpportunities(context, { limit: args.limit ?? DEFAULT_LIMIT })); }
    catch (error) { return toolError(error); }
  });

  server.registerTool("get_growth_history", {
    title: "Get growth history and performance learning",
    description:
      "Read the published-content history with its performance learning. For each published post: the content record, latest " +
      "metrics, computed rates, relative performance versus the same-account same-window baseline, and historical comparisons " +
      "(recent3, recent7, sameAccount, sameContentType). Also returns stored feedback verdicts (KEEP, WATCH, CHANGE, " +
      "NEXT_EXPERIMENT with the KEEP/CHANGE recommendations and the next experiment), the strategy memory, and the recommended " +
      "focus (FOCUS_NOW, STOP_DOING, KEEP_DOING, NEXT_3_POSTS). Use when the user asks which posts performed best, whether " +
      "performance improved, what to KEEP or CHANGE, or what to try next. Read-only; it reuses the existing human-confirmed " +
      "analysis and does not invent new strategy or causal claims.",
    inputSchema: { limit: limitSchema },
    annotations: READ_ONLY,
  }, async (args) => {
    try { return toolResult(await getGrowthHistory(context, { limit: args.limit ?? DEFAULT_LIMIT })); }
    catch (error) { return toolError(error); }
  });
}
