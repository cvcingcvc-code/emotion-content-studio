import { type ContentAccount, type Experiment, type GrowthLoopState, type PublishedContent } from "@emotion-studio/contracts";
import { activeStrategies } from "./strategy.js";

/** 已发布且已录入指标、且与本实验同账号同变量同取值的篇数。 */
export function countExperimentSamples(state: GrowthLoopState, content: PublishedContent) {
  const experiment = content.experiment;
  if (!experiment) return 0;
  const measured = new Set(state.metrics.map(x => x.contentId));
  return state.contents.filter(x => x.status === "published" && x.account === content.account &&
    x.experiment?.variable === experiment.variable && x.experiment?.variant === experiment.variant &&
    measured.has(x.id)).length;
}

/** 被人工否决过的实验取值。已否决的取值不得再被自动提议。 */
export function rejectedVariants(state: GrowthLoopState, account: ContentAccount) {
  return new Set(activeStrategies(state, account)
    .filter(x => x.category === "avoid" && x.key.startsWith("experiment:"))
    .map(x => `${x.key.slice("experiment:".length)}:${x.value}`));
}

export function isRejected(state: GrowthLoopState, account: ContentAccount, experiment: Pick<Experiment, "variable" | "variant">) {
  return rejectedVariants(state, account).has(`${experiment.variable}:${experiment.variant}`);
}

export function advanceExperiment(experiment: Experiment, samples: number, at: string): Experiment {
  if (experiment.status === "completed") return experiment;
  return {
    ...experiment, currentSamples: samples,
    status: samples <= 0 ? "running" : samples >= experiment.requiredSamples ? "evaluating" : "running",
    completedAt: null,
  };
}
