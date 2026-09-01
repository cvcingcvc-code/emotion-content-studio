import { z } from "zod";

export const LicenseStatusSchema = z.enum([
  "original",
  "licensed",
  "reference_only",
  "prohibited",
]);

export const ReviewStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "needs_edit",
  "reference_only",
]);

export const RiskLevelSchema = z.enum(["low", "medium", "high", "blocked"]);

export const FilterFlagSchema = z.enum([
  "duplicate",
  "birthday",
  "fandom",
  "advertising",
  "privacy",
  "copyright_like",
  "long_copy",
]);

export const SourceTypeSchema = z.enum([
  "original_note",
  "licensed_submission",
  "reference_material",
]);

export const PlatformSchema = z.enum([
  "xiaohongshu",
  "wechat_channels",
  "instagram_reels",
]);

export const MaterialSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  sourceType: SourceTypeSchema,
  sourceUrl: z.string().url().nullable(),
  licenseStatus: LicenseStatusSchema,
  reviewStatus: ReviewStatusSchema,
  filterFlags: z.array(FilterFlagSchema),
  riskLevel: RiskLevelSchema,
  theme: z.string().min(1),
  scenario: z.string().min(1),
  importedAt: z.string().datetime({ offset: true }),
});

export const InspirationSchema = z.object({
  id: z.string().min(1),
  materialId: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  theme: z.string().min(1),
  scenario: z.string().min(1),
  platforms: z.array(PlatformSchema).min(1),
  favorite: z.boolean(),
  score: z.number().int().min(0).max(100),
  licenseStatus: LicenseStatusSchema,
  updatedAt: z.string().datetime({ offset: true }),
});

export const DraftStatusSchema = z.enum(["draft", "confirmed", "rejected"]);
export const SafetyStatusSchema = z.enum(["safe", "needs_review", "blocked"]);
export const ToneSchema = z.enum(["restrained", "gentle", "clear"]);

export const DraftSchema = z.object({
  id: z.string().min(1),
  inspirationId: z.string().min(1),
  version: z.number().int().positive(),
  text: z.string().min(1),
  tone: ToneSchema,
  targetPlatform: PlatformSchema,
  similarityRisk: z.number().int().min(0).max(100),
  safetyStatus: SafetyStatusSchema,
  status: DraftStatusSchema,
  generatedBy: z.enum(["ai", "user"]),
  createdAt: z.string().datetime({ offset: true }),
  confirmedAt: z.string().datetime({ offset: true }).nullable(),
});

export const TemplateKeySchema = z.enum([
  "blank_subtitle",
  "cinematic_monologue",
  "night_mood",
]);

export const VideoProjectStatusSchema = z.enum([
  "draft",
  "preview_ready",
  "exporting",
  "exported",
  "failed",
  "blocked",
]);

export const VideoProjectSchema = z.object({
  id: z.string().min(1),
  draftId: z.string().min(1),
  title: z.string().min(1),
  templateKey: TemplateKeySchema,
  templateName: z.string().min(1),
  status: VideoProjectStatusSchema,
  durationSeconds: z.number().int().min(1).max(60),
  licenseStatus: LicenseStatusSchema,
  config: z.object({
    alignment: z.enum(["left", "center"]),
    palette: z.enum(["warm_white", "soft_gray", "deep_ink"]),
    pace: z.enum(["slow", "standard"]),
  }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const ExportStatusSchema = z.enum(["succeeded", "processing", "failed"]);

export const ExportRecordSchema = z.object({
  id: z.string().min(1),
  videoProjectId: z.string().min(1),
  title: z.string().min(1),
  templateKey: TemplateKeySchema,
  templateName: z.string().min(1),
  status: ExportStatusSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  errorMessage: z.string().max(300).nullable(),
  downloadable: z.boolean(),
});

export const DashboardSchema = z.object({
  metrics: z.object({
    pendingReview: z.number().int().nonnegative(),
    inspirations: z.number().int().nonnegative(),
    drafts: z.number().int().nonnegative(),
    exports: z.number().int().nonnegative(),
    targetExports: z.number().int().positive(),
  }),
  recentInspirations: z.array(InspirationSchema),
  alerts: z.array(
    z.object({
      id: z.string().min(1),
      tone: z.enum(["neutral", "warning", "danger"]),
      title: z.string().min(1),
      detail: z.string().min(1),
      href: z.string().startsWith("/"),
    }),
  ),
});

export const ReviewInboxSchema = z.object({
  items: z.array(MaterialSchema),
  counts: z.object({
    pending: z.number().int().nonnegative(),
    highRisk: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    privacy: z.number().int().nonnegative(),
  }),
});

export const MaterialQuerySchema = z.object({
  reviewStatus: ReviewStatusSchema.optional(),
  riskLevel: RiskLevelSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

export const ContentEmotionSchema = z.enum([
  "开心",
  "难过",
  "遗憾",
  "孤独",
  "爱情",
  "治愈",
  "愤怒",
  "其他",
]);

export const ContentCategorySchema = z.enum([
  "爱情",
  "友情",
  "家庭",
  "成长",
  "孤独",
  "生活",
  "其他",
]);

export const AiProviderSchema = z.enum(["mock", "deepseek"]);

export const ContentAnalysisSchema = z
  .object({
    emotion: ContentEmotionSchema,
    emotionScore: z.number().int().min(0).max(100),
    resonanceScore: z.number().int().min(0).max(100),
    category: ContentCategorySchema,
    tags: z.array(z.string().trim().min(1).max(40)).max(8),
  })
  .strict();

export const DemoLicenseStatusSchema = z.enum(["original", "licensed"]);

export const ContentItemSchema = z.object({
  id: z.string().min(1),
  originalContent: z.string().max(4_000),
  content: z.string().min(1).max(4_000),
  author: z.string().min(1).max(100).nullable(),
  likes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  source: z.string().min(1).max(200),
  sourceUrl: z
    .string()
    .max(2_048)
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "来源链接必须使用 http 或 https",
    })
    .nullable(),
  licenseStatus: LicenseStatusSchema,
  emotion: ContentEmotionSchema,
  emotionScore: z.number().int().min(0).max(100),
  resonanceScore: z.number().int().min(0).max(100),
  category: ContentCategorySchema,
  tags: z.array(z.string().min(1).max(40)).max(8),
  isFavorite: z.boolean(),
  importedAt: z.string().datetime({ offset: true }),
});

export const ContentItemListSchema = z.array(ContentItemSchema);

export const ContentItemQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  emotion: ContentEmotionSchema.optional(),
  category: ContentCategorySchema.optional(),
  sort: z.enum(["resonance_desc", "likes_desc", "newest"]).optional().default("newest"),
  highResonance: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .default(false),
});

export const SetFavoriteInputSchema = z.object({
  favorite: z.boolean(),
});

export const CsvImportInputSchema = z.object({
  csvText: z.string().min(1).max(2_000_000),
  licenseStatus: DemoLicenseStatusSchema,
  sourceName: z.string().trim().min(1).max(100).optional(),
});

export const CsvImportErrorSchema = z.object({
  row: z.number().int().min(2),
  message: z.string().min(1).max(200),
});

export const CsvImportSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  importedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  errors: z.array(CsvImportErrorSchema),
});

export const DemoDataLoadResultSchema = z.object({
  loadedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});

export const ContentDistributionSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const ContentDashboardSchema = z.object({
  todayCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  highResonanceCount: z.number().int().nonnegative(),
  favoriteCount: z.number().int().nonnegative(),
  emotionDistribution: z.array(ContentDistributionSchema),
  categoryDistribution: z.array(ContentDistributionSchema),
});

export const GenerateContentInputSchema = z.object({
  contentIds: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length, "素材不能重复选择"),
});

export const GeneratedDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(200).max(400),
    hashtags: z
      .array(z.string().trim().startsWith("#").max(40))
      .min(1)
      .max(8),
  })
  .strict();

export const GeneratorLabelSchema = z.enum([
  "DEMO AI 生成结果",
  "AI 生成草稿",
]);

export const GeneratedContentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  body: z.string().min(200).max(400),
  hashtags: z.array(z.string().trim().startsWith("#").max(40)).min(1).max(8),
  status: z.literal("draft"),
  generatorLabel: GeneratorLabelSchema,
  provider: AiProviderSchema,
  model: z.string().trim().min(1).max(100),
  contentIds: z.array(z.string().min(1)).min(1).max(5),
  createdAt: z.string().datetime({ offset: true }),
});

export const ReviewMaterialInputSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "needs_edit", "reference_only"]),
    reason: z.string().trim().max(300).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision !== "approved" && !value.reason) {
      context.addIssue({
        code: "custom",
        message: "非通过决定必须填写原因",
        path: ["reason"],
      });
    }
  });

export const ConfirmDraftInputSchema = z.object({
  humanConfirmed: z.literal(true),
  text: z.string().trim().min(1).max(1_200).optional(),
});

export const CreateVideoProjectInputSchema = z.object({
  templateKey: TemplateKeySchema.optional().default("blank_subtitle"),
});

export const SimulateExportInputSchema = z.object({
  acknowledgedRights: z.literal(true),
  templateKey: TemplateKeySchema.optional(),
  config: z
    .object({
      alignment: z.enum(["left", "center"]),
      palette: z.enum(["warm_white", "soft_gray", "deep_ink"]),
      pace: z.enum(["slow", "standard"]),
    })
    .optional(),
});

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
  requestId: z.string().min(1),
});

export function createSuccessResponseSchema<TSchema extends z.ZodType>(data: TSchema) {
  return z.object({
    ok: z.literal(true),
    data,
    requestId: z.string().min(1),
    meta: z
      .object({
        total: z.number().int().nonnegative().optional(),
      })
      .optional(),
  });
}

export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type FilterFlag = z.infer<typeof FilterFlagSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type Tone = z.infer<typeof ToneSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Inspiration = z.infer<typeof InspirationSchema>;
export type Draft = z.infer<typeof DraftSchema>;
export type TemplateKey = z.infer<typeof TemplateKeySchema>;
export type VideoProject = z.infer<typeof VideoProjectSchema>;
export type ExportRecord = z.infer<typeof ExportRecordSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type ReviewInbox = z.infer<typeof ReviewInboxSchema>;
export type MaterialQuery = z.infer<typeof MaterialQuerySchema>;
export type ContentEmotion = z.infer<typeof ContentEmotionSchema>;
export type ContentCategory = z.infer<typeof ContentCategorySchema>;
export type AiProvider = z.infer<typeof AiProviderSchema>;
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;
export type DemoLicenseStatus = z.infer<typeof DemoLicenseStatusSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type ContentItemQuery = z.infer<typeof ContentItemQuerySchema>;
export type SetFavoriteInput = z.infer<typeof SetFavoriteInputSchema>;
export type CsvImportInput = z.infer<typeof CsvImportInputSchema>;
export type CsvImportError = z.infer<typeof CsvImportErrorSchema>;
export type CsvImportSummary = z.infer<typeof CsvImportSummarySchema>;
export type DemoDataLoadResult = z.infer<typeof DemoDataLoadResultSchema>;
export type ContentDistribution = z.infer<typeof ContentDistributionSchema>;
export type ContentDashboard = z.infer<typeof ContentDashboardSchema>;
export type GenerateContentInput = z.infer<typeof GenerateContentInputSchema>;
export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;
export type GeneratorLabel = z.infer<typeof GeneratorLabelSchema>;
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;
export type ReviewMaterialInput = z.infer<typeof ReviewMaterialInputSchema>;
export type ConfirmDraftInput = z.infer<typeof ConfirmDraftInputSchema>;
export type CreateVideoProjectInput = z.infer<typeof CreateVideoProjectInputSchema>;
export type SimulateExportInput = z.infer<typeof SimulateExportInputSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ContractSchema<T> = z.ZodType<T>;

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
  meta?: { total?: number };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
