import { ArrowRight, BookOpen, CircleAlert, FileCheck2, Inbox, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Dashboard } from '@emotion-studio/contracts';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { usePreviewMode } from '../components/AppShell';
import { useRemote } from '../lib/api';

const metricIcons = [Inbox, BookOpen, Sparkles, FileCheck2];

export default function DashboardPage() {
  const { mode, setMode } = usePreviewMode();
  const state = useRemote<Dashboard>('/api/v1/dashboard', mode);

  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setMode('normal')} />;

  const { metrics, recentInspirations, alerts } = state.data;
  if (mode === 'empty' || recentInspirations.length === 0) {
    return (
      <>
        <div className="page-intro"><div className="page-intro-copy"><p className="kicker">FIRST EDITION</p><h2>把第一批素材，变成值得留下的表达。</h2><p>从一份只含 text 字段的 CSV 开始。来源与授权信息会在导入时补齐。</p></div></div>
        <EmptyState title="编辑台还是空的" description="导入第一份原创或已获许可的素材后，审核任务、灵感和视频进度会出现在这里。" action="导入第一份 CSV" actionTo="/import" />
      </>
    );
  }

  const metricValues = [metrics.pendingReview, metrics.inspirations, metrics.drafts, metrics.exports];
  const metricLabels = ['等待审核', '可用灵感', '文案草稿', '已导出视频'];
  const metricNotes = ['逐条检查来源与内容风险', '本周新增 8 条', `${metrics.drafts} 条等待人工确认`, `目标 ${metrics.targetExports} 条`];
  const longPreview = ' 有些事情不必在当天得到结论，先把感受放回具体的生活，再用更诚实的句子重新理解它。';

  return (
    <>
      <div className="page-intro">
        <div className="page-intro-copy">
          <p className="kicker">MONDAY · 24 AUG</p>
          <h2>今天，从一条真正有感觉的文案开始。</h2>
          <p>把授权素材变成原创表达，再用固定模板快速完成一支竖屏视频。每一步都保留人工判断。</p>
        </div>
        <div className="button-row"><Link className="secondary-button" to="/review">继续审核</Link><Link className="primary-button" to="/import">导入素材 <ArrowRight size={15} /></Link></div>
      </div>

      {mode === 'blocked' ? <BlockedNotice title="部分内容已暂停" description="3 条仅供研究的素材不会进入生成与导出流程，其余工作不受影响。" /> : null}

      <section className="metric-grid" aria-label="内容进度概览">
        {metricValues.map((value, index) => {
          const Icon = metricIcons[index]!;
          return <article className="metric-card" key={metricLabels[index]}><header><span>{metricLabels[index]}</span><Icon size={17} strokeWidth={1.5} /></header><strong>{value.toString().padStart(2, '0')}</strong><p>{index === 1 ? <><em>↑ 8</em> · 本周新增</> : metricNotes[index]}</p></article>;
        })}
      </section>

      <div className="split-grid">
        <section>
          <div className="section-header"><div><h2>最近留下的灵感</h2><p>已经通过审核、可以继续创作的内容</p></div><Link className="text-button" to="/library">查看全部 <ArrowRight size={14} /></Link></div>
          <div className="panel editorial-list">
            {recentInspirations.slice(0, 4).map((item, index) => (
              <Link className="editorial-row" to={`/editor/${item.id}`} key={item.id}>
                <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{mode === 'long' && index === 0 ? item.text + longPreview : item.text}</strong><p>{item.theme} · {item.scenario} · 适合 {item.platforms.join(' / ')}</p></div>
                <StatusPill tone={item.favorite ? 'good' : 'neutral'}>{item.favorite ? '已收藏' : `${item.score} 分`}</StatusPill>
              </Link>
            ))}
          </div>
        </section>

        <aside>
          <div className="section-header"><div><h2>本轮验证</h2><p>20—30 条真实运营视频</p></div></div>
          <div className="panel progress-card">
            <div className="progress-number"><strong>{metrics.exports}</strong><span>/ {metrics.targetExports} 条</span></div>
            <div className="large-progress"><i style={{ width: `${Math.min(100, (metrics.exports / metrics.targetExports) * 100)}%` }} /></div>
            <p>当前完成度 {Math.round((metrics.exports / metrics.targetExports) * 100)}%。保持质量，不追求一次生成大量内容。</p>
            <div className="timeline-list">
              {alerts.map((alert) => <div className="timeline-item" key={alert.id}><strong>{alert.title}</strong><span>{alert.detail}</span></div>)}
            </div>
          </div>
          <div className="dashboard-reminder"><CircleAlert size={16} /><span>所有 AI 内容都是草稿，只有人工确认后才能制作视频。</span></div>
        </aside>
      </div>
    </>
  );
}
