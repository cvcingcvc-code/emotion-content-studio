import { randomUUID } from "node:crypto";
import { CONTENT_POTENTIAL_THRESHOLD, PublishedContentSchema, RetrospectiveSchema, type RetrospectiveInput, type ContentAccount, type ContentType, type PublishedContent } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";
import type { EnglishWorkflow } from "../english/workflow.js";
import type { PipelineRegistry } from "../studio/pipelines/types.js";
import type { GrowthLoopRepository } from "./repository.js";
import { GrowthLoopAgent } from "./provider.js";
import { recommendNextExperiment } from "./feedback.js";
import { latestMetrics } from "./metrics.js";

export class GrowthLoopService {
  constructor(readonly repository: GrowthLoopRepository, readonly agent: GrowthLoopAgent, private english: EnglishWorkflow, private pipelines: PipelineRegistry) {}
  async retrospective(id: string) {
    const item = (await this.repository.snapshot()).retrospectives.find(x => x.id === id);
    if (!item) throw new AppError(404, "NOT_FOUND", "复盘不存在");
    return item;
  }
  async content(id: string) {
    const item = (await this.repository.snapshot()).contents.find(x => x.id === id);
    if (!item) throw new AppError(404, "NOT_FOUND", "内容不存在");
    return item;
  }
  async createRetrospective(input: RetrospectiveInput) {
    const now = new Date().toISOString();
    const value = RetrospectiveSchema.parse({ ...input, id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, analysis: null, analysisProvider: null });
    await this.repository.saveRetrospective(value, null); return value;
  }
  async updateRetrospective(id: string, input: RetrospectiveInput, revision: number) {
    const existing = await this.retrospective(id);
    const value = RetrospectiveSchema.parse({ ...existing, ...input, revision: revision + 1, updatedAt: new Date().toISOString(), analysis: null, analysisProvider: null });
    await this.repository.saveRetrospective(value, revision); return value;
  }
  async analyze(id: string, revision: number) {
    const existing = await this.retrospective(id);
    if (existing.revision !== revision) throw new AppError(409, "STALE_REVISION", "请刷新复盘");
    if (existing.analysis) return existing;
    const analysis = await this.agent.analyzeRetrospective(existing);
    const value = { ...existing, analysis, analysisProvider: this.agent.mode, revision: revision + 1, updatedAt: new Date().toISOString() };
    await this.repository.saveRetrospective(value, revision); return value;
  }
  async createContent(input: { account: ContentAccount; topic: string; contentType: ContentType; sourceRetrospectiveId: string | null; sourceContentId: string | null }) {
    if (input.sourceRetrospectiveId) {
      const retro = await this.retrospective(input.sourceRetrospectiveId);
      if (!retro.analysis || retro.analysis.contentPotential < CONTENT_POTENTIAL_THRESHOLD) throw new AppError(409, "MORE_DETAIL_REQUIRED", "请先补充并分析真实经历，内容潜力达到6分后再生产");
    }
    const now = new Date().toISOString();
    const state = await this.repository.snapshot();
    const previous = state.contents.find(x => x.id === input.sourceContentId), metric = previous ? latestMetrics(state).get(previous.id) : null;
    const experiment = previous && metric ? recommendNextExperiment(previous, metric, state) : null;
    const value = PublishedContentSchema.parse({ ...input, id: randomUUID(), revision: 0, title: input.topic.slice(0, 80), englishDraftId: null, createdAt: now, updatedAt: now, publishedAt: null, publishTime: null, status: "draft", writing: null, english: null, note: previous?.isDemo ? "策略来自合成 Demo，仅用于演示，不代表真实业绩证据。" : "", provider: this.agent.mode, isDemo: false, experiment });
    await this.repository.saveContent(value, null); return value;
  }
  async generate(id: string, revision: number) {
    const existing = await this.content(id);
    if (existing.revision !== revision) throw new AppError(409, "STALE_REVISION", "请刷新内容");
    if (existing.status !== "draft") return existing;
    let value: PublishedContent = { ...existing, revision: revision + 1, status: "review", updatedAt: new Date().toISOString() };
    if (existing.account === "english") {
      const result = await this.english.generate({ topic: existing.topic, tone: "日常" });
      if (!result.draft) throw new AppError(409, "TOPIC_EXISTS", "该主题已经生成过，请到英语工作流查看已有内容");
      value = { ...value, englishDraftId: result.draft.id, english: result.draft.writing, title: result.draft.writing.title, provider: result.draft.provider === "demo" ? "mock" : "deepseek" };
    } else if (existing.account === "emotion") {
      const theme = await this.pipelines.emotionAnalyzer.analyze({ content: existing.topic });
      const result = await this.pipelines.emotionGenerator.generate({ themes: [theme.data] });
      value = { ...value, provider: result.provider, title: result.data.recommendedTitle, writing: { title: result.data.recommendedTitle, body: result.data.body, tags: result.data.hashtags, corePoint: theme.data.reusableTheme, solution: "表达感受，不替读者作判断。", endingQuestion: result.data.endingQuestion ?? "哪一句说中了你的感受？" } };
    } else {
      if (!existing.sourceRetrospectiveId) throw new AppError(409, "RETROSPECTIVE_REQUIRED", "Growth 内容需要真实复盘来源；请先填写复盘");
      const writing = await this.agent.generateContentOpportunity(await this.retrospective(existing.sourceRetrospectiveId), existing.topic, existing.contentType, existing.experiment);
      value = { ...value, writing, title: writing.title };
    }
    value = PublishedContentSchema.parse(value);
    await this.repository.saveContent(value, revision); return value;
  }
  async review(id: string, input: Pick<PublishedContent, "writing" | "english" | "note"> & { revision: number; status: "review" | "ready" }) {
    const existing = await this.content(id);
    if (!["review", "ready"].includes(existing.status)) throw new AppError(409, "REVIEW_REQUIRED", "只有生成后的未发布稿件可编辑");
    const value = PublishedContentSchema.parse({ ...existing, ...input, title: (existing.account === "english" ? input.english?.title : input.writing?.title) ?? existing.title, revision: input.revision + 1, updatedAt: new Date().toISOString() });
    await this.repository.saveContent(value, input.revision); return value;
  }
  async publish(id: string, revision: number, publishTime: string) {
    const existing = await this.content(id);
    if (existing.status !== "ready") throw new AppError(409, "REVIEW_REQUIRED", "请先人工批准");
    if (Date.parse(publishTime) > Date.now()) throw new AppError(400, "FUTURE_PUBLICATION", "请填写实际已发布的时间");
    const value = PublishedContentSchema.parse({ ...existing, status: "published", revision: revision + 1, publishedAt: publishTime, publishTime, updatedAt: new Date().toISOString() });
    await this.repository.saveContent(value, revision); return value;
  }
}
