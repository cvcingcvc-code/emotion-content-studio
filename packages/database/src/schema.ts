import { sql } from "drizzle-orm";
import {
  boolean,
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
