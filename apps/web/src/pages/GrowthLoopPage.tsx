import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CONTENT_POTENTIAL_THRESHOLD, ContentAccountSchema, ContentTypeSchema, GrowthLoopStateSchema, GrowthDashboardSchema, RetrospectiveSchema, RetrospectiveInputSchema, PublishedContentSchema, ContentMetricsSchema, ContentFeedbackSchema, type GrowthLoopState, type Retrospective, type RetrospectiveInput, type PublishedContent, type ContentMetrics, type ContentFeedback, type ContentAccount, type ContentType } from '@emotion-studio/contracts';
import { apiRequest, useRemote } from '../lib/api';
import { GrowthContentReview, type LoopAction } from './GrowthContentReview';
import './english-workflow.css';
import './growth-loop.css';

const base = '/api/v1/growth-loop';
const isoDate = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const percentage = (value: number | null) => value === null ? '—' : (value * 100).toFixed(2) + '%';
const stamp = (value: string) => new Date(value).toLocaleString();
const latest = (metrics: ContentMetrics[], id: string) => metrics.filter(x => x.contentId === id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id))[0];

export default function GrowthLoopPage() {
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const remote = useRemote(base, 'normal', GrowthLoopStateSchema, refresh);
  const location = useLocation();
  const act: LoopAction = task => { if (busy) return; setBusy(true); setError(''); void task().then(() => setRefresh(value => value + 1)).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '操作失败')).finally(() => setBusy(false)); };
  const state = remote.data, path = location.pathname, id = path.split('/')[2];
  const content = state?.contents.find(x => x.id === id), retro = state?.retrospectives.find(x => x.id === id);
  return <div className="english-mvp growth-loop">
    <p className="english-eyebrow">CONTENT GROWTH LOOP · 记录 → 生产 → 反馈 → 下一篇</p>
    {error ? <p role="alert" className="em-error">{error}</p> : null}
    {busy ? <p role="status">处理中，请勿重复提交…</p> : null}
    {remote.status === 'loading' ? <p role="status">读取工作台…</p> : remote.status === 'error' ? <p role="alert">{remote.error}</p> : null}
    {state ? <>
      {path === '/' || path === '/settings' ? <Dashboard key={refresh} settings={path === '/settings'} busy={busy} act={act} /> : null}
      {path === '/create' ? <CreateContent key={location.search + refresh} state={state} busy={busy} act={act} /> : null}
      {path === '/retrospectives' || path.startsWith('/retrospectives/') ? id && !retro ? <p>未找到复盘。<Link to="/retrospectives">新建复盘</Link></p> : <RetrospectiveEditor key={id ?? 'new'} record={retro} busy={busy} act={act} /> : null}
      {path.startsWith('/growth-content/') ? content ? <>
        <h1>{content.topic}</h1>
        {content.experiment ? <aside className="em-notice"><strong>本篇唯一实验：{content.experiment.variable}</strong><p>{content.experiment.instruction}</p><p>保持不变：{content.experiment.keepConstant}</p><p>Review 时按此计划人工核对；观察 {content.experiment.metric}。</p></aside> : null}
        <div className="loop-links">{content.sourceRetrospectiveId ? <Link to={`/retrospectives/${content.sourceRetrospectiveId}`}>查看来源复盘</Link> : null}{content.sourceContentId ? <Link to={`/growth-content/${content.sourceContentId}`}>查看上一轮内容与反馈</Link> : null}</div>
        <GrowthContentReview key={content.id + ':' + content.revision} content={content} busy={busy} act={act} />
        {content.status === 'published' ? <MetricsEditor content={content} state={state} busy={busy} act={act} /> : null}
      </> : <p>未找到内容。<Link to="/history">返回历史</Link></p> : null}
      {path === '/performance' ? <section><h1>Daily Feedback</h1><p>选择已发布内容，手动录入真实指标；演示数据明确标记。</p><ContentList items={state.contents.filter(x => x.status === 'published')} state={state} /></section> : null}
      {path === '/history' ? <History state={state} /> : null}
    </> : null}
  </div>;
}

function Dashboard({ settings, busy, act }: { settings: boolean; busy: boolean; act: LoopAction }) {
  const remote = useRemote(base + '/dashboard', 'normal', GrowthDashboardSchema);
  if (!remote.data) return <p>{remote.error ?? '读取今日重点…'}</p>;
  const data = remote.data;
  return <section><h1>{settings ? 'Settings / 运行状态' : 'Today · 今日行动'}</h1>
    <p className="em-notice">{data.mode === 'mock' ? 'OFFLINE DEMO MODE' : 'DeepSeek 分析 / 生成'} · {data.repository === 'memory' ? 'InMemory：重启 API 后增长闭环记录会清空；英语原有本地文件仍保留。' : 'PostgreSQL 持久化'} · 日期按 Asia/Shanghai 统计。</p>
    <p>英语生成模式在 <Link to="/english">English 工作流</Link>单独配置和显示。所有发布都由用户手动完成；不抓取账号数据。</p>
    <button disabled={busy} onClick={() => act(() => apiRequest(base + '/demo', 'normal', GrowthLoopStateSchema, { method: 'POST' }))}>加载7篇离线演示数据</button><p>Growth 3 / English 3 / Emotion 1；再次点击不会重复加入，不会调用模型。</p>
    {settings ? <p>服务端设置 CONTENT_REPOSITORY、DATABASE_URL、AI_PROVIDER；真实英语使用 ENGLISH_AI_MODE。不要把 API Key 输入网页或写入仓库。数据库需显式执行迁移，应用不会自动改表。</p> : <>
      <div className="loop-stats"><Link to="/retrospectives"><strong>{data.retrospectiveDone ? '已记录' : '待记录'}</strong>Today's Retrospective</Link><Link to="/history"><strong>{data.contentOpportunities}</strong>Content Opportunity</Link><Link to="/history"><strong>{data.readyToPublish}</strong>Ready to Publish</Link><Link to="/performance"><strong>{data.yesterday.metricsCount ? data.yesterday.views : '—'}</strong>昨日发布 {data.yesterday.count} 篇 / 已录指标 {data.yesterday.metricsCount} 篇<br />当前累计阅读（不含演示）</Link></div>
      <section className="english-compose"><h2>Today's Focus / Where Should I Focus?</h2><p>{data.focus.FOCUS_NOW}</p><p>{data.focus.evidence}</p><h3>KEEP DOING</h3>{data.focus.KEEP_DOING.map(text => <p key={text}>{text}</p>)}<h3>STOP DOING</h3>{data.focus.STOP_DOING.map(text => <p key={text}>{text}</p>)}</section>
      <h2>NEXT 3 POSTS</h2><div className="loop-list">{data.focus.NEXT_3_POSTS.map((post, index) => <Link key={index} to={'/create?' + new URLSearchParams({ topic: post.topic, account: post.account, contentType: post.contentType, ...(post.sourceContentId ? { sourceContentId: post.sourceContentId } : {}) }).toString()}><strong>{index + 1}. {post.topic}</strong><span>{post.experiment.instruction}</span><small>进入下一篇生产 → Growth 请附上新的真实经历</small></Link>)}</div>
      <div className="english-review-actions"><Link className="em-primary" to="/retrospectives">记录今天发生了什么</Link><Link className="em-primary" to="/create">Create</Link><Link to="/english">稳定 English Demo →</Link></div>
    </>}
  </section>;
}

const retroFields = [['whatHappened', '今天发生了什么'], ['myReaction', '我当时怎么处理的'], ['whatBotheredMe', '哪里让我不舒服 / 犹豫 / 焦虑 / 浪费时间'], ['whatCouldBeHandledBetter', '现在回头看哪里可以处理得更好'], ['lessonLearned', '我学到了什么'], ['nextAction', '下次遇到类似情况怎么做'], ['optionalNote', '补充备注']] as const;
function RetrospectiveEditor({ record, busy, act }: { record: Retrospective | undefined; busy: boolean; act: LoopAction }) {
  const navigate = useNavigate();
  const [input, setInput] = useState<RetrospectiveInput>(() => record ? RetrospectiveInputSchema.parse(Object.fromEntries(['date', ...retroFields.map(x => x[0])].map(key => [key, record[key as keyof Retrospective]]))) : { date: isoDate(), whatHappened: '', myReaction: '', whatBotheredMe: '', whatCouldBeHandledBetter: '', lessonLearned: '', nextAction: '', optionalNote: '' });
  const [newBlank, setNewBlank] = useState(!record);
  const actual = { ...input, whatHappened: newBlank ? '' : input.whatHappened };
  const dirty = !record || Object.entries(actual).some(([key, value]) => record[key as keyof Retrospective] !== value);
  function submit() { act(async () => { const parsed = RetrospectiveInputSchema.parse(actual); const saved = await apiRequest(record ? `${base}/retrospectives/${record.id}` : base + '/retrospectives', 'normal', RetrospectiveSchema, { method: record ? 'PUT' : 'POST', body: JSON.stringify(record ? { input: parsed, revision: record.revision } : parsed) }); navigate(`/retrospectives/${saved.id}`); }); }
  const analysis = record?.analysis;
  return <section><h1>Daily Retrospective</h1><form className="english-compose" onSubmit={event => { event.preventDefault(); submit(); }}><fieldset disabled={busy} className="loop-fields"><label>日期<input type="date" required value={input.date} onChange={event => setInput({ ...input, date: event.target.value })} /></label>{retroFields.map(([key, label]) => <label key={key}>{label}<textarea required={key === 'whatHappened'} rows={key === 'whatHappened' ? 4 : 2} maxLength={key === 'whatHappened' ? 4000 : 1000} value={key === 'whatHappened' ? actual.whatHappened : input[key]} onChange={event => { setInput({ ...input, [key]: event.target.value }); if (key === 'whatHappened') setNewBlank(false); }} /></label>)}<button className="em-primary" type="submit">保存复盘</button></fieldset></form>
    {record ? <div className="english-review-actions"><button disabled={busy || dirty} onClick={() => act(() => apiRequest(`${base}/retrospectives/${record.id}/analyze`, 'normal', RetrospectiveSchema, { method: 'POST', body: JSON.stringify({ revision: record.revision }) }))}>Analyze Retrospective</button>{dirty ? <span>请先保存修改，再分析。</span> : null}</div> : null}
    {analysis && !dirty ? <section className="english-compose"><h2>Content Potential: {analysis.contentPotential}/10</h2><p>{record?.analysisProvider === 'mock' ? 'OFFLINE DEMO MODE · 透明规则结果，需人工确认' : 'AI 复盘 · 推断待验证'}</p><dl className="loop-analysis">{Object.entries(analysis).filter(([key]) => !['recommendedTitleIdeas', 'contentPotential'].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><h3>候选标题</h3>{analysis.recommendedTitleIdeas.map(title => <p key={title}>{title}</p>)}{analysis.contentPotential >= CONTENT_POTENTIAL_THRESHOLD ? <Link className="em-primary" to={`/create?sourceRetrospectiveId=${record!.id}`}>Create Content</Link> : <p>先补充事件、行动与经验；达到6分后再生产。</p>}</section> : null}
  </section>;
}

function CreateContent({ state, busy, act }: { state: GrowthLoopState; busy: boolean; act: LoopAction }) {
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search);
  const source = state.retrospectives.find(x => x.id === params.get('sourceRetrospectiveId'));
  const [account, setAccount] = useState<ContentAccount>(ContentAccountSchema.safeParse(params.get('account')).data ?? (source?.analysis?.recommendedAccount !== 'none' ? source?.analysis?.recommendedAccount : undefined) ?? 'growth');
  const [type, setType] = useState<ContentType>(ContentTypeSchema.safeParse(params.get('contentType')).data ?? source?.analysis?.recommendedContentType ?? 'solution');
  const [topic, setTopic] = useState(params.get('topic') ?? source?.analysis?.recommendedTitleIdeas[0] ?? '');
  const [retroId, setRetroId] = useState(source?.id ?? '');
  return <section><h1>Create Content</h1><p>选择账号和方向。Growth 必须附真实复盘；English 复用既有50句生成与查重；Emotion 复用主题分析和原创生成。</p><form className="english-compose" onSubmit={event => { event.preventDefault(); act(async () => { const content = await apiRequest(base + '/contents', 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ account, topic, contentType: type, sourceRetrospectiveId: retroId || null, sourceContentId: params.get('sourceContentId') }) }); navigate(`/growth-content/${content.id}`); }); }}><fieldset className="loop-fields" disabled={busy}><label>账号<select value={account} onChange={event => setAccount(ContentAccountSchema.parse(event.target.value))}>{ContentAccountSchema.options.map(value => <option key={value}>{value}</option>)}</select></label><label>内容类型<select value={type} onChange={event => setType(ContentTypeSchema.parse(event.target.value))}>{ContentTypeSchema.options.map(value => <option key={value}>{value}</option>)}</select></label><label>主题<input required maxLength={120} value={topic} onChange={event => setTopic(event.target.value)} /></label>{account === 'english' ? <p>离线可用：尴尬时刻英语50句、拒绝别人英语50句、夸人英语50句。已生成主题复用现有稿件，不再请求模型。</p> : null}<label>真实复盘来源<select required={account === 'growth'} value={retroId} onChange={event => setRetroId(event.target.value)}><option value="">请选择（Growth 必选）</option>{state.retrospectives.filter(x => (x.analysis?.contentPotential ?? 0) >= 6).map(x => <option value={x.id} key={x.id}>{x.date} · {x.whatHappened.slice(0, 35)}</option>)}</select></label><button className="em-primary">Create Content</button><Link to="/retrospectives">先记录新经历 →</Link></fieldset></form></section>;
}

function MetricsEditor({ content, state, busy, act }: { content: PublishedContent; state: GrowthLoopState; busy: boolean; act: LoopAction }) {
  const metric = latest(state.metrics, content.id);
  const [values, setValues] = useState(() => ({ views: metric?.views ?? 0, likes: metric?.likes ?? 0, favorites: metric?.favorites ?? 0, comments: metric?.comments ?? 0, followersGained: metric?.followersGained ?? 0, note: '' }));
  const records = state.metrics.filter(x => x.contentId === content.id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const feedback = state.feedback.filter(x => x.contentId === content.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <section className="loop-performance"><h2>Daily Content Feedback · 手动录入</h2><p>请输入当前累计数据，尽量统一发布后观察时长。每次保存保留历史，不覆盖旧记录。{content.isDemo ? '当前为合成演示内容，数据不计入真实表现。' : ''}</p><form className="english-compose" onSubmit={event => { event.preventDefault(); act(() => apiRequest(`${base}/contents/${content.id}/metrics`, 'normal', ContentMetricsSchema, { method: 'POST', body: JSON.stringify(values) })); }}><fieldset className="loop-fields" disabled={busy}>{(['views', 'likes', 'favorites', 'comments', 'followersGained'] as const).map(key => <label key={key}>{key}<input type="number" min={0} max={1000000000} required value={values[key]} onChange={event => setValues({ ...values, [key]: Number(event.target.value) })} /></label>)}<label>观察窗口 / 备注<input value={values.note} onChange={event => setValues({ ...values, note: event.target.value })} /></label><button className="em-primary">保存流量</button></fieldset></form><button disabled={busy || !metric} onClick={() => act(() => apiRequest(`${base}/contents/${content.id}/analyze`, 'normal', ContentFeedbackSchema, { method: 'POST' }))}>Analyze Performance</button>
    {feedback.map(item => <Feedback key={item.id} value={item} stale={item.metricsId !== metric?.id} />)}
    <h3>Performance History</h3>{records.map(item => <details id={`metric-${item.id}`} key={item.id}><summary>{stamp(item.capturedAt)} · {item.views} views</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>)}
  </section>;
}

function Feedback({ value, stale }: { value: ContentFeedback; stale: boolean }) {
  return <section id={`feedback-${value.id}`} className="english-compose"><h2>KEEP / CHANGE / NEXT EXPERIMENT</h2>{stale ? <p>历史反馈：存在更新指标，请重新 Analyze。</p> : null}<p>{value.performanceSummary}</p><dl className="loop-analysis">{Object.entries(value.rates).map(([key, number]) => <div key={key}><dt>{key}</dt><dd>{percentage(number)}</dd></div>)}</dl><div className="loop-table-wrap"><table><caption>历史对比：排除当前篇；同类型限定同账号；零阅读不计入比例均值。</caption><thead><tr><th>基准</th><th>样本 / 比例样本</th><th>平均阅读</th><th>点赞率</th><th>收藏率</th><th>评论率</th><th>关注转化率</th></tr></thead><tbody>{Object.entries(value.comparisons).map(([key, average]) => <tr key={key}><th>{key}</th><td>{average.sampleCount} / {average.rateSampleCount}</td><td>{average.avgViews?.toFixed(0) ?? '—'}</td><td>{percentage(average.avgLikeRate)}</td><td>{percentage(average.avgFavoriteRate)}</td><td>{percentage(average.avgCommentRate)}</td><td>{percentage(average.avgFollowConversionRate)}</td></tr>)}</tbody></table></div><h3>KEEP</h3>{value.KEEP.map(text => <p key={text}>{text}</p>)}<h3>CHANGE</h3>{value.CHANGE.map(text => <p key={text}>{text}</p>)}<h3>NEXT EXPERIMENT · {value.NEXT_EXPERIMENT.variable}</h3><p>{value.NEXT_EXPERIMENT.instruction}</p><p>保持不变：{value.NEXT_EXPERIMENT.keepConstant}</p><p>观察指标：{value.NEXT_EXPERIMENT.metric}</p><Link to="/">返回 Dashboard 查看下一篇策略 →</Link></section>;
}
function ContentList({ items, state }: { items: PublishedContent[]; state: GrowthLoopState }) {
  return <div className="loop-list">{items.length ? [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(item => <Link key={item.id} to={`/growth-content/${item.id}`}><strong>{item.title}</strong><span>{item.account} · {item.contentType} · {item.status} · {item.isDemo ? '合成 Demo' : '个人记录'} · {latest(state.metrics, item.id)?.views ?? '—'} views</span></Link>) : <p>暂无内容。</p>}</div>;
}
function History({ state }: { state: GrowthLoopState }) {
  return <section><h1>History</h1><h2>Retrospective History</h2><div className="loop-list">{state.retrospectives.map(item => <Link key={item.id} to={`/retrospectives/${item.id}`}><strong>{item.date} · {item.whatHappened.slice(0, 80)}</strong><span>Content Potential: {item.analysis?.contentPotential ?? '待分析'}</span></Link>)}</div><h2>Content History</h2><ContentList items={state.contents} state={state} /><h2>Performance History</h2><div className="loop-list">{state.metrics.map(item => <Link key={item.id} to={`/growth-content/${item.contentId}#metric-${item.id}`}>{state.contents.find(x => x.id === item.contentId)?.title} · {stamp(item.capturedAt)} · {item.views} views</Link>)}</div><h2>Feedback History</h2><div className="loop-list">{state.feedback.map(item => <Link key={item.id} to={`/growth-content/${item.contentId}#feedback-${item.id}`}>{stamp(item.createdAt)} · {item.performanceSummary}</Link>)}</div></section>;
}
