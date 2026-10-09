import { GrowthLoopStateSchema, RetrospectiveSchema, PublishedContentSchema, ContentMetricsSchema, ContentFeedbackSchema, StrategyEntrySchema, type Retrospective, type PublishedContent, type ContentMetrics, type ContentFeedback, type StrategyEntry } from "@emotion-studio/contracts";
import type { SQLiteDatabaseContext } from "@emotion-studio/database";
import { AppError } from "../errors.js";
import { assertRevision, type GrowthLoopRepository } from "./repository.js";

export class SQLiteGrowthLoopRepository implements GrowthLoopRepository {
  readonly mode = "sqlite" as const;
  constructor(private readonly database: SQLiteDatabaseContext) {}
  async snapshot() {
    // A read transaction gives all five collections the same committed view.
    return this.database.transaction(() => GrowthLoopStateSchema.parse({ retrospectives: this.database.all("retrospectives"), contents: this.database.all("loop_contents"), metrics: this.database.all("metrics"), feedback: this.database.all("feedback"), strategies: this.database.all("strategies") }));
  }
  async saveRetrospective(value: Retrospective, expected: number | null) {
    value = RetrospectiveSchema.parse(value);
    this.database.transaction(() => {
      assertRevision(this.database.read("retrospectives", value.id) as Retrospective | undefined, value, expected);
      this.database.db.prepare("INSERT INTO retrospectives VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload").run(value.id, value.revision, JSON.stringify(value));
    });
  }
  async saveContent(value: PublishedContent, expected: number | null) {
    value = PublishedContentSchema.parse(value);
    this.database.transaction(() => {
      assertRevision(this.database.read("loop_contents", value.id) as PublishedContent | undefined, value, expected);
      if (value.sourceRetrospectiveId && !this.database.read("retrospectives", value.sourceRetrospectiveId) || value.sourceContentId && !this.database.read("loop_contents", value.sourceContentId)) throw new AppError(404, "SOURCE_NOT_FOUND", "来源记录不存在");
      this.database.db.prepare("INSERT INTO loop_contents VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,retrospective_id=excluded.retrospective_id,source_content_id=excluded.source_content_id,payload=excluded.payload").run(value.id, value.revision, value.sourceRetrospectiveId, value.sourceContentId, JSON.stringify(value));
    });
  }
  async addMetrics(value: ContentMetrics) {
    value = ContentMetricsSchema.parse(value);
    this.database.transaction(() => {
      if ((this.database.read("loop_contents", value.contentId) as PublishedContent | undefined)?.status !== "published") throw new AppError(409, "PUBLISH_REQUIRED", "请先记录发布");
      if (this.database.read("metrics", value.id)) throw new AppError(409, "DUPLICATE", "指标已存在");
      this.database.db.prepare("INSERT INTO metrics VALUES (?, ?, ?)").run(value.id, value.contentId, JSON.stringify(value));
    });
  }
  async addFeedback(value: ContentFeedback) {
    value = ContentFeedbackSchema.parse(value);
    this.database.transaction(() => {
      if ((this.database.read("metrics", value.metricsId) as ContentMetrics | undefined)?.contentId !== value.contentId) throw new AppError(404, "METRICS_NOT_FOUND", "指标不存在");
      if (this.database.read("feedback", value.id)) throw new AppError(409, "DUPLICATE", "反馈已存在");
      this.database.db.prepare("INSERT INTO feedback VALUES (?, ?, ?, ?)").run(value.id, value.metricsId, value.contentId, JSON.stringify(value));
    });
  }
  async saveStrategies(values: StrategyEntry[]) {
    const parsed = values.map(value => StrategyEntrySchema.parse(value));
    const keys = parsed.filter(value => value.status === "active").map(value => `${value.account}/${value.key}`);
    if (new Set(keys).size !== keys.length) throw new AppError(409, "STRATEGY_CONFLICT", "同一个策略 key 只能有一个 active value");
    this.database.transaction(() => {
      this.database.db.exec("DELETE FROM strategies");
      for (const value of parsed) this.database.db.prepare("INSERT INTO strategies VALUES (?, ?)").run(value.id, JSON.stringify(value));
    });
  }
}
