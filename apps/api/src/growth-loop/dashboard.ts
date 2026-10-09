import { CONTENT_POTENTIAL_THRESHOLD, GrowthDashboardSchema, type GrowthLoopState } from "@emotion-studio/contracts";
import { latestMetrics } from "./metrics.js";
import { recommendEffortDirection } from "./feedback.js";

export function localDate(instant: string) { return new Date(Date.parse(instant) + 8 * 3600_000).toISOString().slice(0, 10); }
export function dashboard(state: GrowthLoopState, mode: "mock" | "deepseek", repository: "memory" | "database" | "sqlite", now = new Date().toISOString()) {
  const today = localDate(now), yesterday = localDate(new Date(Date.parse(now) - 86400_000).toISOString());
  const yesterdayPosts = state.contents.filter(x => x.status === "published" && !x.isDemo && localDate(x.publishedAt!) === yesterday);
  const metrics = latestMetrics(state), observed = yesterdayPosts.flatMap(x => metrics.get(x.id) ? [metrics.get(x.id)!] : []);
  // 首页下一篇入口只使用真实证据；没有真实指标时不回退到合成 Demo。
  const realContents = state.contents.filter(x => !x.isDemo);
  const realIds = new Set(realContents.map(x => x.id));
  const realState = { ...state, contents: realContents, metrics: state.metrics.filter(x => realIds.has(x.contentId)), feedback: state.feedback.filter(x => realIds.has(x.contentId)) };
  return GrowthDashboardSchema.parse({ today, mode, repository,
    retrospectiveDone: state.retrospectives.some(x => x.date === today),
    contentOpportunities: state.retrospectives.filter(x => x.date === today && (x.analysis?.contentPotential ?? 0) >= CONTENT_POTENTIAL_THRESHOLD).length,
    readyToPublish: state.contents.filter(x => x.status === "ready" && !x.isDemo).length,
    yesterday: { count: yesterdayPosts.length, views: observed.reduce((sum, x) => sum + x.views, 0), metricsCount: observed.length },
    focus: recommendEffortDirection(realState),
  });
}
