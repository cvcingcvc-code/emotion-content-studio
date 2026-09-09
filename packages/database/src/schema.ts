import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const licenseStatusEnum = pgEnum("license_status", [
  "original",
  "licensed",
  "reference_only",
  "prohibited",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
  "needs_edit",
  "reference_only",
]);

export const draftStatusEnum = pgEnum("draft_status", ["draft", "confirmed", "rejected"]);

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "preview_ready",
  "exporting",
  "exported",
  "failed",
  "blocked",
]);

export const exportStatusEnum = pgEnum("export_status", [
  "succeeded",
  "processing",
  "failed",
]);

export const contentSourceTypeEnum = pgEnum("content_source_type", [
  "manual",
  "daily_review",
  "english_topic",
  "external_emotion_source",
  "idea",
  "legacy_import",
]);

export const contentLaneEnum = pgEnum("content_lane", [
  "growth_review",
  "growth_story",
  "problem_solution",
  "english_50",
  "emotion_material",
  "emotion_post",
]);

export const analysisKindEnum = pgEnum("analysis_kind", ["growth.v1", "emotion.v1"]);

export const generatedOutputKindEnum = pgEnum("generated_output_kind", [
  "growth_post.v1",
  "english_50.v1",
  "emotion_post.v1",
  "legacy.v1",
]);

export const publishabilityEnum = pgEnum("publishability", [
  "eligible",
  "research_only",
  "needs_rewrite",
]);

export const postStatusEnum = pgEnum("post_status", ["draft", "published"]);

const createTimestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    shortName: text("short_name").notNull(),
    description: text("description").notNull(),
    primaryLane: contentLaneEnum("primary_lane").notNull(),
    sortOrder: integer("sort_order").notNull(),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("accounts_sort_order_unique").on(table.sortOrder),
    check(
      "accounts_id_allowed",
      sql`${table.id} IN ('personal_growth', 'fun_english', 'emotion_library')`,
    ),
    check("accounts_sort_order_positive", sql`${table.sortOrder} > 0`),
    check(
      "accounts_primary_lane_match",
      sql`(
        (${table.id} = 'personal_growth' AND ${table.primaryLane} = 'growth_review') OR
        (${table.id} = 'fun_english' AND ${table.primaryLane} = 'english_50') OR
        (${table.id} = 'emotion_library' AND ${table.primaryLane} = 'emotion_material')
      )`,
    ),
  ],
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    licenseStatus: licenseStatusEnum("license_status").notNull(),
    status: text("status").notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    rejectedRows: integer("rejected_rows").notNull().default(0),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    ...createTimestamps(),
  },
  (table) => [uniqueIndex("imports_file_hash_unique").on(table.fileHash)],
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    originalText: text("original_text").notNull(),
    normalizedHash: text("normalized_hash").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    licenseStatus: licenseStatusEnum("license_status").notNull(),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("pending"),
    riskLevel: text("risk_level").notNull().default("low"),
    filterFlags: jsonb("filter_flags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    theme: text("theme").notNull().default("待分析"),
    scenario: text("scenario").notNull().default("待分析"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("materials_normalized_hash_unique").on(table.normalizedHash),
    index("materials_review_status_idx").on(table.reviewStatus),
    index("materials_license_status_idx").on(table.licenseStatus),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    decision: reviewStatusEnum("decision").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reviews_material_id_idx").on(table.materialId)],
);

export const inspirations = pgTable(
  "inspirations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    text: text("text").notNull(),
    theme: text("theme").notNull(),
    scenario: text("scenario").notNull(),
    platforms: jsonb("platforms").$type<string[]>().notNull(),
    favorite: boolean("favorite").notNull().default(false),
    score: integer("score").notNull(),
    ...createTimestamps(),
  },
  (table) => [uniqueIndex("inspirations_material_id_unique").on(table.materialId)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspirationId: uuid("inspiration_id")
      .notNull()
      .references(() => inspirations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    text: text("text").notNull(),
    tone: text("tone").notNull(),
    targetPlatform: text("target_platform").notNull(),
    similarityRisk: integer("similarity_risk").notNull(),
    safetyStatus: text("safety_status").notNull(),
    status: draftStatusEnum("status").notNull().default("draft"),
    generatedBy: text("generated_by").notNull().default("ai"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("drafts_inspiration_version_unique").on(table.inspirationId, table.version),
  ],
);

export const videoProjects = pgTable(
  "video_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    templateKey: text("template_key").notNull(),
    status: jobStatusEnum("status").notNull().default("draft"),
    durationSeconds: integer("duration_seconds").notNull(),
    config: jsonb("config").$type<Record<string, string>>().notNull(),
    ...createTimestamps(),
  },
  (table) => [index("video_projects_status_idx").on(table.status)],
);

export const exportRecords = pgTable(
  "export_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoProjectId: uuid("video_project_id")
      .notNull()
      .references(() => videoProjects.id, { onDelete: "restrict" }),
    status: exportStatusEnum("status").notNull(),
    progress: integer("progress"),
    errorMessage: text("error_message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("export_records_video_project_idx").on(table.videoProjectId)],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activity_events_entity_idx").on(table.entityType, table.entityId)],
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    sourceType: contentSourceTypeEnum("source_type").notNull(),
    contentLane: contentLaneEnum("content_lane").notNull(),
    originalContent: text("original_content").notNull(),
    cleanedContent: text("cleaned_content").notNull(),
    contentHash: text("content_hash").notNull(),
    author: text("author"),
    source: text("source").notNull(),
    sourcePlatform: text("source_platform"),
    sourceUrl: text("source_url"),
    licenseStatus: licenseStatusEnum("license_status").notNull(),
    likes: bigint("likes", { mode: "number" }).notNull().default(0),
    emotion: text("emotion"),
    emotionScore: integer("emotion_score"),
    resonanceScore: integer("resonance_score"),
    category: text("category"),
    scene: text("scene"),
    relationshipType: text("relationship_type"),
    theme: text("theme"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    analysisKind: analysisKindEnum("analysis_kind"),
    analysisPayload: jsonb("analysis_payload").$type<Record<string, unknown>>(),
    analysisProvider: text("analysis_provider"),
    analysisModel: text("analysis_model"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    isFavorite: boolean("is_favorite").notNull().default(false),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("content_items_account_hash_unique").on(table.accountId, table.contentHash),
    uniqueIndex("content_items_id_account_unique").on(table.id, table.accountId),
    index("content_items_account_created_idx").on(table.accountId, table.createdAt),
    index("content_items_account_lane_idx").on(table.accountId, table.contentLane),
    index("content_items_account_source_type_idx").on(table.accountId, table.sourceType),
    index("content_items_account_favorite_idx").on(table.accountId, table.isFavorite),
    index("content_items_account_emotion_idx").on(table.accountId, table.emotion),
    index("content_items_account_scene_idx").on(table.accountId, table.scene),
    index("content_items_account_relationship_idx").on(table.accountId, table.relationshipType),
    index("content_items_account_theme_idx").on(table.accountId, table.theme),
    check(
      "content_items_account_lane_match",
      sql`(
        (${table.accountId} = 'personal_growth' AND ${table.contentLane} IN ('growth_review', 'growth_story', 'problem_solution')) OR
        (${table.accountId} = 'fun_english' AND ${table.contentLane} = 'english_50') OR
        (${table.accountId} = 'emotion_library' AND ${table.contentLane} IN ('emotion_material', 'emotion_post'))
      )`,
    ),
    check("content_items_likes_nonnegative", sql`${table.likes} >= 0`),
    check(
      "content_items_emotion_score_range",
      sql`${table.emotionScore} BETWEEN 0 AND 100`,
    ),
    check(
      "content_items_resonance_score_range",
      sql`${table.resonanceScore} BETWEEN 0 AND 100`,
    ),
  ],
);

export const generatedContents = pgTable(
  "generated_contents",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    contentLane: contentLaneEnum("content_lane").notNull(),
    primaryContentId: uuid("primary_content_id"),
    selectedContentIds: jsonb("selected_content_ids").$type<string[]>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    generator: text("generator").notNull(),
    model: text("model").notNull(),
    generatorLabel: text("generator_label").notNull(),
    promptVersion: text("prompt_version").notNull().default("legacy.v1"),
    reviewDecision: text("review_decision"),
    humanEditedOutput: jsonb("human_edited_output").$type<{ title: string; body: string; hashtags: string[] } | null>(),
    outputKind: generatedOutputKindEnum("output_kind").notNull(),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown>>(),
    reviewIssues: jsonb("review_issues").$type<string[]>().notNull(),
    publishability: publishabilityEnum("publishability").notNull(),
    status: draftStatusEnum("status").notNull().default("draft"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("generated_contents_id_account_unique").on(table.id, table.accountId),
    index("generated_contents_created_at_idx").on(table.createdAt),
    index("generated_contents_account_lane_idx").on(table.accountId, table.contentLane),
    foreignKey({
      columns: [table.primaryContentId, table.accountId],
      foreignColumns: [contentItems.id, contentItems.accountId],
      name: "generated_contents_primary_content_account_fk",
    }).onDelete("restrict"),
      check(
        "generated_contents_account_lane_match",
      sql`(
        (${table.accountId} = 'personal_growth' AND ${table.contentLane} IN ('growth_review', 'growth_story', 'problem_solution') AND ${table.outputKind} = 'growth_post.v1') OR
        (${table.accountId} = 'fun_english' AND ${table.contentLane} = 'english_50' AND ${table.outputKind} = 'english_50.v1') OR
        (${table.accountId} = 'emotion_library' AND ${table.contentLane} = 'emotion_post' AND ${table.outputKind} IN ('emotion_post.v1', 'legacy.v1'))
      )`,
      ),
    check(
      "generated_contents_review_decision_allowed",
      sql`${table.reviewDecision} IS NULL OR ${table.reviewDecision} IN ('accepted', 'rejected')`,
    ),
  ],
);

export const postRecords = pgTable(
  "post_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    contentId: uuid("content_id").notNull(),
    generatedContentId: text("generated_content_id").notNull(),
    status: postStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    titleUsed: text("title_used").notNull(),
    bodyUsed: text("body_used").notNull(),
    hashtagsUsed: jsonb("hashtags_used").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    contentLane: contentLaneEnum("content_lane").notNull(),
    coverType: text("cover_type"),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("post_records_generated_content_unique").on(table.generatedContentId),
    index("post_records_account_published_idx").on(table.accountId, table.publishedAt),
    index("post_records_account_lane_idx").on(table.accountId, table.contentLane),
    foreignKey({
      columns: [table.contentId, table.accountId],
      foreignColumns: [contentItems.id, contentItems.accountId],
      name: "post_records_content_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.generatedContentId, table.accountId],
      foreignColumns: [generatedContents.id, generatedContents.accountId],
      name: "post_records_generated_content_account_fk",
    }).onDelete("restrict"),
    check(
      "post_records_publish_timestamp_match",
      sql`(
        (${table.status} = 'draft' AND ${table.publishedAt} IS NULL) OR
        (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL)
      )`,
    ),
    check(
      "post_records_account_lane_match",
      sql`(
        (${table.accountId} = 'personal_growth' AND ${table.contentLane} IN ('growth_review', 'growth_story', 'problem_solution')) OR
        (${table.accountId} = 'fun_english' AND ${table.contentLane} = 'english_50') OR
        (${table.accountId} = 'emotion_library' AND ${table.contentLane} = 'emotion_post')
      )`,
    ),
  ],
);

export const postPerformances = pgTable(
  "post_performances",
  {
    postRecordId: uuid("post_record_id")
      .primaryKey()
      .references(() => postRecords.id, { onDelete: "cascade" }),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    favorites: bigint("favorites", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    follows: bigint("follows", { mode: "number" }),
    metricsCapturedAt: timestamp("metrics_captured_at", { withTimezone: true }),
    ...createTimestamps(),
  },
  (table) => [
    index("post_performances_captured_at_idx").on(table.metricsCapturedAt),
    check("post_performances_views_nonnegative", sql`${table.views} IS NULL OR ${table.views} >= 0`),
    check("post_performances_likes_nonnegative", sql`${table.likes} IS NULL OR ${table.likes} >= 0`),
    check(
      "post_performances_favorites_nonnegative",
      sql`${table.favorites} IS NULL OR ${table.favorites} >= 0`,
    ),
    check(
      "post_performances_comments_nonnegative",
      sql`${table.comments} IS NULL OR ${table.comments} >= 0`,
    ),
    check("post_performances_shares_nonnegative", sql`${table.shares} IS NULL OR ${table.shares} >= 0`),
    check("post_performances_follows_nonnegative", sql`${table.follows} IS NULL OR ${table.follows} >= 0`),
    check(
      "post_performances_capture_time_required",
      sql`(
        ${table.views} IS NULL AND
        ${table.likes} IS NULL AND
        ${table.favorites} IS NULL AND
        ${table.comments} IS NULL AND
        ${table.shares} IS NULL AND
        ${table.follows} IS NULL
      ) OR ${table.metricsCapturedAt} IS NOT NULL`,
    ),
  ],
);
