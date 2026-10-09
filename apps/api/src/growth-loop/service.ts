import { randomUUID } from "node:crypto";
import { CONTENT_POTENTIAL_THRESHOLD, ContentMetricsSchema, ExperimentSchema, PublishedContentSchema, RetrospectiveSchema, StrategyEntrySchema, type ExperimentOutcome, type MetricsInput, type RetrospectiveInput, type ContentAccount, type ContentType, type PublishedContent, type RejectReason } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";
import type { EnglishWorkflow } from "../english/workflow.js";
import type { PipelineRegistry } from "../studio/pipelines/types.js";
import type { GrowthLoopRepository } from "./repository.js";
import { GrowthLoopAgent } from "./provider.js";
import { recommendNextExperiment } from "./feedback.js";
import { latestMetrics } from "./metrics.js";
import { advanceExperiment, countExperimentSamples } from "./experiment.js";
import { applyStrategy } from "./strategy.js";
import { buildGenerationContext } from "./generation-context.js";
import { detectPreferenceSignal, preferenceProposals, rejectStrategyProposal } from "./preference.js";

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
    const { analysis, provider } = await this.agent.analyzeRetrospectiveResult(existing);
    const value = { ...existing, analysis, analysisProvider: provider, revision: revision + 1, updatedAt: new Date().toISOString() };
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
    if (previous?.isDemo) throw new AppError(409, "DEMO_SOURCE_NOT_ALLOWED", "演示内容不能作为真实内容的上一轮来源，请选择真实内容或从新的复盘开始。");
    const experiment = previous && metric ? recommendNextExperiment(previous, metric, state) : null;
    const value = PublishedContentSchema.parse({ ...input, id: randomUUID(), revision: 0, title: input.topic.slice(0, 80), englishDraftId: null, createdAt: now, updatedAt: now, publishedAt: null, publishTime: null, status: "draft", writing: null, english: null, note: "", provider: this.agent.mode, isDemo: false, experiment });
    await this.repository.saveContent(value, null); return value;
  }
  async generate(id: string, revision: number) {
    const existing = await this.content(id);
    if (existing.revision !== revision) throw new AppError(409, "STALE_REVISION", "请刷新内容");
    if (existing.status !== "draft") return existing;
    // 旧版本可能已创建指向 Demo 的真实草稿；保留原稿，但不能继续注入演示实验。
    if (!existing.isDemo && existing.sourceContentId && (await this.content(existing.sourceContentId)).isDemo) {
      throw new AppError(409, "DEMO_SOURCE_NOT_ALLOWED", "演示内容不能作为真实内容的上一轮来源，请选择真实内容或从新的复盘开始。");
    }
    let value: PublishedContent = { ...existing, revision: revision + 1, status: "review", updatedAt: new Date().toISOString() };
    if (existing.account === "english") {
      const result = await this.english.generate({ topic: existing.topic, tone: "日常" });
      if (!result.draft) throw new AppError(409, "TOPIC_EXISTS", "该主题已经生成过，请到英语工作流查看已有内容");
      value = { ...value, englishDraftId: result.draft.id, english: result.draft.writing, title: result.draft.writing.title, provider: result.draft.provider === "demo" ? "mock" : result.draft.provider };
    } else if (existing.account === "emotion") {
      const theme = await this.pipelines.emotionAnalyzer.analyze({ content: existing.topic });
      const result = await this.pipelines.emotionGenerator.generate({ themes: [theme.data] });
      value = { ...value, provider: result.provider, title: result.data.recommendedTitle, writing: { title: result.data.recommendedTitle, body: result.data.body, tags: result.data.hashtags, corePoint: theme.data.reusableTheme, solution: "表达感受，不替读者作判断。", endingQuestion: result.data.endingQuestion ?? "哪一句说中了你的感受？" } };
    } else {
      if (!existing.sourceRetrospectiveId) throw new AppError(409, "RETROSPECTIVE_REQUIRED", "Growth 内容需要真实复盘来源；请先填写复盘");
      const state = await this.repository.snapshot();
      const context = buildGenerationContext({
        state, account: existing.account, retro: await this.retrospective(existing.sourceRetrospectiveId),
        experiment: existing.experiment, topic: existing.topic, contentType: existing.contentType,
        // 直接上游 + 真实/演示性质：决定上一轮 feedback 能不能进入本轮生成。
        sourceContentId: existing.sourceContentId, isDemo: existing.isDemo,
      });
      const { writing, debug } = await this.agent.generateContentOpportunity(context);
      value = { ...value, writing, title: writing.title, debug, provider: debug.provider };
    }
    if (value.experiment) {
      const samples = countExperimentSamples(await this.repository.snapshot(), value);
      value = { ...value, experiment: ExperimentSchema.parse(advanceExperiment(value.experiment, samples, new Date().toISOString())) };
    }
    // PHASE G：留存 AI 原稿，review 阶段才有可与其对比的人工修改基准。
    value = PublishedContentSchema.parse({ ...value, aiDraft: value.writing });
    await this.repository.saveContent(value, revision); return value;
  }
  async review(id: string, input: Pick<PublishedContent, "writing" | "english" | "note"> & { revision: number; status: "review" | "ready" }) {
    const existing = await this.content(id);
    if (!["review", "ready"].includes(existing.status)) throw new AppError(409, "REVIEW_REQUIRED", "只有生成后的未发布稿件可编辑");
    // PHASE G：对比 AI 原稿与人工修改稿，记录「人真的改了什么」。
    const signal = existing.account !== "english" && input.writing ? detectPreferenceSignal(existing.aiDraft, input.writing) : null;
    const value = PublishedContentSchema.parse({ ...existing, ...input, preferenceSignal: signal ?? existing.preferenceSignal, title: (existing.account === "english" ? input.english?.title : input.writing?.title) ?? existing.title, revision: input.revision + 1, updatedAt: new Date().toISOString() });
    await this.repository.saveContent(value, input.revision);
    // 人工修改只算弱信号：watch + LOW，一次修改不得升级为长期策略。
    if (signal) {
      const proposals = preferenceProposals(signal);
      if (proposals.length) {
        const state = await this.repository.snapshot();
        let strategies = state.strategies;
        for (const proposal of proposals) {
          strategies = applyStrategy({ ...state, strategies }, { account: value.account, key: proposal.key, value: proposal.value, category: "watch", source: "human_edit", confidence: "LOW" }).strategies;
        }
        await this.repository.saveStrategies(strategies);
      }
    }
    return value;
  }
  async publish(id: string, revision: number, publishTime: string) {
    const existing = await this.content(id);
    if (existing.status !== "ready") throw new AppError(409, "REVIEW_REQUIRED", "请先人工批准");
    if (Date.parse(publishTime) > Date.now()) throw new AppError(400, "FUTURE_PUBLICATION", "请填写实际已发布的时间");
    const value = PublishedContentSchema.parse({ ...existing, status: "published", revision: revision + 1, publishedAt: publishTime, publishTime, updatedAt: new Date().toISOString() });
    await this.repository.saveContent(value, revision); return value;
  }
  /** 录入指标，并推进本篇实验的采样进度。 */
  async recordMetrics(contentId: string, input: MetricsInput) {
    const existing = await this.content(contentId);
    const capturedAt = new Date().toISOString();
    const hours = existing.publishedAt ? (Date.parse(capturedAt) - Date.parse(existing.publishedAt)) / 3_600_000 : null;
    const value = ContentMetricsSchema.parse({
      ...input, id: randomUUID(), contentId, capturedAt,
      hoursSincePublish: hours !== null && Number.isFinite(hours) && hours >= 0 ? hours : null,
    });
    await this.repository.addMetrics(value);
    if (existing.experiment && existing.status === "published") {
      const state = await this.repository.snapshot();
      const current = state.contents.find(x => x.id === contentId)!;
      const at = new Date().toISOString();
      const next = PublishedContentSchema.parse({
        ...current, revision: current.revision + 1, updatedAt: at,
        experiment: ExperimentSchema.parse(advanceExperiment(current.experiment!, countExperimentSamples(state, current), at)),
      });
      await this.repository.saveContent(next, current.revision);
    }
    return value;
  }
  /**
   * 结束一轮实验并做出决定。
   * 证据不足时 promotion 会被拒绝（INSUFFICIENT_EVIDENCE），只能留在 WATCH。
   */
  async decideExperiment(contentId: string, revision: number, outcome: ExperimentOutcome) {
    const existing = await this.content(contentId);
    if (existing.revision !== revision) throw new AppError(409, "STALE_REVISION", "请刷新内容");
    const experiment = existing.experiment;
    if (!experiment) throw new AppError(409, "NO_EXPERIMENT", "本篇没有实验计划");
    if (experiment.status === "completed") throw new AppError(409, "EXPERIMENT_COMPLETED", "该实验已经结束");
    const state = await this.repository.snapshot();
    const samples = countExperimentSamples(state, existing);
    if (outcome === "promote_to_strategy" && samples < experiment.requiredSamples) throw new AppError(409, "INSUFFICIENT_EVIDENCE", `证据不足（${samples}/${experiment.requiredSamples}）：只能 WATCH，不能升级为长期策略`);
    const at = new Date().toISOString();
    const result = outcome === "promote_to_strategy"
      ? `样本 ${samples}/${experiment.requiredSamples} 达标，观察到的差异支持该假设；这是观察结论，不证明因果。`
      : outcome === "continue_testing" ? `样本 ${samples}/${experiment.requiredSamples}，证据不足，继续累积后再判断。`
        : `该取值已被否决（${samples}/${experiment.requiredSamples}），不再影响后续生成。`;
    // continue_testing 不结束实验：保持 running / evaluating、completedAt 归空。
    // 若在这里写 completed，上方 EXPERIMENT_COMPLETED 守卫会让「继续测试」这个选项彻底不可用。
    const nextExperiment = outcome === "continue_testing"
      ? ExperimentSchema.parse({ ...advanceExperiment(experiment, samples, at), result, confidence: "LOW" })
      : ExperimentSchema.parse({ ...experiment, status: "completed", completedAt: at, currentSamples: samples, result, confidence: outcome === "promote_to_strategy" ? "MEDIUM" : "LOW" });
    const value = PublishedContentSchema.parse({
      ...existing, revision: revision + 1, updatedAt: at,
      experiment: nextExperiment,
    });
    await this.repository.saveContent(value, revision);
    const applied = applyStrategy(state, {
      account: existing.account, key: `experiment:${experiment.variable}`, value: experiment.variant,
      category: outcome === "promote_to_strategy" ? "works" : outcome === "continue_testing" ? "watch" : "avoid",
      source: "experiment", confidence: outcome === "promote_to_strategy" ? "MEDIUM" : "LOW", at,
    });
    const entry = applied.entry.evidenceCount >= 2 && applied.entry.category === "works" ? StrategyEntrySchema.parse({ ...applied.entry, confidence: "HIGH" }) : applied.entry;
    await this.repository.saveStrategies(applied.strategies.map(x => x.id === entry.id ? entry : x));
    return value;
  }
  /**
   * 人工拒绝一篇内容。拒绝本身就是学习信号：
   * 写入 avoid 类策略（factually_wrong 为 HIGH 强信号），且被拒内容不会进入任何指标口径
   * （仓储要求 status==="published" 才能录指标，历史比较也只取 published）。
   */
  async reject(id: string, revision: number, reason: RejectReason) {
    const existing = await this.content(id);
    if (existing.revision !== revision) throw new AppError(409, "STALE_REVISION", "请刷新内容");
    if (existing.status === "published") throw new AppError(409, "ALREADY_PUBLISHED", "已发布内容不能标记为拒绝");
    if (existing.status === "rejected") return existing;
    const at = new Date().toISOString();
    const value = PublishedContentSchema.parse({
      ...existing, status: "rejected", rejectedAt: at, rejectReason: reason, revision: revision + 1, updatedAt: at,
    });
    await this.repository.saveContent(value, revision);
    const proposal = rejectStrategyProposal(reason);
    const state = await this.repository.snapshot();
    const applied = applyStrategy(state, {
      account: existing.account, key: proposal.key, value: proposal.value,
      category: proposal.category, source: "reject", confidence: proposal.confidence, at,
    });
    await this.repository.saveStrategies(applied.strategies);
    return value;
  }
}
