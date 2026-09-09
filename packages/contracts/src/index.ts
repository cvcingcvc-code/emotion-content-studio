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

export const AccountIdSchema = z.enum([
  "personal_growth",
  "fun_english",
  "emotion_library",
]);

export const ContentSourceTypeSchema = z.enum([
  "manual",
  "daily_review",
  "english_topic",
  "external_emotion_source",
  "idea",
  "legacy_import",
]);

export const ContentLaneSchema = z.enum([
  "growth_review",
  "growth_story",
  "problem_solution",
  "english_50",
  "emotion_material",
  "emotion_post",
]);

export const AccountProfileSchema = z
  .object({
    id: AccountIdSchema,
    displayName: z.string().trim().min(1).max(60),
    shortName: z.string().trim().min(1).max(20),
    description: z.string().trim().min(1).max(240),
    primaryLane: ContentLaneSchema,
  })
  .strict();

export const AccountProfileListSchema = z.array(AccountProfileSchema).length(3);

export const ACCOUNT_PROFILES = AccountProfileListSchema.parse([
  {
    id: "personal_growth",
    displayName: "Personal Growth",
    shortName: "成长复盘",
    description: "真实成长、工作选择与可执行的问题复盘。",
    primaryLane: "growth_review",
  },
  {
    id: "fun_english",
    displayName: "Fun English",
    shortName: "趣味英语",
    description: "把一个生活主题拆成真正能使用的英语 50 句。",
    primaryLane: "english_50",
  },
  {
    id: "emotion_library",
    displayName: "Emotion Library",
    shortName: "情绪素材",
    description: "追踪来源、理解共鸣主题并完成原创转换。",
    primaryLane: "emotion_material",
  },
]);

export const AnalysisKindSchema = z.enum(["growth.v1", "emotion.v1"]);
export const RelationshipTypeSchema = z.enum([
  "romantic",
  "family",
  "friendship",
  "self",
  "work",
  "social",
  "other",
]);

export const TruthAnchorKindSchema = z.enum([
  "event",
  "person",
  "dialogue",
  "amount",
  "time",
  "result",
  "emotion",
  "action",
  "context",
]);

export const TruthAnchorSchema = z
  .object({
    id: z.string().regex(/^anchor-[1-9]\d*$/),
    kind: TruthAnchorKindSchema,
    quote: z.string().trim().min(1).max(500),
  })
  .strict();

export const GroundedTextSchema = z
  .object({
    text: z.string().trim().min(1).max(1_200),
    anchorIds: z.array(z.string().regex(/^anchor-[1-9]\d*$/)).min(1).max(12),
  })
  .strict();

export const ForbiddenInventionSchema = z.enum([
  "person",
  "dialogue",
  "amount",
  "time",
  "result",
  "experience",
]);

const forbiddenInventions = [
  "person",
  "dialogue",
  "amount",
  "time",
  "result",
  "experience",
] as const;

export const GrowthAnalysisSchema = z
  .object({
    kind: z.literal("growth.v1"),
    truthAnchors: z.array(TruthAnchorSchema).min(1).max(12),
    coreEvent: GroundedTextSchema.nullable(),
    coreConflict: GroundedTextSchema,
    emotions: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(40),
            intensity: z.number().int().min(0).max(100),
            evidenceAnchorIds: z.array(z.string()).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    rootProblem: GroundedTextSchema,
    audiencePain: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
    universalResonance: z.string().trim().min(1).max(600),
    turningPoint: GroundedTextSchema.nullable(),
    solution: GroundedTextSchema.nullable(),
    actionableAdvice: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
    titleAngles: z.array(z.string().trim().min(1).max(80)).min(3).max(6),
    riskFlags: z.array(z.string().trim().min(1).max(120)).max(8),
    forbiddenInventions: z.array(ForbiddenInventionSchema).length(6),
    missingInformation: z.array(z.string().trim().min(1).max(200)).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    const anchorIds = new Set(value.truthAnchors.map((anchor) => anchor.id));
    if (anchorIds.size !== value.truthAnchors.length) {
      context.addIssue({ code: "custom", path: ["truthAnchors"], message: "事实锚点 ID 不能重复" });
    }
    const grounded = [value.coreEvent, value.coreConflict, value.rootProblem, value.turningPoint, value.solution]
      .filter((item): item is z.infer<typeof GroundedTextSchema> => item !== null);
    const usedIds = [
      ...grounded.flatMap((item) => item.anchorIds),
      ...value.emotions.flatMap((emotion) => emotion.evidenceAnchorIds),
    ];
    if (usedIds.some((id) => !anchorIds.has(id))) {
      context.addIssue({ code: "custom", path: ["truthAnchors"], message: "分析引用了未知事实锚点" });
    }
    if (new Set(value.forbiddenInventions).size !== forbiddenInventions.length ||
      forbiddenInventions.some((item) => !value.forbiddenInventions.includes(item))) {
      context.addIssue({ code: "custom", path: ["forbiddenInventions"], message: "禁编造清单必须完整" });
    }
  });

export const OriginalityRiskSchema = z
  .object({
    level: z.enum(["low", "medium", "high"]),
    similarityScore: z.number().int().min(0).max(100),
    reasons: z.array(z.string().trim().min(1).max(200)).max(8),
    requiresHumanReview: z.literal(true),
  })
  .strict();

export const VisualRecommendationKindSchema = z.enum(["real_photo", "screenshot", "text_card", "ai_image"]);
export const VisualRecommendationSchema = z.object({
  kind: VisualRecommendationKindSchema,
  count: z.number().int().min(1).max(10),
  description: z.string().trim().min(1).max(300),
}).strict();

export const EmotionAnalysisSchema = z
  .object({
    kind: z.literal("emotion.v1"),
    primaryEmotion: ContentEmotionSchema,
    secondaryEmotion: ContentEmotionSchema.nullable(),
    emotionIntensity: z.number().int().min(0).max(100),
    scene: z.string().trim().min(1).max(120),
    relationshipType: RelationshipTypeSchema,
    painPoint: z.string().trim().min(1).max(400),
    psychologicalConflict: z.string().trim().min(1).max(500),
    resonanceReason: z.string().trim().min(1).max(500),
    keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
    reusableTheme: z.string().trim().min(1).max(120),
    recommendedContentAngles: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
    originalityRisk: OriginalityRiskSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.secondaryEmotion === value.primaryEmotion) {
      context.addIssue({ code: "custom", path: ["secondaryEmotion"], message: "次要情绪不能与主要情绪相同" });
    }
    if (new Set(value.keywords).size !== value.keywords.length) {
      context.addIssue({ code: "custom", path: ["keywords"], message: "关键词不能重复" });
    }
  });

export const StudioAnalysisSchema = z.discriminatedUnion("kind", [
  GrowthAnalysisSchema,
  EmotionAnalysisSchema,
]);

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

const httpUrlSchema = z
  .string()
  .max(2_048)
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "来源链接必须使用 http 或 https",
  });

const accountLaneMatrix: Record<z.infer<typeof AccountIdSchema>, ReadonlySet<z.infer<typeof ContentLaneSchema>>> = {
  personal_growth: new Set(["growth_review", "growth_story", "problem_solution"]),
  fun_english: new Set(["english_50"]),
  emotion_library: new Set(["emotion_material", "emotion_post"]),
};

export const ContentItemSchema = z
  .object({
    id: z.string().min(1),
    accountId: AccountIdSchema,
    sourceType: ContentSourceTypeSchema,
    contentLane: ContentLaneSchema,
    originalContent: z.string().max(12_000),
    content: z.string().min(1).max(12_000),
    author: z.string().min(1).max(100).nullable(),
    likes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    source: z.string().min(1).max(200),
    sourcePlatform: z.string().trim().min(1).max(100).nullable(),
    sourceUrl: httpUrlSchema.nullable(),
    licenseStatus: LicenseStatusSchema,
    emotion: ContentEmotionSchema.nullable(),
    emotionScore: z.number().int().min(0).max(100).nullable(),
    resonanceScore: z.number().int().min(0).max(100).nullable(),
    category: ContentCategorySchema.nullable(),
    tags: z.array(z.string().min(1).max(40)).max(10),
    scene: z.string().trim().min(1).max(120).nullable(),
    relationshipType: RelationshipTypeSchema.nullable(),
    theme: z.string().trim().min(1).max(120).nullable(),
    analysisKind: AnalysisKindSchema.nullable(),
    analysis: StudioAnalysisSchema.nullable(),
    analysisProvider: AiProviderSchema.nullable(),
    analysisModel: z.string().trim().min(1).max(100).nullable(),
    analyzedAt: z.string().datetime({ offset: true }).nullable(),
    isFavorite: z.boolean(),
    isPublished: z.boolean(),
    collectedAt: z.string().datetime({ offset: true }).nullable(),
    importedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (!accountLaneMatrix[value.accountId].has(value.contentLane)) {
      context.addIssue({ code: "custom", path: ["contentLane"], message: "内容赛道与账号不匹配" });
    }
    if ((value.analysisKind === null) !== (value.analysis === null)) {
      context.addIssue({ code: "custom", path: ["analysis"], message: "分析类型与分析内容必须同时存在" });
    }
    if (value.analysis && value.analysis.kind !== value.analysisKind) {
      context.addIssue({ code: "custom", path: ["analysisKind"], message: "分析类型不匹配" });
    }
    if (value.analysis && ((value.accountId === "personal_growth" && value.analysis.kind !== "growth.v1") ||
      (value.accountId === "emotion_library" && value.analysis.kind !== "emotion.v1") || value.accountId === "fun_english")) {
      context.addIssue({ code: "custom", path: ["analysis"], message: "分析必须来自对应账号流程" });
    }
  });

export const ContentItemListSchema = z.array(ContentItemSchema);

export const ContentItemQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  accountId: AccountIdSchema.optional(),
  sourceType: ContentSourceTypeSchema.optional(),
  contentLane: ContentLaneSchema.optional(),
  emotion: ContentEmotionSchema.optional(),
  category: ContentCategorySchema.optional(),
  scene: z.string().trim().max(120).optional(),
  relationship: RelationshipTypeSchema.optional(),
  theme: z.string().trim().max(120).optional(),
  favorite: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  published: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
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

export const StudioDemoSeedResultSchema = z.object({
  loadedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  byAccount: z.object({
    personal_growth: z.number().int().nonnegative(),
    fun_english: z.number().int().nonnegative(),
    emotion_library: z.number().int().nonnegative(),
  }).strict(),
}).strict();

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

export const RegenerateSectionSchema = z.enum(["title", "hook", "body", "ending", "tags"]);
export const RegenerateContentInputSchema = z.object({
  section: RegenerateSectionSchema,
}).strict();
export const ReviewGeneratedContentInputSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  title: z.string().trim().min(1).max(80).optional(),
  body: z.string().trim().min(1).max(8_000).optional(),
  hashtags: z.array(z.string().trim().startsWith("#").max(40)).min(1).max(10).optional(),
}).strict();

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

const postPackageFields = {
  titles: z.array(z.string().trim().min(1).max(80)).length(3),
  recommendedTitle: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(8_000),
  hashtags: z.array(z.string().trim().startsWith("#").max(40)).min(1).max(10),
  hook: z.string().trim().min(1).max(300).optional(),
  endingQuestion: z.string().trim().min(1).max(300).optional(),
};

export const GrowthPostPackageSchema = z.object({
  kind: z.literal("growth_post.v1"),
  ...postPackageFields,
  usedTruthAnchorIds: z.array(z.string().regex(/^anchor-[1-9]\d*$/)).min(1).max(12),
  factClaims: z.array(z.object({
    claim: z.string().trim().min(1).max(1_200),
    truthAnchorIds: z.array(z.string()).min(1).max(12),
  }).strict()).min(1).max(20),
  story: z.string().trim().min(1).max(2_000).optional(),
  problemBreakdown: z.string().trim().min(1).max(1_200).optional(),
  solution: z.string().trim().min(1).max(1_200).optional(),
  visualSuggestions: z.array(VisualRecommendationSchema).min(1).max(8).optional(),
}).strict().refine((value) => value.titles.includes(value.recommendedTitle), {
  path: ["recommendedTitle"], message: "推荐标题必须来自候选标题",
});

export const EnglishSentenceSchema = z.object({
  english: z.string().trim().min(1).max(300).regex(/[a-z]/i),
  chinese: z.string().trim().min(1).max(300).regex(/[\u3400-\u9fff]/),
  usageNote: z.string().trim().min(1).max(300).optional(),
}).strict();

export const English50PackageSchema = z.object({
  kind: z.literal("english_50.v1"),
  ...postPackageFields,
  topic: z.string().trim().min(1).max(120),
  audience: z.string().trim().min(1).max(300),
  positioning: z.string().trim().min(1).max(500),
  groups: z.array(z.object({
    groupName: z.string().trim().min(1).max(80),
    sentences: z.array(EnglishSentenceSchema).length(10),
  }).strict()).length(5),
  fivePageLayout: z.array(z.object({
    pageNumber: z.number().int().min(1).max(5),
    groupNumber: z.number().int().min(1).max(5),
    headline: z.string().trim().min(1).max(120),
    visualSuggestion: z.string().trim().min(1).max(300),
  }).strict()).length(5),
  visualSuggestions: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
}).strict().superRefine((value, context) => {
  if (!value.titles.includes(value.recommendedTitle)) {
    context.addIssue({ code: "custom", path: ["recommendedTitle"], message: "推荐标题必须来自候选标题" });
  }
  const sentences = value.groups.flatMap((group) => group.sentences.map((sentence) =>
    sentence.english.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "")));
  if (new Set(sentences).size !== 50 || new Set(value.groups.map((group) => group.groupName)).size !== 5) {
    context.addIssue({ code: "custom", path: ["groups"], message: "必须有五个不同分组和五十条不重复英文" });
  }
  if (value.fivePageLayout.some((page, index) => page.pageNumber !== index + 1 || page.groupNumber !== index + 1)) {
    context.addIssue({ code: "custom", path: ["fivePageLayout"], message: "五页必须依次对应五个分组" });
  }
});

export const EmotionPostPackageSchema = z.object({
  kind: z.literal("emotion_post.v1"),
  ...postPackageFields,
  themes: z.array(z.string().trim().min(1).max(120)).min(1).max(5),
  originalityRisk: OriginalityRiskSchema,
  goldenQuotes: z.array(z.string().trim().min(1).max(240)).min(1).max(6).optional(),
  visualSuggestions: z.array(VisualRecommendationSchema).min(1).max(8).optional(),
}).strict().refine((value) => value.titles.includes(value.recommendedTitle), {
  path: ["recommendedTitle"], message: "推荐标题必须来自候选标题",
});

export const StudioOutputSchema = z.discriminatedUnion("kind", [
  GrowthPostPackageSchema, English50PackageSchema, EmotionPostPackageSchema,
]);
export const OutputKindSchema = z.enum(["growth_post.v1", "english_50.v1", "emotion_post.v1", "legacy.v1"]);
export const PublishabilitySchema = z.enum(["eligible", "research_only", "needs_rewrite"]);

export const GeneratedContentSchema = z.object({
  id: z.string().min(1),
  accountId: AccountIdSchema,
  contentLane: ContentLaneSchema,
  outputKind: OutputKindSchema,
  output: StudioOutputSchema.nullable(),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(8_000),
  hashtags: z.array(z.string().trim().startsWith("#").max(40)).min(1).max(10),
  status: DraftStatusSchema,
  confirmedAt: z.string().datetime({ offset: true }).nullable(),
  publishability: PublishabilitySchema,
  reviewIssues: z.array(z.string().min(1).max(300)).max(20),
  generatorLabel: GeneratorLabelSchema,
  provider: AiProviderSchema,
  model: z.string().trim().min(1).max(100),
  contentIds: z.array(z.string().min(1)).min(1).max(5),
  promptVersion: z.string().trim().min(1).max(80).optional(),
  reviewDecision: z.enum(["accepted", "rejected"]).nullable().optional(),
  humanEditedOutput: z.object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(8_000),
    hashtags: z.array(z.string().trim().startsWith("#").max(40)).min(1).max(10),
  }).strict().nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (!accountLaneMatrix[value.accountId].has(value.contentLane)) {
    context.addIssue({ code: "custom", path: ["contentLane"], message: "账号与生成赛道不匹配" });
  }
  const expected = { personal_growth: "growth_post.v1", fun_english: "english_50.v1", emotion_library: "emotion_post.v1" };
  if (value.outputKind === "legacy.v1") {
    if (value.output !== null || value.accountId !== "emotion_library" || value.body.length < 200 || value.body.length > 400) {
      context.addIssue({ code: "custom", path: ["output"], message: "旧版生成稿格式无效" });
    }
  } else if (!value.output || value.output.kind !== value.outputKind || value.outputKind !== expected[value.accountId]) {
    context.addIssue({ code: "custom", path: ["output"], message: "生成包必须与账号和输出类型匹配" });
  }
  if ((value.status === "confirmed") !== (value.confirmedAt !== null)) {
    context.addIssue({ code: "custom", path: ["confirmedAt"], message: "人工确认状态与时间必须一致" });
  }
});

export const GeneratedContentListSchema = z.array(GeneratedContentSchema);

export const CreateContentInputSchema = z.object({
  accountId: AccountIdSchema,
  sourceType: ContentSourceTypeSchema.exclude(["legacy_import"]),
  contentLane: ContentLaneSchema,
  content: z.string().min(1).max(12_000).refine((value) => value.trim().length > 0, "内容不能为空"),
  licenseStatus: LicenseStatusSchema,
  sourcePlatform: z.string().trim().min(1).max(100).nullable().default(null),
  sourceUrl: httpUrlSchema.nullable().default(null),
  sourceAuthor: z.string().trim().min(1).max(100).nullable().default(null),
  sourceAuthorAuthorized: z.boolean().default(false),
  collectedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (!accountLaneMatrix[value.accountId].has(value.contentLane)) {
    context.addIssue({ code: "custom", path: ["contentLane"], message: "内容赛道与账号不匹配" });
  }
  const sources = {
    personal_growth: ["manual", "daily_review", "idea"],
    fun_english: ["english_topic"],
    emotion_library: ["manual", "external_emotion_source", "idea"],
  };
  if (!sources[value.accountId].includes(value.sourceType)) {
    context.addIssue({ code: "custom", path: ["sourceType"], message: "来源类型与账号不匹配" });
  }
  if (value.accountId === "fun_english" && value.content.length > 120) {
    context.addIssue({ code: "custom", path: ["content"], message: "英语主题最多 120 字" });
  }
  if (value.sourceType === "external_emotion_source" && !value.sourcePlatform) {
    context.addIssue({ code: "custom", path: ["sourcePlatform"], message: "外部素材需填写来源平台" });
  }
  if (value.sourceAuthor && (!value.sourceAuthorAuthorized || value.licenseStatus !== "licensed")) {
    context.addIssue({ code: "custom", path: ["sourceAuthor"], message: "仅明确许可且允许记录署名时保存来源作者" });
  }
});

export const PerformanceSchema = z.object({
  views: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  likes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  favorites: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  comments: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  shares: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  follows: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  metricsCapturedAt: z.string().datetime({ offset: true }).nullable(),
}).strict().refine((value) => value.metricsCapturedAt !== null ||
  [value.views, value.likes, value.favorites, value.comments, value.shares, value.follows].every((metric) => metric === null), {
  path: ["metricsCapturedAt"], message: "填写表现数据时必须记录采集时间",
});

export const PostStatusSchema = z.enum(["draft", "published"]);
export const PostRecordSchema = z.object({
  id: z.string().min(1),
  accountId: AccountIdSchema,
  contentId: z.string().min(1),
  generatedContentId: z.string().min(1),
  status: PostStatusSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  titleUsed: z.string().trim().min(1).max(80),
  bodyUsed: z.string().trim().min(1).max(8_000),
  hashtagsUsed: z.array(z.string().startsWith("#").max(40)).min(1).max(10),
  contentLane: ContentLaneSchema,
  coverType: z.string().trim().min(1).max(100).nullable(),
  performance: PerformanceSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().refine((value) => (value.status === "published") === (value.publishedAt !== null), {
  path: ["publishedAt"], message: "发布状态与发布时间必须一致",
});
export const PostRecordListSchema = z.array(PostRecordSchema);

export const SavePostInputSchema = z.object({
  generatedContentId: z.string().min(1).max(100),
  humanConfirmed: z.literal(true),
  status: PostStatusSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  titleUsed: z.string().trim().min(1).max(80),
  bodyUsed: z.string().trim().min(1).max(8_000),
  hashtagsUsed: z.array(z.string().startsWith("#").max(40)).min(1).max(10),
  coverType: z.string().trim().min(1).max(100).nullable(),
}).strict().refine((value) => (value.status === "published") === (value.publishedAt !== null), {
  path: ["publishedAt"], message: "发布状态与发布时间必须一致",
});

export const PerformanceSummarySchema = z.object({
  publishedCount: z.number().int().nonnegative(),
  totalViews: z.number().nonnegative().nullable(),
  averageLikeRate: z.number().nonnegative().nullable(),
  averageFavoriteRate: z.number().nonnegative().nullable(),
  averageCommentRate: z.number().nonnegative().nullable(),
  sampleCount: z.number().int().nonnegative(),
  insufficientSample: z.boolean(),
}).strict();
export const AccountDashboardSchema = z.object({
  accountId: AccountIdSchema,
  materialCount: z.number().int().nonnegative(),
  favoriteCount: z.number().int().nonnegative(),
  emotionDistribution: z.array(ContentDistributionSchema),
  themeDistribution: z.array(ContentDistributionSchema),
  performance: PerformanceSummarySchema,
  lanes: z.array(z.object({ contentLane: ContentLaneSchema, performance: PerformanceSummarySchema }).strict()),
}).strict();
export const StudioDashboardSchema = z.array(AccountDashboardSchema).length(3);

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
export type AccountId = z.infer<typeof AccountIdSchema>;
export type AccountProfile = z.infer<typeof AccountProfileSchema>;
export type ContentSourceType = z.infer<typeof ContentSourceTypeSchema>;
export type ContentLane = z.infer<typeof ContentLaneSchema>;
export type TruthAnchor = z.infer<typeof TruthAnchorSchema>;
export type TruthAnchorKind = z.infer<typeof TruthAnchorKindSchema>;
export type GrowthAnalysis = z.infer<typeof GrowthAnalysisSchema>;
export type EmotionAnalysis = z.infer<typeof EmotionAnalysisSchema>;
export type StudioAnalysis = z.infer<typeof StudioAnalysisSchema>;
export type OriginalityRisk = z.infer<typeof OriginalityRiskSchema>;
export type VisualRecommendation = z.infer<typeof VisualRecommendationSchema>;
export type GrowthPostPackage = z.infer<typeof GrowthPostPackageSchema>;
export type English50Package = z.infer<typeof English50PackageSchema>;
export type EmotionPostPackage = z.infer<typeof EmotionPostPackageSchema>;
export type StudioOutput = z.infer<typeof StudioOutputSchema>;
export type CreateContentInput = z.infer<typeof CreateContentInputSchema>;
export type Performance = z.infer<typeof PerformanceSchema>;
export type PostRecord = z.infer<typeof PostRecordSchema>;
export type SavePostInput = z.infer<typeof SavePostInputSchema>;
export type PerformanceSummary = z.infer<typeof PerformanceSummarySchema>;
export type AccountDashboard = z.infer<typeof AccountDashboardSchema>;
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;
export type DemoLicenseStatus = z.infer<typeof DemoLicenseStatusSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type ContentItemQuery = z.infer<typeof ContentItemQuerySchema>;
export type SetFavoriteInput = z.infer<typeof SetFavoriteInputSchema>;
export type CsvImportInput = z.infer<typeof CsvImportInputSchema>;
export type CsvImportError = z.infer<typeof CsvImportErrorSchema>;
export type CsvImportSummary = z.infer<typeof CsvImportSummarySchema>;
export type DemoDataLoadResult = z.infer<typeof DemoDataLoadResultSchema>;
export type StudioDemoSeedResult = z.infer<typeof StudioDemoSeedResultSchema>;
export type ContentDistribution = z.infer<typeof ContentDistributionSchema>;
export type ContentDashboard = z.infer<typeof ContentDashboardSchema>;
export type GenerateContentInput = z.infer<typeof GenerateContentInputSchema>;
export type RegenerateContentInput = z.infer<typeof RegenerateContentInputSchema>;
export type ReviewGeneratedContentInput = z.infer<typeof ReviewGeneratedContentInputSchema>;
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
