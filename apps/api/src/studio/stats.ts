import {
  ACCOUNT_PROFILES,
  AccountDashboardSchema,
  type ContentItem,
  type PostRecord,
  type PerformanceSummary,
} from "@emotion-studio/contracts";

export function summarizePerformance(posts: PostRecord[]): PerformanceSummary {
  const published = posts.filter((post) => post.status === "published");
  const views = published.flatMap((post) => post.performance?.views !== null && post.performance?.views !== undefined ? [post.performance.views] : []);
  const rate = (key: "likes" | "favorites" | "comments") => {
    const rates = published.flatMap(({ performance }) => performance && performance.views !== null &&
      performance.views > 0 && performance[key] !== null ? [performance[key] / performance.views] : []);
    return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : null;
  };
  const sampleCount = published.filter((post) => post.performance?.views !== undefined && post.performance.views !== null && post.performance.views > 0).length;
  return {
    publishedCount: published.length,
    totalViews: views.length ? views.reduce((sum, value) => sum + value, 0) : null,
    averageLikeRate: rate("likes"), averageFavoriteRate: rate("favorites"), averageCommentRate: rate("comments"),
    sampleCount, insufficientSample: sampleCount < 10,
  };
}

function distribution(values: Array<string | null>) {
  const counts = new Map<string, number>();
  values.forEach((value) => { if (value) counts.set(value, (counts.get(value) ?? 0) + 1); });
  return Array.from(counts, ([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count);
}

export function studioDashboard(items: ContentItem[], posts: PostRecord[]) {
  return ACCOUNT_PROFILES.map((account) => {
    const materials = items.filter((item) => item.accountId === account.id);
    const records = posts.filter((post) => post.accountId === account.id);
    return AccountDashboardSchema.parse({
      accountId: account.id, materialCount: materials.length,
      favoriteCount: materials.filter((item) => item.isFavorite).length,
      emotionDistribution: distribution(materials.map((item) => item.emotion)),
      themeDistribution: distribution(materials.map((item) => item.theme)),
      performance: summarizePerformance(records),
      lanes: Array.from(new Set(records.map((post) => post.contentLane))).map((contentLane) => ({
        contentLane, performance: summarizePerformance(records.filter((post) => post.contentLane === contentLane)),
      })),
    });
  });
}
