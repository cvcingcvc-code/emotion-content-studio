CREATE TYPE "license_status" AS ENUM ('original', 'licensed', 'reference_only', 'prohibited');
CREATE TYPE "review_status" AS ENUM ('pending', 'approved', 'rejected', 'needs_edit', 'reference_only');
CREATE TYPE "draft_status" AS ENUM ('draft', 'confirmed', 'rejected');
CREATE TYPE "job_status" AS ENUM ('draft', 'preview_ready', 'exporting', 'exported', 'failed', 'blocked');
CREATE TYPE "export_status" AS ENUM ('succeeded', 'processing', 'failed');

CREATE TABLE "imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_name" text NOT NULL,
  "file_hash" text NOT NULL,
  "source_type" text NOT NULL,
  "source_url" text,
  "license_status" "license_status" NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "total_rows" integer NOT NULL DEFAULT 0,
  "valid_rows" integer NOT NULL DEFAULT 0,
  "rejected_rows" integer NOT NULL DEFAULT 0,
  "imported_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "materials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "import_id" uuid REFERENCES "imports"("id") ON DELETE SET NULL,
  "original_text" text NOT NULL,
  "normalized_hash" text NOT NULL,
  "source_type" text NOT NULL,
  "source_url" text,
  "license_status" "license_status" NOT NULL,
  "review_status" "review_status" NOT NULL DEFAULT 'pending',
  "risk_level" text NOT NULL DEFAULT 'low',
  "filter_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "theme" text NOT NULL DEFAULT '待分析',
  "scenario" text NOT NULL DEFAULT '待分析',
  "imported_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "material_id" uuid NOT NULL REFERENCES "materials"("id") ON DELETE CASCADE,
  "decision" "review_status" NOT NULL,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "inspirations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "material_id" uuid NOT NULL REFERENCES "materials"("id") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "text" text NOT NULL,
  "theme" text NOT NULL,
  "scenario" text NOT NULL,
  "platforms" jsonb NOT NULL,
  "favorite" boolean NOT NULL DEFAULT false,
  "score" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "inspiration_id" uuid NOT NULL REFERENCES "inspirations"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "text" text NOT NULL,
  "tone" text NOT NULL,
  "target_platform" text NOT NULL,
  "similarity_risk" integer NOT NULL,
  "safety_status" text NOT NULL,
  "status" "draft_status" NOT NULL DEFAULT 'draft',
  "generated_by" text NOT NULL DEFAULT 'ai',
  "confirmed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "drafts_inspiration_version_unique" UNIQUE ("inspiration_id", "version")
);

CREATE TABLE "video_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "draft_id" uuid NOT NULL REFERENCES "drafts"("id") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "template_key" text NOT NULL,
  "status" "job_status" NOT NULL DEFAULT 'draft',
  "duration_seconds" integer NOT NULL,
  "config" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "export_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "video_project_id" uuid NOT NULL REFERENCES "video_projects"("id") ON DELETE RESTRICT,
  "status" "export_status" NOT NULL,
  "progress" integer,
  "error_message" text,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "detail" jsonb NOT NULL,
  "request_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "imports_file_hash_unique" ON "imports" ("file_hash");
CREATE UNIQUE INDEX "materials_normalized_hash_unique" ON "materials" ("normalized_hash");
CREATE INDEX "materials_review_status_idx" ON "materials" ("review_status");
CREATE INDEX "materials_license_status_idx" ON "materials" ("license_status");
CREATE INDEX "reviews_material_id_idx" ON "reviews" ("material_id");
CREATE UNIQUE INDEX "inspirations_material_id_unique" ON "inspirations" ("material_id");
CREATE INDEX "video_projects_status_idx" ON "video_projects" ("status");
CREATE INDEX "export_records_video_project_idx" ON "export_records" ("video_project_id");
CREATE INDEX "activity_events_entity_idx" ON "activity_events" ("entity_type", "entity_id");
