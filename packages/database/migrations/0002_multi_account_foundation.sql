CREATE TYPE "content_source_type" AS ENUM (
  'manual',
  'daily_review',
  'english_topic',
  'external_emotion_source',
  'idea',
  'legacy_import'
);

CREATE TYPE "content_lane" AS ENUM (
  'growth_review',
  'growth_story',
  'problem_solution',
  'english_50',
  'emotion_material',
  'emotion_post'
);

CREATE TYPE "analysis_kind" AS ENUM ('growth.v1', 'emotion.v1');
CREATE TYPE "generated_output_kind" AS ENUM (
  'growth_post.v1',
  'english_50.v1',
  'emotion_post.v1',
  'legacy.v1'
);
CREATE TYPE "publishability" AS ENUM ('eligible', 'research_only', 'needs_rewrite');
CREATE TYPE "post_status" AS ENUM ('draft', 'published');

CREATE TABLE "accounts" (
  "id" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "short_name" text NOT NULL,
  "description" text NOT NULL,
  "primary_lane" "content_lane" NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "accounts_id_allowed" CHECK (
    "id" IN ('personal_growth', 'fun_english', 'emotion_library')
  ),
  CONSTRAINT "accounts_sort_order_positive" CHECK ("sort_order" > 0),
  CONSTRAINT "accounts_primary_lane_match" CHECK (
    ("id" = 'personal_growth' AND "primary_lane" = 'growth_review') OR
    ("id" = 'fun_english' AND "primary_lane" = 'english_50') OR
    ("id" = 'emotion_library' AND "primary_lane" = 'emotion_material')
  )
);

CREATE UNIQUE INDEX "accounts_sort_order_unique" ON "accounts" ("sort_order");

INSERT INTO "accounts" (
  "id",
  "display_name",
  "short_name",
  "description",
  "primary_lane",
  "sort_order"
) VALUES
  (
    'personal_growth',
    'Personal Growth',
    '成长复盘',
    '真实成长、工作选择与可执行的问题复盘。',
    'growth_review',
    1
  ),
  (
    'fun_english',
    'Fun English',
    '趣味英语',
    '把一个生活主题拆成真正能使用的英语 50 句。',
    'english_50',
    2
  ),
  (
    'emotion_library',
    'Emotion Library',
    '情绪素材',
    '追踪来源、理解共鸣主题并完成原创转换。',
    'emotion_material',
    3
  );

ALTER TABLE "content_items"
  ADD COLUMN "account_id" text,
  ADD COLUMN "source_type" "content_source_type",
  ADD COLUMN "content_lane" "content_lane",
  ADD COLUMN "source_platform" text,
  ADD COLUMN "scene" text,
  ADD COLUMN "relationship_type" text,
  ADD COLUMN "theme" text,
  ADD COLUMN "analysis_kind" "analysis_kind",
  ADD COLUMN "analysis_payload" jsonb,
  ADD COLUMN "analysis_provider" text,
  ADD COLUMN "analysis_model" text,
  ADD COLUMN "analyzed_at" timestamptz,
  ADD COLUMN "collected_at" timestamptz;

UPDATE "content_items"
SET
  "account_id" = 'emotion_library',
  "source_type" = 'legacy_import',
  "content_lane" = 'emotion_material';

ALTER TABLE "content_items"
  ALTER COLUMN "account_id" SET NOT NULL,
  ALTER COLUMN "source_type" SET NOT NULL,
  ALTER COLUMN "content_lane" SET NOT NULL,
  ALTER COLUMN "emotion" DROP NOT NULL,
  ALTER COLUMN "emotion_score" DROP NOT NULL,
  ALTER COLUMN "resonance_score" DROP NOT NULL,
  ALTER COLUMN "category" DROP NOT NULL,
  ADD CONSTRAINT "content_items_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "content_items_account_lane_match" CHECK (
    ("account_id" = 'personal_growth' AND "content_lane" IN ('growth_review', 'growth_story', 'problem_solution')) OR
    ("account_id" = 'fun_english' AND "content_lane" = 'english_50') OR
    ("account_id" = 'emotion_library' AND "content_lane" IN ('emotion_material', 'emotion_post'))
  );

DROP INDEX "content_items_content_hash_unique";
DROP INDEX "content_items_emotion_idx";
DROP INDEX "content_items_category_idx";
DROP INDEX "content_items_favorite_idx";

CREATE UNIQUE INDEX "content_items_account_hash_unique"
  ON "content_items" ("account_id", "content_hash");
CREATE UNIQUE INDEX "content_items_id_account_unique"
  ON "content_items" ("id", "account_id");
CREATE INDEX "content_items_account_created_idx"
  ON "content_items" ("account_id", "created_at");
CREATE INDEX "content_items_account_lane_idx"
  ON "content_items" ("account_id", "content_lane");
CREATE INDEX "content_items_account_source_type_idx"
  ON "content_items" ("account_id", "source_type");
CREATE INDEX "content_items_account_favorite_idx"
  ON "content_items" ("account_id", "is_favorite");
CREATE INDEX "content_items_account_emotion_idx"
  ON "content_items" ("account_id", "emotion");
CREATE INDEX "content_items_account_scene_idx"
  ON "content_items" ("account_id", "scene");
CREATE INDEX "content_items_account_relationship_idx"
  ON "content_items" ("account_id", "relationship_type");
CREATE INDEX "content_items_account_theme_idx"
  ON "content_items" ("account_id", "theme");

ALTER TABLE "generated_contents"
  ADD COLUMN "account_id" text,
  ADD COLUMN "content_lane" "content_lane",
  ADD COLUMN "primary_content_id" uuid,
  ADD COLUMN "output_kind" "generated_output_kind",
  ADD COLUMN "output_payload" jsonb,
  ADD COLUMN "review_issues" jsonb,
  ADD COLUMN "publishability" "publishability",
  ADD COLUMN "confirmed_at" timestamptz;

UPDATE "generated_contents"
SET
  "account_id" = 'emotion_library',
  "content_lane" = 'emotion_post',
  "output_kind" = 'legacy.v1',
  "review_issues" = '["legacy_output_requires_review"]'::jsonb,
  "publishability" = 'needs_rewrite';

UPDATE "generated_contents" AS generated
SET "primary_content_id" = content_item."id"
FROM "content_items" AS content_item
WHERE generated."selected_content_ids" ->> 0 = content_item."id"::text;

ALTER TABLE "generated_contents"
  ALTER COLUMN "account_id" SET NOT NULL,
  ALTER COLUMN "content_lane" SET NOT NULL,
  ALTER COLUMN "output_kind" SET NOT NULL,
  ALTER COLUMN "review_issues" SET NOT NULL,
  ALTER COLUMN "publishability" SET NOT NULL,
  ADD CONSTRAINT "generated_contents_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "generated_contents_account_lane_match" CHECK (
    ("account_id" = 'personal_growth' AND "content_lane" IN ('growth_review', 'growth_story', 'problem_solution') AND "output_kind" = 'growth_post.v1') OR
    ("account_id" = 'fun_english' AND "content_lane" = 'english_50' AND "output_kind" = 'english_50.v1') OR
    ("account_id" = 'emotion_library' AND "content_lane" = 'emotion_post' AND "output_kind" IN ('emotion_post.v1', 'legacy.v1'))
  );

CREATE UNIQUE INDEX "generated_contents_id_account_unique"
  ON "generated_contents" ("id", "account_id");
CREATE INDEX "generated_contents_account_lane_idx"
  ON "generated_contents" ("account_id", "content_lane");

ALTER TABLE "generated_contents"
  ADD CONSTRAINT "generated_contents_primary_content_account_fk"
  FOREIGN KEY ("primary_content_id", "account_id")
  REFERENCES "content_items"("id", "account_id") ON DELETE RESTRICT;

CREATE TABLE "post_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" text NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "content_id" uuid NOT NULL,
  "generated_content_id" text NOT NULL,
  "status" "post_status" NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "title_used" text NOT NULL,
  "body_used" text NOT NULL,
  "hashtags_used" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "content_lane" "content_lane" NOT NULL,
  "cover_type" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "post_records_content_account_fk"
    FOREIGN KEY ("content_id", "account_id")
    REFERENCES "content_items"("id", "account_id") ON DELETE RESTRICT,
  CONSTRAINT "post_records_generated_content_account_fk"
    FOREIGN KEY ("generated_content_id", "account_id")
    REFERENCES "generated_contents"("id", "account_id") ON DELETE RESTRICT,
  CONSTRAINT "post_records_publish_timestamp_match" CHECK (
    ("status" = 'draft' AND "published_at" IS NULL) OR
    ("status" = 'published' AND "published_at" IS NOT NULL)
  ),
  CONSTRAINT "post_records_account_lane_match" CHECK (
    ("account_id" = 'personal_growth' AND "content_lane" IN ('growth_review', 'growth_story', 'problem_solution')) OR
    ("account_id" = 'fun_english' AND "content_lane" = 'english_50') OR
    ("account_id" = 'emotion_library' AND "content_lane" = 'emotion_post')
  )
);

CREATE INDEX "post_records_account_published_idx"
  ON "post_records" ("account_id", "published_at");
CREATE INDEX "post_records_account_lane_idx"
  ON "post_records" ("account_id", "content_lane");
CREATE UNIQUE INDEX "post_records_generated_content_unique"
  ON "post_records" ("generated_content_id");

CREATE TABLE "post_performances" (
  "post_record_id" uuid PRIMARY KEY REFERENCES "post_records"("id") ON DELETE CASCADE,
  "views" bigint,
  "likes" bigint,
  "favorites" bigint,
  "comments" bigint,
  "shares" bigint,
  "follows" bigint,
  "metrics_captured_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "post_performances_views_nonnegative" CHECK ("views" IS NULL OR "views" >= 0),
  CONSTRAINT "post_performances_likes_nonnegative" CHECK ("likes" IS NULL OR "likes" >= 0),
  CONSTRAINT "post_performances_favorites_nonnegative" CHECK ("favorites" IS NULL OR "favorites" >= 0),
  CONSTRAINT "post_performances_comments_nonnegative" CHECK ("comments" IS NULL OR "comments" >= 0),
  CONSTRAINT "post_performances_shares_nonnegative" CHECK ("shares" IS NULL OR "shares" >= 0),
  CONSTRAINT "post_performances_follows_nonnegative" CHECK ("follows" IS NULL OR "follows" >= 0),
  CONSTRAINT "post_performances_capture_time_required" CHECK (
    (
      "views" IS NULL AND
      "likes" IS NULL AND
      "favorites" IS NULL AND
      "comments" IS NULL AND
      "shares" IS NULL AND
      "follows" IS NULL
    ) OR "metrics_captured_at" IS NOT NULL
  )
);

CREATE INDEX "post_performances_captured_at_idx"
  ON "post_performances" ("metrics_captured_at");
