import { ArrowRight, BookOpenText, Heart, Inbox, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ContentDashboardSchema,
  DemoDataLoadResultSchema,
  StudioDemoSeedResultSchema,
  type ContentDashboard,
} from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState } from '../components/States';
import { apiRequest, useRemote } from '../lib/api';
import { accountProfiles } from '../lib/accounts';
import './dashboard-workspace.css';

const metricIcons = [Inbox, BookOpenText, Sparkles, Heart];

export default function DashboardPage() {
  const { mode, setMode } = usePreviewMode();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loadMessage, setLoadMessage] = useState('');
  const state = useRemote<ContentDashboard>('/api/v1/content-dashboard', mode, ContentDashboardSchema, refreshKey);

  async function loadDemoData() {
    setLoadState('loading');
    try {
      const emotion = await apiRequest('/api/v1/demo-data/load', mode, DemoDataLoadResultSchema, { method: 'POST' });
      const studio = await apiRequest('/api/v1/studio/demo-seed/load', mode, StudioDemoSeedResultSchema, { method: 'POST' });
      setLoadMessage(`已载入 ${emotion.loadedCount + studio.loadedCount} 条三账号演示素材（成长 ${studio.byAccount.personal_growth}、英语 ${studio.byAccount.fun_english}、情绪 ${emotion.loadedCount}）。`);
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
    <div className="dashboard-workspace">
      <header className="dashboard-header">
        <h1>数据表现</h1>
        <p className="dashboard-subtitle">内容实验复盘台</p>
      </header>

      <section className="account-stats-grid account-entries" aria-label="三个账号工作区">{accountProfiles.map((account) => <Link className="panel account-entry" key={account.id} to={'/accounts/' + account.id}><p className="kicker">{account.displayName}</p><h2>{account.shortName}</h2><p>{account.description}</p><span className="text-button">进入工作区 <ArrowRight size={14} /></span></Link>)}</section>

      <div className="page-intro demo-dashboard-intro">
        <div className="page-intro-copy">
          <p className="kicker">从素材到文案</p>
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

      {/* 这篇内容表现如何 */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <h2 className="dashboard-section-title">这篇内容表现如何</h2>
            <p className="dashboard-section-description">核心指标概览</p>
          </div>
        </div>
        <div className="dashboard-metrics">
          {metrics.map((metric, index) => {
            const Icon = metricIcons[index]!;
            return (
              <div className="dashboard-metric" key={metric.label}>
                <div className="dashboard-metric-label">{metric.label}</div>
                <div className="dashboard-metric-value">{metric.value}</div>
                <div className="dashboard-metric-note">{metric.note}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 和历史内容相比 */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <h2 className="dashboard-section-title">和历史内容相比</h2>
            <p className="dashboard-section-description">与历史平均的对比分析</p>
          </div>
        </div>
        <div className="dashboard-comparison">
          <div className="dashboard-comparison-header">
            <h3 className="dashboard-comparison-title">内容表现对比</h3>
          </div>
          <div className="dashboard-comparison-items">
            <div className="dashboard-comparison-item">
              <span className="dashboard-comparison-label">浏览量</span>
              <div className="dashboard-comparison-value">
                <strong>12,450</strong>
                <span className="trend-up">↑ 15%</span>
              </div>
            </div>
            <div className="dashboard-comparison-item">
              <span className="dashboard-comparison-label">点赞数</span>
              <div className="dashboard-comparison-value">
                <strong>823</strong>
                <span className="trend-up">↑ 8%</span>
              </div>
            </div>
            <div className="dashboard-comparison-item">
              <span className="dashboard-comparison-label">收藏数</span>
              <div className="dashboard-comparison-value">
                <strong>156</strong>
                <span className="trend-down">↓ 3%</span>
              </div>
            </div>
            <div className="dashboard-comparison-item">
              <span className="dashboard-comparison-label">评论数</span>
              <div className="dashboard-comparison-value">
                <strong>89</strong>
                <span className="trend-up">↑ 22%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 下一轮怎么做 */}
      <section className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <h2 className="dashboard-section-title">下一轮怎么做</h2>
            <p className="dashboard-section-description">内容实验复盘结论</p>
          </div>
        </div>
        <div className="dashboard-experiments">
          <div className="dashboard-experiment">
            <div className="dashboard-experiment-header">
              <div className="dashboard-experiment-icon keep">
                <BookOpenText size={16} />
              </div>
              <h3 className="dashboard-experiment-title">KEEP</h3>
            </div>
            <div className="dashboard-experiment-content">
              <p>继续保留真实经历作为内容核心</p>
              <p>保持个人成长主题的深度分析</p>
              <p>维持情感共鸣的叙事方式</p>
            </div>
          </div>

          <div className="dashboard-experiment">
            <div className="dashboard-experiment-header">
              <div className="dashboard-experiment-icon change">
                <Sparkles size={16} />
              </div>
              <h3 className="dashboard-experiment-title">CHANGE</h3>
            </div>
            <div className="dashboard-experiment-content">
              <p>下一篇要改什么</p>
              <p>增加互动性元素，提高用户参与度</p>
              <p>优化标题结构，提升点击率</p>
            </div>
          </div>

          <div className="dashboard-experiment">
            <div className="dashboard-experiment-header">
              <div className="dashboard-experiment-icon next">
                <ArrowRight size={16} />
              </div>
              <h3 className="dashboard-experiment-title">NEXT EXPERIMENT</h3>
            </div>
            <div className="dashboard-experiment-content">
              <p>下一篇具体测试什么</p>
              <p>测试不同发布时间对互动率的影响</p>
              <p>尝试新的内容格式，如问答式结构</p>
            </div>
          </div>
        </div>
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
    </div>
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
