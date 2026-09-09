ALTER TABLE "generated_contents"
  ADD COLUMN "prompt_version" text NOT NULL DEFAULT 'legacy.v1',
  ADD COLUMN "review_decision" text,
  ADD COLUMN "human_edited_output" jsonb;

ALTER TABLE "generated_contents"
  ADD CONSTRAINT "generated_contents_review_decision_allowed"
  CHECK ("review_decision" IS NULL OR "review_decision" IN ('accepted', 'rejected'));
