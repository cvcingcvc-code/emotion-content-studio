import type { ContentMetrics, ContentRates, GrowthLoopState, HistoricalComparison, PublishedContent, RelativePerformance } from "@emotion-studio/contracts";

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
/** 中位数：单篇爆款不应该拉偏整条基线。 */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? null;
  const low = sorted[mid - 1], high = sorted[mid];
  return low === undefined || high === undefined ? null : (low + high) / 2;
}
export function hoursSincePublish(content: PublishedContent, metric: ContentMetrics) {
  if (!content.publishedAt) return null;
  const hours = (Date.parse(metric.capturedAt) - Date.parse(content.publishedAt)) / 3_600_000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}
/** 观察窗口分桶。不同窗口的数据不能直接比较。 */
export function windowBucket(hours: number | null): RelativePerformance["bucket"] {
  if (hours === null) return "unknown";
  if (hours <= 36) return "24h";
  if (hours <= 108) return "72h";
  return "later";
}
const RELATIVE_BASELINE_SIZE = 10;
/** 相对表现：当前篇 vs 同账号、同窗口、同性质（真实/演示）的历史 median。 */
export function relativePerformance(current: PublishedContent, metric: ContentMetrics, state: GrowthLoopState): RelativePerformance {
  const hours = hoursSincePublish(current, metric), bucket = windowBucket(hours);
  const metrics = latestMetrics(state, metric.capturedAt);
  const baseline = state.contents
    .filter(item => item.id !== current.id && item.status === "published" && item.isDemo === current.isDemo &&
      !!item.publishedAt && item.publishedAt < (current.publishedAt ?? "") && metrics.has(item.id))
    .map(item => ({ item, metric: metrics.get(item.id)! }))
    .filter(row => windowBucket(hoursSincePublish(row.item, row.metric)) === bucket)
    .sort((a, b) => b.item.publishedAt!.localeCompare(a.item.publishedAt!) || b.item.id.localeCompare(a.item.id))
    .slice(0, RELATIVE_BASELINE_SIZE);
  const medianViews = median(baseline.map(row => row.metric.views));
  const medianLikes = median(baseline.map(row => row.metric.likes));
  const medianFavorites = median(baseline.map(row => row.metric.favorites));
  const medianComments = median(baseline.map(row => row.metric.comments));
  const relative = (value: number, base: number | null) => base === null || base === 0 ? null : (value - base) / base;
  return {
    bucket, sampleCount: baseline.length, medianViews, medianLikes, medianFavorites, medianComments,
    relativeViews: relative(metric.views, medianViews), relativeLikes: relative(metric.likes, medianLikes),
    relativeSaves: relative(metric.favorites, medianFavorites), relativeComments: relative(metric.comments, medianComments),
    comparable: baseline.length >= 3,
  };
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
export function medianMetrics(items: PublishedContent[], metrics: Map<string, ContentMetrics>): HistoricalComparison {
  const rows = items.flatMap((item) => { const metric = metrics.get(item.id); return metric ? [{ item, metric, rates: calculateRates(metric) }] : []; });
  const rated = rows.filter((row) => row.metric.views > 0);
  return {
    sampleCount: rows.length, rateSampleCount: rated.length, contentIds: rows.map((row) => row.item.id),
    avgViews: median(rows.map((row) => row.metric.views)),
    avgLikeRate: median(rated.map((row) => row.rates.likeRate!)),
    avgFavoriteRate: median(rated.map((row) => row.rates.favoriteRate!)),
    avgCommentRate: median(rated.map((row) => row.rates.commentRate!)),
    avgFollowConversionRate: median(rated.map((row) => row.rates.followConversionRate!)),
  };
}
export function historicalComparison(current: PublishedContent, metric: ContentMetrics, state: GrowthLoopState) {
  const metrics = latestMetrics(state, metric.capturedAt);
  const prior = state.contents.filter((item) => item.id !== current.id && item.status === "published" &&
    item.isDemo === current.isDemo && !!item.publishedAt && item.publishedAt < (current.publishedAt ?? "") && metrics.has(item.id))
    .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || b.id.localeCompare(a.id));
  return {
    recent3: medianMetrics(prior.slice(0, 3), metrics),
    recent7: medianMetrics(prior.slice(0, 7), metrics),
    sameAccount: medianMetrics(prior.filter((item) => item.account === current.account).slice(0, 7), metrics),
    sameContentType: medianMetrics(prior.filter((item) => item.account === current.account && item.contentType === current.contentType).slice(0, 7), metrics),
  };
}
