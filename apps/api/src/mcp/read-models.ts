import { z } from "zod";
import {
  CONTENT_POTENTIAL_THRESHOLD,
  ComparisonsSchema,
  ContentAccountSchema,
  ContentFeedbackSchema,
  ContentMetricsSchema,
  ContentRatesSchema,
  ContentTypeSchema,
  EffortDirectionSchema,
  GrowthDashboardSchema,
  PublishedContentSchema,
  RelativePerformanceSchema,
  RetrospectiveSchema,
  StrategyEntrySchema,
  type GrowthLoopState,
  type PublishedContent,
} from "@emotion-studio/contracts";
import type { GrowthLoopMcpContext } from "./context.js";
import { dashboard } from "../growth-loop/dashboard.js";
import { recommendEffortDirection } from "../growth-loop/feedback.js";
import { calculateRates, historicalComparison, latestMetrics, relativePerformance } from "../growth-loop/metrics.js";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Projection of an existing PublishedContent; fields mirror the contract, no new domain concepts. */
export const LinkedContentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  account: ContentAccountSchema,
  contentType: ContentTypeSchema,
  status: z.enum(["draft", "review", "ready", "published", "rejected"]),
  publishedAt: z.iso.datetime().nullable(),
  isDemo: z.boolean(),
}).strict();

export const DashboardOutputSchema = GrowthDashboardSchema;

export const RetrospectivesOutputSchema = z.object({
  total: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  retrospectives: z.array(RetrospectiveSchema),
}).strict();

export const OpportunitiesOutputSchema = z.object({
  threshold: z.number().int().min(0).max(10),
  total: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  opportunities: z.array(z.object({
    retrospective: RetrospectiveSchema,
    linkedContents: z.array(LinkedContentSchema),
  }).strict()),
}).strict();

export const HistoryItemSchema = z.object({
  content: PublishedContentSchema,
  latestMetric: ContentMetricsSchema.nullable(),
  rates: ContentRatesSchema.nullable(),
  relative: RelativePerformanceSchema.nullable(),
  comparisons: ComparisonsSchema.nullable(),
}).strict();

export const HistoryOutputSchema = z.object({
  generatedAt: z.iso.datetime(),
  contentCount: z.number().int().nonnegative(),
  feedbackCount: z.number().int().nonnegative(),
  published: z.array(HistoryItemSchema),
  feedback: z.array(ContentFeedbackSchema),
  strategies: z.array(StrategyEntrySchema),
  focus: EffortDirectionSchema,
}).strict();

export type DashboardOutput = z.infer<typeof DashboardOutputSchema>;
export type RetrospectivesOutput = z.infer<typeof RetrospectivesOutputSchema>;
export type OpportunitiesOutput = z.infer<typeof OpportunitiesOutputSchema>;
export type HistoryOutput = z.infer<typeof HistoryOutputSchema>;

export interface ListRetrospectivesInput {
  limit: number;
  date?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export interface LimitInput {
  limit: number;
}

/** Same projection the API Dashboard route uses: dashboard(state, agent mode, repository mode). */
export async function getGrowthDashboard(context: GrowthLoopMcpContext): Promise<DashboardOutput> {
  const state = await context.repository.snapshot();
  return DashboardOutputSchema.parse(dashboard(state, context.agentMode, context.repository.mode));
}

const byDateDesc = (left: { date: string; createdAt: string; id: string }, right: { date: string; createdAt: string; id: string }) =>
  right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);

export async function listRetrospectives(context: GrowthLoopMcpContext, input: ListRetrospectivesInput): Promise<RetrospectivesOutput> {
  const state = await context.repository.snapshot();
  const filtered = state.retrospectives.filter(item => {
    if (input.date !== undefined && item.date !== input.date) return false;
    if (input.startDate !== undefined && item.date < input.startDate) return false;
    if (input.endDate !== undefined && item.date > input.endDate) return false;
    return true;
  });
  const retrospectives = [...filtered].sort(byDateDesc).slice(0, input.limit);
  return RetrospectivesOutputSchema.parse({ total: filtered.length, count: retrospectives.length, retrospectives });
}

function linkedContents(state: GrowthLoopState): Map<string, Array<z.infer<typeof LinkedContentSchema>>> {
  const grouped = new Map<string, Array<z.infer<typeof LinkedContentSchema>>>();
  for (const content of state.contents) {
    if (!content.sourceRetrospectiveId) continue;
    const entry: z.infer<typeof LinkedContentSchema> = {
      id: content.id,
      title: content.title,
      account: content.account,
      contentType: content.contentType,
      status: content.status,
      publishedAt: content.publishedAt,
      isDemo: content.isDemo,
    };
    const list = grouped.get(content.sourceRetrospectiveId);
    if (list) list.push(entry); else grouped.set(content.sourceRetrospectiveId, [entry]);
  }
  return grouped;
}

/**
 * Content opportunities are exactly what the existing Dashboard counts:
 * retrospectives whose analysis reached CONTENT_POTENTIAL_THRESHOLD.
 * No separate opportunity model or scoring is introduced.
 */
export async function listContentOpportunities(context: GrowthLoopMcpContext, input: LimitInput): Promise<OpportunitiesOutput> {
  const state = await context.repository.snapshot();
  const linked = linkedContents(state);
  const candidates = state.retrospectives
    .filter(item => (item.analysis?.contentPotential ?? 0) >= CONTENT_POTENTIAL_THRESHOLD)
    .sort((left, right) => (right.analysis?.contentPotential ?? 0) - (left.analysis?.contentPotential ?? 0) || byDateDesc(left, right));
  const opportunities = candidates.slice(0, input.limit).map(retrospective => ({
    retrospective,
    linkedContents: linked.get(retrospective.id) ?? [],
  }));
  return OpportunitiesOutputSchema.parse({
    threshold: CONTENT_POTENTIAL_THRESHOLD,
    total: candidates.length,
    count: opportunities.length,
    opportunities,
  });
}

const publishedSort = (left: PublishedContent, right: PublishedContent) =>
  (right.publishedAt ?? right.createdAt).localeCompare(left.publishedAt ?? left.createdAt) || right.id.localeCompare(left.id);

/**
 * Growth history reuses the existing comparison pipeline for every published post:
 * latestMetrics → calculateRates → relativePerformance → historicalComparison,
 * plus the stored ContentFeedback verdicts (KEEP / CHANGE / NEXT_EXPERIMENT) and
 * the same effort direction the dashboard shows. Demo rows stay isolated because
 * the existing metrics helpers already compare isDemo with isDemo only.
 */
export async function getGrowthHistory(context: GrowthLoopMcpContext, input: LimitInput): Promise<HistoryOutput> {
  const state = await context.repository.snapshot();
  const metrics = latestMetrics(state);
  const published = state.contents
    .filter(item => item.status === "published")
    .sort(publishedSort)
    .slice(0, input.limit);
  const items = published.map(content => {
    const metric = metrics.get(content.id) ?? null;
    return {
      content,
      latestMetric: metric,
      rates: metric ? calculateRates(metric) : null,
      relative: metric ? relativePerformance(content, metric, state) : null,
      comparisons: metric ? historicalComparison(content, metric, state) : null,
    };
  });
  const publishedIds = new Set(published.map(item => item.id));
  const feedback = state.feedback
    .filter(item => publishedIds.has(item.contentId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  return HistoryOutputSchema.parse({
    generatedAt: new Date().toISOString(),
    contentCount: published.length,
    feedbackCount: feedback.length,
    published: items,
    feedback,
    strategies: state.strategies,
    focus: recommendEffortDirection(state),
  });
}
