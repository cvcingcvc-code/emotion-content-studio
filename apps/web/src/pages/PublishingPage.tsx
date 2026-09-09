import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PerformanceSchema, PostRecordListSchema, PostRecordSchema, StudioDashboardSchema, type PostRecord } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState } from '../components/States';
import { apiRequest, useRemote, type PreviewMode } from '../lib/api';
import { accountProfiles, accountLabels, laneLabels, parseAccountId } from '../lib/accounts';

const metrics = { views: '曝光', likes: '点赞', favorites: '收藏', comments: '评论', shares: '分享', follows: '新增关注' } as const;
type MetricKey = keyof typeof metrics;
const metricKeys = Object.keys(metrics) as MetricKey[];
const rate = (value: number | null) => value === null ? '—' : (value * 100).toFixed(1) + '%';

export default function PublishingPage() {
  const { mode, setMode } = usePreviewMode();
  const [query, setQuery] = useSearchParams();
  const accountId = parseAccountId(query.get('accountId'));
  const [refresh, setRefresh] = useState(0);
  const [lane, setLane] = useState('');
  const [selected, setSelected] = useState('');
  const state = useRemote('/api/v1/post-records' + (accountId ? '?accountId=' + accountId : ''), mode, PostRecordListSchema, refresh);
  const dashboards = useRemote('/api/v1/studio-dashboard', mode, StudioDashboardSchema, refresh);
  const rows = state.status === 'ready' && mode !== 'empty' ? state.data.filter((post) => !lane || post.contentLane === lane) : [];
  return <>
    <div className="page-intro"><div><p className="kicker">PUBLISH & LEARN</p><h2>把每一次发布，变成下一次的依据。</h2><p>手动记录作品与表现。空白表示尚未记录；零表示实际记录为零。</p></div></div>
    <section className="studio-filters"><label>账号<select aria-label="发布账号筛选" value={accountId ?? ''} onChange={(event) => { setQuery(event.target.value ? { accountId: event.target.value } : {}); setSelected(''); setLane(''); }}><option value="">全部账号</option>{accountProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label><label>内容赛道<select aria-label="发布赛道筛选" value={lane} onChange={(event) => setLane(event.target.value)}><option value="">全部赛道</option>{Object.entries(laneLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></section>
    {dashboards.status === 'error' ? <ErrorState message={dashboards.error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
    {dashboards.status === 'ready' ? <div className="account-stats-grid">{dashboards.data.filter((data) => !accountId || data.accountId === accountId).map((data) => <article className="panel account-stat" key={data.accountId}>
      <h3>{accountLabels[data.accountId]}</h3><div className="performance-numbers"><span>发布数<strong>{data.performance.publishedCount}</strong></span><span>总曝光<strong>{data.performance.totalViews ?? '—'}</strong></span><span>平均点赞率<strong>{rate(data.performance.averageLikeRate)}</strong></span><span>平均收藏率<strong>{rate(data.performance.averageFavoriteRate)}</strong></span><span>平均评论率<strong>{rate(data.performance.averageCommentRate)}</strong></span></div>
      <p>{data.performance.insufficientSample ? '样本不足 · 满 10 篇有曝光数据的作品后再解读趋势' : '按每篇有效数据计算平均比率'}</p>
      <details className="package-detail"><summary>按内容赛道复盘</summary>{data.lanes.length ? data.lanes.map((entry) => <p key={entry.contentLane}>{laneLabels[entry.contentLane]}：{entry.performance.publishedCount} 篇 / 曝光 {entry.performance.totalViews ?? '—'} / 赞 {rate(entry.performance.averageLikeRate)} / 藏 {rate(entry.performance.averageFavoriteRate)} / 评 {rate(entry.performance.averageCommentRate)}</p>) : <p>尚无发布数据</p>}</details>
    </article>)}</div> : null}
    {mode === 'blocked' ? <BlockedNotice title="当前只能浏览" description="暂时不能填写表现数据。" /> : null}
    {state.status === 'loading' ? <LoadingState rows={4} /> : state.status === 'error' ? <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefresh((value) => value + 1); }} /> : rows.length === 0 ? <EmptyState title="还没有发布记录" description="在生成结果页核对并确认内容，记录手动发布。" action="前往工作区" actionTo={'/accounts/' + (accountId ?? 'personal_growth')} /> : <div className="post-list">{rows.map((post) => <article className="panel post-card" key={post.id}>
      <header><div><small>{accountLabels[post.accountId]} / {laneLabels[post.contentLane]} / {post.status === 'published' ? '已手动发布' : '人工确认稿'}</small><h3>{post.titleUsed}</h3><time>{post.publishedAt ? new Date(post.publishedAt).toLocaleString('zh-CN') : '尚未发布'}</time></div><Link className="text-button" to={'/generated/' + post.generatedContentId + '?accountId=' + post.accountId}>查看与编辑</Link></header>
      <details className="package-detail"><summary>实际使用的正文快照</summary><p className="pre-wrap">{post.bodyUsed}</p><p>{post.hashtagsUsed.join(' ')}</p></details>
      <div className="post-metrics">{metricKeys.map((key) => <span key={key}>{metrics[key]} <strong>{post.performance?.[key] ?? '—'}</strong></span>)}</div>
      {post.status === 'published' ? <button className="secondary-button" disabled={mode === 'blocked'} onClick={() => setSelected(selected === post.id ? '' : post.id)}>录入表现数据</button> : null}
      {selected === post.id ? <PerformanceForm key={post.id + post.updatedAt} post={post} mode={mode} onSaved={() => { setSelected(''); setRefresh((value) => value + 1); }} /> : null}
    </article>)}</div>}
  </>;
}

function PerformanceForm({ post, mode, onSaved }: { post: PostRecord; mode: PreviewMode; onSaved: () => void }) {
  const [values, setValues] = useState<Record<MetricKey, string>>({ views: String(post.performance?.views ?? ''), likes: String(post.performance?.likes ?? ''), favorites: String(post.performance?.favorites ?? ''), comments: String(post.performance?.comments ?? ''), shares: String(post.performance?.shares ?? ''), follows: String(post.performance?.follows ?? '') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [capture, setCapture] = useState(() => {
    const date = post.performance?.metricsCapturedAt ? new Date(post.performance.metricsCapturedAt) : new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'blocked' || busy) return;
    setBusy(true); setError('');
    try {
      const counts = Object.fromEntries(metricKeys.map((key) => [key, values[key].trim() === '' ? null : Number(values[key])]));
      const payload = PerformanceSchema.parse({ ...counts, metricsCapturedAt: Object.values(counts).some((value) => value !== null) ? new Date(capture).toISOString() : null });
      await apiRequest('/api/v1/post-records/' + post.id + '/performance', mode, PostRecordSchema, { method: 'PUT', body: JSON.stringify(payload) });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '保存失败。'); }
    finally { setBusy(false); }
  }
  return <form className="performance-form studio-form" onSubmit={(event) => void submit(event)}>
    <div className="studio-form-grid">{metricKeys.map((key) => <label key={key}>{metrics[key]}<input aria-label={'记录' + metrics[key]} type="number" inputMode="numeric" min={0} step={1} max={Number.MAX_SAFE_INTEGER} value={values[key]} disabled={busy || mode === 'blocked'} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}</div>
    <label className="studio-field">数据采集时间<input aria-label="数据采集时间" type="datetime-local" value={capture} onChange={(event) => setCapture(event.target.value)} required /></label>
    {error ? <p role="alert">{error}</p> : null}<button className="primary-button" disabled={busy || mode === 'blocked'}>{busy ? '正在保存…' : '保存表现数据'}</button>
  </form>;
}
