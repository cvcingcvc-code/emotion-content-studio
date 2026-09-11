import { z } from "zod";
import { EnglishWritingSchema } from "./english-workflow.js";

export const ContentAccountSchema = z.enum(["growth", "english", "emotion"]);
export const CONTENT_ACCOUNT_IDS = { growth: "personal_growth", english: "fun_english", emotion: "emotion_library" } as const;
export const ContentTypeSchema = z.enum(["story", "solution", "reflection", "list", "educational"]);
export const CONTENT_POTENTIAL_THRESHOLD = 6;
export const ExperimentSchema = z.object({
  variable: z.enum(["title", "hook", "actionSteps", "sampleSize"]),
  instruction: z.string().trim().min(1).max(600), keepConstant: z.string().trim().min(1).max(600),
  metric: z.enum(["views", "favoriteRate", "followConversionRate"]),
});
const short = z.string().trim().max(1_000);
export const RetrospectiveInputSchema = z.object({
  date: z.iso.date(),
  whatHappened: z.string().trim().min(1).max(4_000),
  myReaction: short.default(""),
  whatBotheredMe: short.default(""),
  whatCouldBeHandledBetter: short.default(""),
  lessonLearned: short.default(""),
  nextAction: short.default(""),
  optionalNote: short.default(""),
}).strict();
const text = z.string().trim().min(1).max(600);
export const RetrospectiveAnalysisSchema = z.object({
  summary: text, coreProblem: text, decisionPattern: text, betterApproach: text,
  lesson: text, nextAction: text,
  contentPotential: z.number().int().min(0).max(10),
  contentReason: text,
  recommendedAccount: z.enum(["growth", "english", "emotion", "none"]),
  recommendedContentType: ContentTypeSchema,
  contentAngle: text,
  recommendedTitleIdeas: z.array(z.string().min(1).max(80)).length(3),
}).strict();
export const RetrospectiveSchema = RetrospectiveInputSchema.extend({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  analysis: RetrospectiveAnalysisSchema.nullable(),
  analysisProvider: z.enum(["mock", "deepseek"]).nullable(),
});
export const LoopWritingSchema = z.object({
  title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(8_000),
  corePoint: text, solution: text, endingQuestion: text,
  tags: z.array(z.string().trim().startsWith("#").max(40)).min(1).max(10),
}).strict();
export const PublishedContentSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  account: ContentAccountSchema, title: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(1).max(120), contentType: ContentTypeSchema,
  sourceRetrospectiveId: z.string().uuid().nullable(),
  sourceContentId: z.string().uuid().nullable(),
  englishDraftId: z.string().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), publishedAt: z.iso.datetime().nullable(),
  publishTime: z.iso.datetime().nullable(),
  status: z.enum(["draft", "review", "ready", "published"]),
  writing: LoopWritingSchema.nullable(), english: EnglishWritingSchema.nullable(),
  note: z.string().max(2_000),
  provider: z.enum(["mock", "deepseek"]),
  isDemo: z.boolean().default(false),
  experiment: ExperimentSchema.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.status === "published" ? (!value.publishedAt || !value.publishTime) : (value.publishedAt !== null || value.publishTime !== null)) {
    ctx.addIssue({ code: "custom", path: ["publishedAt"], message: "已发布状态必须有发布时间" });
  }
  if (value.status !== "draft" && (value.account === "english" ? !value.english : !value.writing)) {
    ctx.addIssue({ code: "custom", path: ["writing"], message: "生成并审核内容后才能继续" });
  }
});
const count = z.number().int().min(0).max(1_000_000_000);
export const MetricsInputSchema = z.object({
  views: count, likes: count, favorites: count, comments: count, followersGained: count,
  note: z.string().max(2_000).default(""),
}).strict();
export const ContentMetricsSchema = MetricsInputSchema.extend({
  id: z.string().uuid(), contentId: z.string().uuid(), capturedAt: z.iso.datetime(),
});
const rate = z.number().finite().nonnegative().nullable();
export const ContentRatesSchema = z.object({
  likeRate: rate, favoriteRate: rate, commentRate: rate, engagementRate: rate, followConversionRate: rate,
});
export const ComparisonSchema = z.object({
  sampleCount: z.number().int().nonnegative(), rateSampleCount: z.number().int().nonnegative(),
  contentIds: z.array(z.string()), avgViews: rate, avgLikeRate: rate, avgFavoriteRate: rate,
  avgCommentRate: rate, avgFollowConversionRate: rate,
});
export const ComparisonsSchema = z.object({
  recent3: ComparisonSchema, recent7: ComparisonSchema, sameAccount: ComparisonSchema, sameContentType: ComparisonSchema,
});
export const ContentFeedbackSchema = z.object({
  id: z.string().uuid(), contentId: z.string().uuid(), metricsId: z.string().uuid(), createdAt: z.iso.datetime(),
  performanceSummary: text,
  KEEP: z.array(text).min(1).max(3), CHANGE: z.array(text).min(1).max(3),
  NEXT_EXPERIMENT: ExperimentSchema,
  rates: ContentRatesSchema, comparisons: ComparisonsSchema,
}).strict();
export const EffortDirectionSchema = z.object({
  FOCUS_NOW: text, STOP_DOING: z.array(text).min(1).max(3), KEEP_DOING: z.array(text).min(1).max(3),
  NEXT_3_POSTS: z.array(z.object({
    topic: text, account: ContentAccountSchema, contentType: ContentTypeSchema, experiment: ExperimentSchema,
    sourceContentId: z.string().uuid().nullable(),
  })).length(3),
  evidence: text,
});
export const GrowthLoopStateSchema = z.object({
  retrospectives: z.array(RetrospectiveSchema),
  contents: z.array(PublishedContentSchema),
  metrics: z.array(ContentMetricsSchema),
  feedback: z.array(ContentFeedbackSchema),
});
export const GrowthDashboardSchema = z.object({
  today: z.iso.date(), mode: z.enum(["mock", "deepseek"]), repository: z.enum(["memory", "database"]),
  retrospectiveDone: z.boolean(), contentOpportunities: z.number(), readyToPublish: z.number(),
  yesterday: z.object({ count: z.number(), views: z.number(), metricsCount: z.number() }),
  focus: EffortDirectionSchema,
});
export type ContentAccount = z.infer<typeof ContentAccountSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;
export type RetrospectiveInput = z.infer<typeof RetrospectiveInputSchema>;
export type Retrospective = z.infer<typeof RetrospectiveSchema>;
export type RetrospectiveAnalysis = z.infer<typeof RetrospectiveAnalysisSchema>;
export type PublishedContent = z.infer<typeof PublishedContentSchema>;
export type ContentMetrics = z.infer<typeof ContentMetricsSchema>;
export type ContentFeedback = z.infer<typeof ContentFeedbackSchema>;
export type ContentRates = z.infer<typeof ContentRatesSchema>;
export type HistoricalComparison = z.infer<typeof ComparisonSchema>;
export type GrowthLoopState = z.infer<typeof GrowthLoopStateSchema>;
export type EffortDirection = z.infer<typeof EffortDirectionSchema>;
