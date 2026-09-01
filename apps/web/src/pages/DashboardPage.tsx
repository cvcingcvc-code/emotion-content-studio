import { ArrowRight, BookOpenText, Heart, Inbox, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentDashboard } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState } from '../components/States';
import { apiRequest, useRemote } from '../lib/api';

const metricIcons = [Inbox, BookOpenText, Sparkles, Heart];

export default function DashboardPage() {
  const { mode, setMode } = usePreviewMode();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loadMessage, setLoadMessage] = useState('');
  const state = useRemote<ContentDashboard>('/api/v1/content-dashboard', mode, refreshKey);

  async function loadDemoData() {
    setLoadState('loading');
    try {
      const result = await apiRequest<{ loadedCount: number; totalCount: number }>('/api/v1/demo-data/load', mode, { method: 'POST' });
      setLoadMessage(`已载入 ${result.loadedCount} 条演示素材，当前共 ${result.totalCount} 条。`);
      setLoadState('success');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setLoadMessage(error instanceof Error ? error.message : '演示数据加载失败。');
      setLoadState('error');
    }
  }

  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefreshKey((value) => value + 1); }} />;

  const dashboard = state.data;
  const metrics = [
    { label: '今日素材', value: dashboard.todayCount, note: '本地 DEMO 今日新增' },
    { label: '总素材数', value: dashboard.totalCount, note: '已完成清洗与分析' },
    { label: '高共鸣素材', value: dashboard.highResonanceCount, note: '共鸣分数 ≥ 80' },
    { label: '已收藏素材', value: dashboard.favoriteCount, note: '可组合生成文案' },
  ];
  const maxEmotion = Math.max(1, ...dashboard.emotionDistribution.map((item) => item.count));
  const maxCategory = Math.max(1, ...dashboard.categoryDistribution.map((item) => item.count));
  const isEmpty = mode === 'empty' || dashboard.totalCount === 0;
  const isBlocked = mode === 'blocked';

  return (
    <>
      <div className="page-intro demo-dashboard-intro">
        <div className="page-intro-copy">
          <p className="kicker">FROM RAW TEXT TO A FIRST DRAFT</p>
          <h2>把情绪素材，变成可继续创作的内容。</h2>
          <p>一键载入原创演示数据，或从 CSV 开始。系统会自动清洗、模拟分析，再帮你组合成一份草稿。</p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" to="/import">导入 CSV</Link>
          <button className="primary-button" disabled={loadState === 'loading' || isBlocked} onClick={() => void loadDemoData()}>
            {loadState === 'loading' ? '正在载入…' : '加载演示数据'} <Sparkles size={15} />
          </button>
        </div>
      </div>

      {isBlocked ? <BlockedNotice title="当前为禁止操作演示" description="你仍可浏览统计，但暂时不能载入新数据。" /> : null}
      {loadState === 'success' ? <div className="action-notice is-success" role="status"><span>{loadMessage}</span><Link to="/library">查看素材库 <ArrowRight size={14} /></Link></div> : null}
      {loadState === 'error' ? <div className="action-notice is-error" role="alert"><span>{loadMessage}</span><button onClick={() => void loadDemoData()}>重试</button></div> : null}

      <section className="metric-grid" aria-label="素材概览">
        {metrics.map((metric, index) => {
          const Icon = metricIcons[index]!;
          return <article className="metric-card" key={metric.label}><header><span>{metric.label}</span><Icon size={17} strokeWidth={1.5} /></header><strong>{metric.value}</strong><p>{metric.note}</p></article>;
        })}
      </section>

      {isEmpty ? (
        <div className="dashboard-empty-wrap">
          <EmptyState title="素材库还是空的" description="点击“加载演示数据”可立即体验完整流程，也可以导入你自己的 CSV。" action="前往 CSV 导入" actionTo="/import" />
        </div>
      ) : (
        <div className="distribution-grid">
          <DistributionPanel title="情绪分布" description="MockAnalyzer 判断结果" values={dashboard.emotionDistribution} max={maxEmotion} />
          <DistributionPanel title="分类分布" description="当前素材的主题结构" values={dashboard.categoryDistribution} max={maxCategory} />
        </div>
      )}
    </>
  );
}

function DistributionPanel({ title, description, values, max }: { title: string; description: string; values: Array<{ label: string; count: number }>; max: number }) {
  return (
    <section>
      <div className="section-header"><div><h2>{title}</h2><p>{description}</p></div></div>
      <div className="panel distribution-panel">
        {values.map((item) => <div className="distribution-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} /></div><strong>{item.count}</strong></div>)}
      </div>
    </section>
  );
}
