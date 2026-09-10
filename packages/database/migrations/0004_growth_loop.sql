CREATE TABLE daily_retrospectives (
  id uuid PRIMARY KEY,
  revision integer NOT NULL CHECK (revision >= 0),
  payload jsonb NOT NULL,
  CHECK (payload->>'id' = id::text AND (payload->>'revision')::integer = revision)
);
CREATE TABLE published_contents (
  id uuid PRIMARY KEY,
  revision integer NOT NULL CHECK (revision >= 0),
  source_retrospective_id uuid REFERENCES daily_retrospectives(id),
  status text NOT NULL CHECK (status IN ('draft','review','ready','published')),
  payload jsonb NOT NULL,
  CHECK (payload->>'id' = id::text AND (payload->>'revision')::integer = revision AND payload->>'status' = status)
);
CREATE INDEX published_contents_status_idx ON published_contents(status);
CREATE INDEX published_contents_retrospective_idx ON published_contents(source_retrospective_id);
CREATE TABLE content_metrics (
  id uuid PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES published_contents(id),
  payload jsonb NOT NULL,
  UNIQUE (id, content_id),
  CHECK (payload->>'id' = id::text AND payload->>'contentId' = content_id::text),
  CHECK ((payload->>'views')::bigint >= 0 AND (payload->>'likes')::bigint >= 0
    AND (payload->>'favorites')::bigint >= 0 AND (payload->>'comments')::bigint >= 0
    AND (payload->>'followersGained')::bigint >= 0)
);
CREATE INDEX content_metrics_content_idx ON content_metrics(content_id);
CREATE TABLE content_feedback (
  id uuid PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES published_contents(id),
  metrics_id uuid NOT NULL REFERENCES content_metrics(id),
  payload jsonb NOT NULL,
  FOREIGN KEY (metrics_id, content_id) REFERENCES content_metrics(id, content_id),
  CHECK (payload->>'id' = id::text AND payload->>'contentId' = content_id::text AND payload->>'metricsId' = metrics_id::text)
);
CREATE INDEX content_feedback_content_idx ON content_feedback(content_id);
