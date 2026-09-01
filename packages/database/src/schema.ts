import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
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

const createTimestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    originalContent: text("original_content").notNull(),
    cleanedContent: text("cleaned_content").notNull(),
    contentHash: text("content_hash").notNull(),
    author: text("author"),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    licenseStatus: licenseStatusEnum("license_status").notNull(),
    likes: bigint("likes", { mode: "number" }).notNull().default(0),
    emotion: text("emotion").notNull(),
    emotionScore: integer("emotion_score").notNull(),
    resonanceScore: integer("resonance_score").notNull(),
    category: text("category").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    isFavorite: boolean("is_favorite").notNull().default(false),
    ...createTimestamps(),
  },
  (table) => [
    uniqueIndex("content_items_content_hash_unique").on(table.contentHash),
    index("content_items_emotion_idx").on(table.emotion),
    index("content_items_category_idx").on(table.category),
    index("content_items_favorite_idx").on(table.isFavorite),
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
    selectedContentIds: jsonb("selected_content_ids").$type<string[]>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    generator: text("generator").notNull(),
    model: text("model").notNull(),
    generatorLabel: text("generator_label").notNull(),
    status: draftStatusEnum("status").notNull().default("draft"),
    ...createTimestamps(),
  },
  (table) => [index("generated_contents_created_at_idx").on(table.createdAt)],
);
