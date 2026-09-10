import { CONTENT_POTENTIAL_THRESHOLD, GrowthDashboardSchema, type GrowthLoopState } from "@emotion-studio/contracts";
import { latestMetrics } from "./metrics.js";
import { recommendEffortDirection } from "./feedback.js";

export function localDate(instant: string) { return new Date(Date.parse(instant) + 8 * 3600_000).toISOString().slice(0, 10); }
export function dashboard(state: GrowthLoopState, mode: "mock" | "deepseek", repository: "memory" | "database", now = new Date().toISOString()) {
  const today = localDate(now), yesterday = localDate(new Date(Date.parse(now) - 86400_000).toISOString());
  const yesterdayPosts = state.contents.filter(x => x.status === "published" && !x.isDemo && localDate(x.publishedAt!) === yesterday);
  const metrics = latestMetrics(state), observed = yesterdayPosts.flatMap(x => metrics.get(x.id) ? [metrics.get(x.id)!] : []);
  return GrowthDashboardSchema.parse({ today, mode, repository,
    retrospectiveDone: state.retrospectives.some(x => x.date === today),
    contentOpportunities: state.retrospectives.filter(x => x.date === today && (x.analysis?.contentPotential ?? 0) >= CONTENT_POTENTIAL_THRESHOLD).length,
    readyToPublish: state.contents.filter(x => x.status === "ready" && !x.isDemo).length,
    yesterday: { count: yesterdayPosts.length, views: observed.reduce((sum, x) => sum + x.views, 0), metricsCount: observed.length },
    focus: recommendEffortDirection(state),
  });
}
