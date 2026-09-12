import { activeStrategies, strategyContext, strategyPrompt } from "./strategy.js";
import { learningLines, learningPrompt, selectLearnings } from "./learning.js";
import { type ContentAccount, type ContentType, type Experiment, type FeedbackUsed, type GenerationDebug, type GrowthLoopState, type Retrospective } from "@emotion-studio/contracts";

/** v3：生成上下文开始真正读取上一轮的 ContentFeedback（KEEP / CHANGE / NEXT_EXPERIMENT）。 */
export const GROWTH_PROMPT_VERSION = "growth-loop.v3";

/** 语气类硬约束：avoid 策略命中时由代码真实改写文本，而不是只写进 prompt。 */
export const STRATEGY_FILTERS = [
  { key: /戏剧|夸张|标题党|博眼球/, label: "去除夸张用语与感叹号堆叠" },
] as const;

const DRAMA_PHRASES = ["震惊", "必看", "全网", "绝对", "100%", "必须点开", "不看后悔", "炸裂", "逆天"];

type DramaText = { title: string; body: string; solution: string; endingQuestion: string };

export function stripDrama<T extends DramaText>(writing: T): T {
  const clean = (value: string) => {
    let next = value;
    for (const phrase of DRAMA_PHRASES) next = next.split(phrase).join("");
    return next.replace(/！{1,}/g, "。").replace(/!{1,}/g, ".").replace(/。{2,}/g, "。");
  };
  return { ...writing, title: clean(writing.title), body: clean(writing.body), solution: clean(writing.solution), endingQuestion: clean(writing.endingQuestion) };
}

/** 显式用户偏好：来自人工修改与拒绝，而不是模型推断。 */
export function userPreferences(state: GrowthLoopState, account: ContentAccount) {
  return activeStrategies(state, account).filter(x => x.source === "human_edit" || x.source === "reject");
}

export interface GrowthGenerationContext {
  account: ContentAccount;
  topic: string;
  contentType: ContentType;
  retro: Retrospective;
  facts: string[];
  interpretations: string[];
  strategy: ReturnType<typeof strategyContext>;
  userPreferences: string[];
  /** FEEDBACK / LEARNINGS 分区：已按账号、性质、时间窗口筛选并限流。 */
  learnings: FeedbackUsed[];
  experiment: Experiment | null;
  promptVersion: string;
  strategyText: string;
  learningText: string;
  generationRules: string[];
}

export function buildGenerationContext(input: {
  state: GrowthLoopState; account: ContentAccount; retro: Retrospective; experiment: Experiment | null;
  topic: string; contentType: ContentType;
  /** 这两项决定「上一轮」是谁：直接上游内容 + 真实/演示性质。缺省即不读取任何历史学习。 */
  sourceContentId?: string | null; isDemo?: boolean; now?: string;
}): GrowthGenerationContext {
  const analysis = input.retro.analysis;
  const preferences = userPreferences(input.state, input.account).map(x => x.value);
  const learnings = learningLines(input.state, selectLearnings({
    state: input.state, account: input.account, isDemo: input.isDemo ?? false,
    sourceContentId: input.sourceContentId ?? null, ...(input.now ? { now: input.now } : {}),
  }));
  return {
    account: input.account,
    topic: input.topic,
    contentType: input.contentType,
    retro: input.retro,
    facts: analysis?.facts ?? [],
    interpretations: analysis?.interpretations ?? [],
    strategy: strategyContext(input.state, input.account),
    userPreferences: preferences,
    learnings,
    experiment: input.experiment,
    promptVersion: GROWTH_PROMPT_VERSION,
    strategyText: strategyPrompt(input.state, input.account),
    learningText: learningPrompt(learnings),
    generationRules: [
      "只引用 facts 里的真实经历，禁止补造对话、金额、人物、时间或成功结果。",
      "interpretations 是推断，只能在正文里以「我现在的判断」出现，不得写成已发生的事。",
      "建议必须明确标为下一次计划，不伪装成已完成的结果。",
      "本轮唯一变量由 current experiment 决定，其余写作维度保持不变。",
      "没有 experiment 时不得自行发明实验，也不要声称在做对比。",
      "上一轮 feedback 里只有 KEEP / CHANGE 是结论：KEEP 的写法可以沿用，CHANGE 指出的问题必须调整；WATCH 与证据不足的条目不得当成结论。",
      "上一轮实验的结论是观察结果，不得写成因果，也不得声称已经验证。",
    ],
  };
}

/** 供 Debug 使用的最终上下文快照。 */
export function contextSnapshot(context: GrowthGenerationContext): string {
  return [
    `account=${context.account}`,
    `facts=${context.facts.length}`,
    `interpretations=${context.interpretations.length}`,
    `strategy=${JSON.stringify(context.strategy)}`,
    `userPreferences=${JSON.stringify(context.userPreferences)}`,
    `learnings=${context.learnings.length}`,
    `experiment=${context.experiment ? `${context.experiment.variable}=${context.experiment.variant}(${context.experiment.status})` : "none"}`,
    `promptVersion=${context.promptVersion}`,
  ].join(" | ");
}

export function buildDebug(context: GrowthGenerationContext, provider: GenerationDebug["provider"], model: string | null, constraints: string[]): GenerationDebug {
  return {
    promptVersion: context.promptVersion, provider, model,
    factsUsed: context.facts, interpretationsUsed: context.interpretations,
    strategyUsed: [...context.strategy.works, ...context.strategy.avoid, ...context.strategy.testing, ...context.strategy.watch, ...context.strategy.unknown].slice(0, 30),
    experimentUsed: context.experiment ? `${context.experiment.variable}=${context.experiment.variant}` : null,
    userPreferenceUsed: context.userPreferences,
    feedbackUsed: context.learnings,
    constraintsApplied: constraints,
    finalGenerationContext: contextSnapshot(context),
  };
}
