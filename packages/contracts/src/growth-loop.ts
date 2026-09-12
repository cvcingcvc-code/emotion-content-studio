import { z } from "zod";
import { EnglishWritingSchema } from "./english-workflow.js";

export const ContentAccountSchema = z.enum(["growth", "english", "emotion"]);
export const CONTENT_ACCOUNT_IDS = { growth: "personal_growth", english: "fun_english", emotion: "emotion_library" } as const;
export const ContentTypeSchema = z.enum(["story", "solution", "reflection", "list", "educational"]);
export const CONTENT_POTENTIAL_THRESHOLD = 6;
export const ConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const ExperimentVariableSchema = z.enum(["title_style", "hook", "actionSteps", "sampleSize"]);
/** variant 是机器可读的变量取值，Generator 依据它真实改变产出。 */
export const ExperimentVariantSchema = z.enum(["question", "statement", "scene_first", "three_steps", "fixed_window"]);
export const ExperimentStatusSchema = z.enum(["proposed", "running", "evaluating", "completed"]);
export const ExperimentOutcomeSchema = z.enum(["promote_to_strategy", "continue_testing", "reject"]);
export const ExperimentTargetMetricSchema = z.enum(["views", "favoriteRate", "followConversionRate"]);
export const EXPERIMENT_VARIANTS_BY_VARIABLE = {
  title_style: ["question", "statement"],
  hook: ["scene_first"],
  actionSteps: ["three_steps"],
  sampleSize: ["fixed_window"],
} as const;
export const ExperimentSchema = z.object({
  id: z.string().uuid(),
  hypothesis: z.string().trim().min(1).max(400),
  variable: ExperimentVariableSchema,
  variant: ExperimentVariantSchema,
  baseline: z.string().trim().min(1).max(300),
  targetMetric: ExperimentTargetMetricSchema,
  requiredSamples: z.number().int().min(1).max(50),
  currentSamples: z.number().int().nonnegative(),
  status: ExperimentStatusSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  result: z.string().trim().max(400).nullable(),
  confidence: ConfidenceSchema,
  instruction: z.string().trim().min(1).max(600),
  keepConstant: z.string().trim().min(1).max(600),
}).strict();
const short = z.string().trim().max(1_000);
export const StrategyCategorySchema = z.enum(["works", "avoid", "testing", "watch", "unknown"]);
export const StrategyStatusSchema = z.enum(["active", "inactive", "superseded"]);
export const StrategySourceSchema = z.enum(["experiment", "human_edit", "reject", "metrics", "manual"]);
export const StrategyEntrySchema = z.object({
  id: z.string().uuid(),
  account: ContentAccountSchema,
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(300),
  category: StrategyCategorySchema,
  source: StrategySourceSchema,
  evidenceCount: z.number().int().nonnegative(),
  confidence: ConfidenceSchema,
  status: StrategyStatusSchema,
  lastConfirmedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
}).strict();
const meta = z.string().trim().max(24);
export const RetrospectiveInputSchema = z.object({
  date: z.iso.date(),
  whatHappened: z.string().trim().min(1).max(4_000),
  myReaction: short.default(""),
  whatBotheredMe: short.default(""),
  whatCouldBeHandledBetter: short.default(""),
  lessonLearned: short.default(""),
  nextAction: short.default(""),
  optionalNote: short.default(""),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).optional(),
  emotion: meta.optional(),
  eventType: meta.optional(),
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
  facts: z.array(text).min(1).max(8),
  interpretations: z.array(text).min(1).max(8),
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
export const RejectReasonSchema = z.enum(["not_me", "too_dramatic", "too_preachy", "factually_wrong", "bad_title", "no_value", "private_topic", "other"]);
export const PreferenceSignalSchema = z.object({
  titleRewritten: z.boolean(),
  removedPhrases: z.array(z.string().max(60)).max(20),
  addedPhrases: z.array(z.string().max(60)).max(20),
  lowerIntensity: z.boolean(),
  removedDrama: z.boolean(),
  perspectiveShift: z.boolean(),
  summary: z.string().trim().min(1).max(400),
}).strict();
export const FeedbackVerdictSchema = z.enum(["KEEP", "WATCH", "CHANGE", "NEXT_EXPERIMENT", "INSUFFICIENT_EVIDENCE"]);
/**
 * 送入下一轮生成的 feedback 学习条目。
 * 每条都可追踪：来自哪条 feedback、哪篇内容、哪个实验，避免不同内容的反馈串错。
 */
export const FeedbackUsedSchema = z.object({
  feedbackId: z.string().uuid(),
  contentId: z.string().uuid(),
  source: z.literal("feedback"),
  verdict: FeedbackVerdictSchema,
  confidence: ConfidenceSchema,
  createdAt: z.iso.datetime(),
  experimentId: z.string().uuid().nullable(),
  text: z.string().max(300),
}).strict();
export const GenerationDebugSchema = z.object({
  promptVersion: z.string().trim().min(1).max(80),
  provider: z.enum(["mock", "deepseek"]),
  model: z.string().trim().max(80).nullable(),
  factsUsed: z.array(z.string().max(300)).max(8),
  interpretationsUsed: z.array(z.string().max(600)).max(8),
  strategyUsed: z.array(z.string().max(300)).max(30),
  experimentUsed: z.string().max(200).nullable(),
  userPreferenceUsed: z.array(z.string().max(300)).max(30),
  feedbackUsed: z.array(FeedbackUsedSchema).max(10).default([]),
  constraintsApplied: z.array(z.string().max(160)).max(30),
  finalGenerationContext: z.string().max(4_000),
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
  status: z.enum(["draft", "review", "ready", "published", "rejected"]),
  writing: LoopWritingSchema.nullable(), english: EnglishWritingSchema.nullable(),
  aiDraft: LoopWritingSchema.nullable().default(null),
  preferenceSignal: PreferenceSignalSchema.nullable().default(null),
  rejectReason: RejectReasonSchema.nullable().default(null),
  rejectedAt: z.iso.datetime().nullable().default(null),
  note: z.string().max(2_000),
  provider: z.enum(["mock", "deepseek"]),
  isDemo: z.boolean().default(false),
  experiment: ExperimentSchema.nullable().default(null),
  debug: GenerationDebugSchema.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.status === "published" ? (!value.publishedAt || !value.publishTime) : (value.publishedAt !== null || value.publishTime !== null)) {
    ctx.addIssue({ code: "custom", path: ["publishedAt"], message: "已发布状态必须有发布时间" });
  }
  if (!["draft", "rejected"].includes(value.status) && (value.account === "english" ? !value.english : !value.writing)) {
    ctx.addIssue({ code: "custom", path: ["writing"], message: "生成并审核内容后才能继续" });
  }
  if (value.status === "rejected" && !value.rejectedAt) {
    ctx.addIssue({ code: "custom", path: ["rejectedAt"], message: "已拒绝状态必须有拒绝时间" });
  }
});
const count = z.number().int().min(0).max(1_000_000_000);
export const MetricsInputSchema = z.object({
  views: count, likes: count, favorites: count, comments: count, followersGained: count,
  note: z.string().max(2_000).default(""),
}).strict();
export const ContentMetricsSchema = MetricsInputSchema.extend({
  id: z.string().uuid(), contentId: z.string().uuid(), capturedAt: z.iso.datetime(),
  hoursSincePublish: z.number().finite().nonnegative().nullable().default(null),
});
const rate = z.number().finite().nonnegative().nullable();
/** 相对表现 = (当前 - 基线) / 基线，低于基线时为负，因此不能复用带 nonnegative 的 rate。 */
const relativeRate = z.number().finite().nullable();
export const ContentRatesSchema = z.object({
  likeRate: rate, favoriteRate: rate, commentRate: rate, engagementRate: rate, followConversionRate: rate,
});
/** 相对表现：当前篇 vs 同窗口基线的 median。样本不足时不假装有结论。 */
export const RelativePerformanceSchema = z.object({
  bucket: z.enum(["24h", "72h", "later", "unknown"]),
  sampleCount: z.number().int().nonnegative(),
  medianViews: rate, medianLikes: rate, medianFavorites: rate, medianComments: rate,
  relativeViews: relativeRate, relativeLikes: relativeRate, relativeSaves: relativeRate, relativeComments: relativeRate,
  comparable: z.boolean(),
}).strict();
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
  observation: text, hypothesis: text, evidence: text,
  confidence: ConfidenceSchema, verdict: FeedbackVerdictSchema,
  hoursSincePublish: z.number().finite().nonnegative().nullable(),
  relative: RelativePerformanceSchema,
  KEEP: z.array(text).max(3), WATCH: z.array(text).max(3), CHANGE: z.array(text).max(3),
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
  strategies: z.array(StrategyEntrySchema),
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
export type MetricsInput = z.infer<typeof MetricsInputSchema>;
export type ContentFeedback = z.infer<typeof ContentFeedbackSchema>;
export type ContentRates = z.infer<typeof ContentRatesSchema>;
export type HistoricalComparison = z.infer<typeof ComparisonSchema>;
export type GrowthLoopState = z.infer<typeof GrowthLoopStateSchema>;
export type EffortDirection = z.infer<typeof EffortDirectionSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;
export type ExperimentVariable = z.infer<typeof ExperimentVariableSchema>;
export type ExperimentVariant = z.infer<typeof ExperimentVariantSchema>;
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;
export type ExperimentOutcome = z.infer<typeof ExperimentOutcomeSchema>;
export type GenerationDebug = z.infer<typeof GenerationDebugSchema>;
export type FeedbackVerdict = z.infer<typeof FeedbackVerdictSchema>;
export type FeedbackUsed = z.infer<typeof FeedbackUsedSchema>;
export type RelativePerformance = z.infer<typeof RelativePerformanceSchema>;
export type RejectReason = z.infer<typeof RejectReasonSchema>;
export type PreferenceSignal = z.infer<typeof PreferenceSignalSchema>;
export type StrategyCategory = z.infer<typeof StrategyCategorySchema>;
export type StrategySource = z.infer<typeof StrategySourceSchema>;
export type StrategyEntry = z.infer<typeof StrategyEntrySchema>;
