import { GrowthLoopStateSchema, RetrospectiveSchema, PublishedContentSchema, ContentMetricsSchema, ContentFeedbackSchema, type GrowthLoopState, type Retrospective, type PublishedContent, type ContentMetrics, type ContentFeedback } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";

export interface GrowthLoopRepository {
  snapshot(): Promise<GrowthLoopState>;
  saveRetrospective(value: Retrospective, expectedRevision: number | null): Promise<void>;
  saveContent(value: PublishedContent, expectedRevision: number | null): Promise<void>;
  addMetrics(value: ContentMetrics): Promise<void>;
  addFeedback(value: ContentFeedback): Promise<void>;
}
export function assertRevision(existing: { revision: number } | undefined, value: { revision: number }, expected: number | null) {
  if (expected === null ? existing || value.revision !== 0 : !existing || existing.revision !== expected || value.revision !== expected + 1) {
    throw new AppError(409, "STALE_REVISION", "记录已更新，请刷新后重试");
  }
}
export class InMemoryGrowthLoopRepository implements GrowthLoopRepository {
  private state: GrowthLoopState = { retrospectives: [], contents: [], metrics: [], feedback: [] };
  async snapshot() { return GrowthLoopStateSchema.parse(structuredClone(this.state)); }
  async saveRetrospective(value: Retrospective, expected: number | null) {
    value = RetrospectiveSchema.parse(value);
    assertRevision(this.state.retrospectives.find(x => x.id === value.id), value, expected);
    this.state.retrospectives = [...this.state.retrospectives.filter(x => x.id !== value.id), value];
  }
  async saveContent(value: PublishedContent, expected: number | null) {
    value = PublishedContentSchema.parse(value);
    assertRevision(this.state.contents.find(x => x.id === value.id), value, expected);
    if (value.sourceRetrospectiveId && !this.state.retrospectives.some(x => x.id === value.sourceRetrospectiveId) || value.sourceContentId && !this.state.contents.some(x => x.id === value.sourceContentId)) throw new AppError(404, "SOURCE_NOT_FOUND", "来源记录不存在");
    this.state.contents = [...this.state.contents.filter(x => x.id !== value.id), value];
  }
  async addMetrics(value: ContentMetrics) {
    value = ContentMetricsSchema.parse(value);
    if (!this.state.contents.some(x => x.id === value.contentId && x.status === "published")) throw new AppError(409, "PUBLISH_REQUIRED", "请先记录发布");
    if (this.state.metrics.some(x => x.id === value.id)) throw new AppError(409, "DUPLICATE", "指标已存在");
    this.state.metrics.push(value);
  }
  async addFeedback(value: ContentFeedback) {
    value = ContentFeedbackSchema.parse(value);
    if (!this.state.metrics.some(x => x.id === value.metricsId && x.contentId === value.contentId)) throw new AppError(404, "METRICS_NOT_FOUND", "指标不存在");
    if (this.state.feedback.some(x => x.id === value.id)) throw new AppError(409, "DUPLICATE", "反馈已存在");
    this.state.feedback.push(value);
  }
}
