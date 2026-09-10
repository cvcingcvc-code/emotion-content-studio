import type { ContentMetrics, ContentRates, GrowthLoopState, HistoricalComparison, PublishedContent } from "@emotion-studio/contracts";

export function calculateRates(metric: Pick<ContentMetrics, "views" | "likes" | "favorites" | "comments" | "followersGained">): ContentRates {
  const divide = (value: number) => metric.views === 0 ? null : value / metric.views;
  return { likeRate: divide(metric.likes), favoriteRate: divide(metric.favorites), commentRate: divide(metric.comments),
    engagementRate: divide(metric.likes + metric.favorites + metric.comments), followConversionRate: divide(metric.followersGained) };
}
export function latestMetrics(state: GrowthLoopState, at = "9999-12-31T23:59:59.999Z"): Map<string, ContentMetrics> {
  const map = new Map<string, ContentMetrics>();
  for (const metric of [...state.metrics].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))) {
    if (metric.capturedAt <= at) map.set(metric.contentId, metric);
  }
  return map;
}
export function averageMetrics(items: PublishedContent[], metrics: Map<string, ContentMetrics>): HistoricalComparison {
  const rows = items.flatMap((item) => { const metric = metrics.get(item.id); return metric ? [{ item, metric, rates: calculateRates(metric) }] : []; });
  const rated = rows.filter((row) => row.metric.views > 0);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    sampleCount: rows.length, rateSampleCount: rated.length, contentIds: rows.map((row) => row.item.id),
    avgViews: mean(rows.map((row) => row.metric.views)),
    avgLikeRate: mean(rated.map((row) => row.rates.likeRate!)),
    avgFavoriteRate: mean(rated.map((row) => row.rates.favoriteRate!)),
    avgCommentRate: mean(rated.map((row) => row.rates.commentRate!)),
    avgFollowConversionRate: mean(rated.map((row) => row.rates.followConversionRate!)),
  };
}
export function historicalComparison(current: PublishedContent, metric: ContentMetrics, state: GrowthLoopState) {
  const metrics = latestMetrics(state, metric.capturedAt);
  const prior = state.contents.filter((item) => item.id !== current.id && item.status === "published" &&
    item.isDemo === current.isDemo && item.publishedAt! < current.publishedAt! && metrics.has(item.id))
    .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || b.id.localeCompare(a.id));
  return {
    recent3: averageMetrics(prior.slice(0, 3), metrics),
    recent7: averageMetrics(prior.slice(0, 7), metrics),
    sameAccount: averageMetrics(prior.filter((item) => item.account === current.account).slice(0, 7), metrics),
    sameContentType: averageMetrics(prior.filter((item) => item.account === current.account && item.contentType === current.contentType).slice(0, 7), metrics),
  };
}
