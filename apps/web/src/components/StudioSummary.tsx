import { BarChart3, BookOpenText, Heart, Send } from 'lucide-react';
import type { AccountDashboard } from '@emotion-studio/contracts';

function formatRate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function StudioSummary({ dashboard }: { dashboard: AccountDashboard }) {
  const cards = [
    { label: '素材数', value: dashboard.materialCount.toLocaleString('zh-CN'), note: '当前账号已保存', icon: BookOpenText },
    { label: '收藏', value: dashboard.favoriteCount.toLocaleString('zh-CN'), note: '可继续组合创作', icon: Heart },
    { label: '已发布', value: dashboard.performance.publishedCount.toLocaleString('zh-CN'), note: dashboard.performance.insufficientSample ? '样本不足' : '已进入数据复盘', icon: Send },
    { label: '平均点赞率', value: formatRate(dashboard.performance.averageLikeRate), note: dashboard.performance.insufficientSample ? '至少 10 篇后再解读' : '按曝光计算', icon: BarChart3 },
  ];

  return (
    <section className="metric-grid studio-metrics" aria-label="账号概览">
      {cards.map(({ label, value, note, icon: Icon }) => (
        <article className="metric-card" key={label}>
          <header><span>{label}</span><Icon size={17} strokeWidth={1.5} /></header>
          <strong>{value}</strong>
          <p>{note}</p>
        </article>
      ))}
    </section>
  );
}
