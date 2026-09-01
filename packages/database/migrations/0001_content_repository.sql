CREATE TABLE "content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sequence" bigserial NOT NULL,
  "original_content" text NOT NULL,
  "cleaned_content" text NOT NULL,
  "content_hash" text NOT NULL,
  "author" text,
  "source" text NOT NULL,
  "source_url" text,
  "license_status" "license_status" NOT NULL,
  "likes" bigint NOT NULL DEFAULT 0,
  "emotion" text NOT NULL,
  "emotion_score" integer NOT NULL,
  "resonance_score" integer NOT NULL,
  "category" text NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_favorite" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "content_items_likes_nonnegative" CHECK ("likes" >= 0),
  CONSTRAINT "content_items_emotion_score_range" CHECK ("emotion_score" BETWEEN 0 AND 100),
  CONSTRAINT "content_items_resonance_score_range" CHECK ("resonance_score" BETWEEN 0 AND 100)
);

CREATE TABLE "generated_contents" (
  "id" text PRIMARY KEY,
  "selected_content_ids" jsonb NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "tags" jsonb NOT NULL,
  "generator" text NOT NULL,
  "model" text NOT NULL,
  "generator_label" text NOT NULL,
  "status" "draft_status" NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "content_items_content_hash_unique" ON "content_items" ("content_hash");
CREATE INDEX "content_items_emotion_idx" ON "content_items" ("emotion");
CREATE INDEX "content_items_category_idx" ON "content_items" ("category");
CREATE INDEX "content_items_favorite_idx" ON "content_items" ("is_favorite");
CREATE INDEX "generated_contents_created_at_idx" ON "generated_contents" ("created_at");
