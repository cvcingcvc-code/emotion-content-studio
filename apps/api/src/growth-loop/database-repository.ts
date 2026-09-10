import { and, eq } from "drizzle-orm";
import { dailyRetrospectives, publishedContents, contentMetrics, contentFeedback, type DatabaseContext } from "@emotion-studio/database";
import { GrowthLoopStateSchema, RetrospectiveSchema, PublishedContentSchema, ContentMetricsSchema, ContentFeedbackSchema, type Retrospective, type PublishedContent, type ContentMetrics, type ContentFeedback } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";
import { assertRevision, type GrowthLoopRepository } from "./repository.js";

export class DatabaseGrowthLoopRepository implements GrowthLoopRepository {
  constructor(private db: DatabaseContext["db"]) {}
  async snapshot() {
    return this.db.transaction(async tx => {
      const retrospectives = (await tx.select().from(dailyRetrospectives)).map(x => x.payload);
      const contents = (await tx.select().from(publishedContents)).map(x => x.payload);
      const metrics = (await tx.select().from(contentMetrics)).map(x => x.payload);
      const feedback = (await tx.select().from(contentFeedback)).map(x => x.payload);
      return GrowthLoopStateSchema.parse({ retrospectives, contents, metrics, feedback });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }
  async saveRetrospective(value: Retrospective, expected: number | null) {
    value = RetrospectiveSchema.parse(value);
    if (expected === null) {
      assertRevision(undefined, value, expected);
      const rows = await this.db.insert(dailyRetrospectives).values({ id: value.id, revision: value.revision, payload: value }).onConflictDoNothing().returning();
      if (!rows.length) throw new AppError(409, "STALE_REVISION", "记录已存在");
    } else {
      assertRevision({ revision: expected }, value, expected);
      const rows = await this.db.update(dailyRetrospectives).set({ revision: value.revision, payload: value }).where(and(eq(dailyRetrospectives.id, value.id), eq(dailyRetrospectives.revision, expected))).returning();
      if (!rows.length) throw new AppError(409, "STALE_REVISION", "记录已更新，请刷新");
    }
  }
  async saveContent(value: PublishedContent, expected: number | null) {
    value = PublishedContentSchema.parse(value);
    await this.db.transaction(async tx => {
      if (value.sourceRetrospectiveId && !(await tx.select().from(dailyRetrospectives).where(eq(dailyRetrospectives.id, value.sourceRetrospectiveId))).length || value.sourceContentId && !(await tx.select().from(publishedContents).where(eq(publishedContents.id, value.sourceContentId))).length) throw new AppError(404, "SOURCE_NOT_FOUND", "来源记录不存在");
      const row = { id: value.id, revision: value.revision, sourceRetrospectiveId: value.sourceRetrospectiveId, status: value.status, payload: value };
      assertRevision(expected === null ? undefined : { revision: expected }, value, expected);
      const rows = expected === null
        ? await tx.insert(publishedContents).values(row).onConflictDoNothing().returning()
        : await tx.update(publishedContents).set(row).where(and(eq(publishedContents.id, value.id), eq(publishedContents.revision, expected))).returning();
      if (!rows.length) throw new AppError(409, "STALE_REVISION", "记录已更新，请刷新");
    });
  }
  async addMetrics(value: ContentMetrics) {
    value = ContentMetricsSchema.parse(value);
    const [content] = await this.db.select().from(publishedContents).where(eq(publishedContents.id, value.contentId));
    if (content?.status !== "published") throw new AppError(409, "PUBLISH_REQUIRED", "请先记录发布");
    const rows = await this.db.insert(contentMetrics).values({ id: value.id, contentId: value.contentId, payload: value }).onConflictDoNothing().returning();
    if (!rows.length) throw new AppError(409, "DUPLICATE", "指标已存在");
  }
  async addFeedback(value: ContentFeedback) {
    value = ContentFeedbackSchema.parse(value);
    if (!(await this.db.select().from(contentMetrics).where(and(eq(contentMetrics.id, value.metricsId), eq(contentMetrics.contentId, value.contentId)))).length) throw new AppError(404, "METRICS_NOT_FOUND", "指标不存在");
    const rows = await this.db.insert(contentFeedback).values({ id: value.id, contentId: value.contentId, metricsId: value.metricsId, payload: value }).onConflictDoNothing().returning();
    if (!rows.length) throw new AppError(409, "DUPLICATE", "反馈已存在");
  }
}
