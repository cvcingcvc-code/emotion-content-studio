import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CONTENT_POTENTIAL_THRESHOLD, ContentAccountSchema, ContentTypeSchema, GrowthLoopStateSchema, GrowthDashboardSchema, RetrospectiveSchema, RetrospectiveInputSchema, PublishedContentSchema, ContentMetricsSchema, ContentFeedbackSchema, type GrowthLoopState, type Retrospective, type RetrospectiveInput, type PublishedContent, type ContentMetrics, type ContentFeedback, type ContentAccount, type ContentType, type ExperimentOutcome } from '@emotion-studio/contracts';
import { apiRequest, useRemote } from '../lib/api';
import { GrowthContentReview, type LoopAction } from './GrowthContentReview';
import './english-workflow.css';
import './growth-loop.css';
import './growth-loop-success.css';
import './content-creation-workspace.css';

const base = '/api/v1/growth-loop';
const isoDate = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const percentage = (value: number | null) => value === null ? '—' : (value * 100).toFixed(2) + '%';
const stamp = (value: string) => new Date(value).toLocaleString();
const latest = (metrics: ContentMetrics[], id: string) => metrics.filter(x => x.contentId === id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id))[0];
const signedPercent = (value: number | null) => value === null ? '—' : (value >= 0 ? '+' : '') + (value * 100).toFixed(0) + '%';
const accountLabels: Record<ContentAccount, string> = { growth: '个人成长', english: '趣味英语', emotion: '情绪灵感库' };
const typeLabels: Record<ContentType, string> = { story: '真实故事', solution: '问题解决', reflection: '反思随笔', list: '清单合集', educational: '知识科普' };
// 复盘分析面板以前直接渲染契约里的英文键（summary / coreProblem / recommendedAccount…），
// 演示时第一眼就是英文标识符。这里改成中文，并翻译枚举值；新增字段没登记时回落显示原键，不会消失。
const analysisLabels: Record<string, string> = { summary: '事件概要', coreProblem: '核心问题', decisionPattern: '当时的反应', betterApproach: '可以更好的做法', lesson: '经验', nextAction: '下一步动作', contentReason: '内容价值判断', recommendedAccount: '建议账号', recommendedContentType: '建议内容类型', contentAngle: '内容切入角度' };
const accountValueLabels: Record<string, string> = { growth: '个人成长', english: '趣味英语', emotion: '情绪灵感库', none: '暂不生产' };
const analysisValue = (key: string, value: unknown) => key === 'recommendedAccount' ? accountValueLabels[String(value)] ?? String(value) : key === 'recommendedContentType' ? typeLabels[value as ContentType] ?? String(value) : String(value);

export default function GrowthLoopPage() {
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const remote = useRemote(base, 'normal', GrowthLoopStateSchema, refresh);
  const location = useLocation();
  const act: LoopAction = task => { if (busy) return; setBusy(true); setError(''); void task().then(() => setRefresh(value => value + 1)).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '操作失败')).finally(() => setBusy(false)); };
  const state = remote.data, path = location.pathname, id = path.split('/')[2];
  const content = state?.contents.find(x => x.id === id), retro = state?.retrospectives.find(x => x.id === id);
  // "创建成功" 是瞬时 UI 状态，必须放在这一层：
  // act() 成功后 refresh 会让 useRemote 把 data 置空，下面的子树整体卸载重挂，
  // 状态若留在 CreateContent 内部会被重置 → 成功页永远看不到（点完生成像是没反应）。
  const [createdId, setCreatedId] = useState<string | null>(null);
  useEffect(() => { setCreatedId(null); }, [location.search]);
  return <div className="english-mvp growth-loop">
    <p className="english-eyebrow">内容增长循环 · 记录 → 生产 → 反馈 → 下一篇</p>
    {error ? <p role="alert" className="em-error">{error}</p> : null}
    {busy ? <p role="status">处理中，请勿重复提交…</p> : null}
    {remote.status === 'loading' ? <p role="status">读取工作台…</p> : remote.status === 'error' ? <p role="alert">{remote.error}</p> : null}
    {state ? <>
      {path === '/' || path === '/settings' ? <Dashboard key={refresh} settings={path === '/settings'} busy={busy} act={act} state={state} /> : null}
      {path === '/create' ? <CreateContent key={location.search} createdId={createdId} onCreated={setCreatedId} state={state} busy={busy} act={act} /> : null}
      {path === '/retrospectives' || path.startsWith('/retrospectives/') ? id && !retro ? <p>未找到复盘。<Link to="/retrospectives">新建复盘</Link></p> : <RetrospectiveEditor key={id ?? 'new'} record={retro} state={state} busy={busy} act={act} /> : null}
      {path.startsWith('/growth-content/') ? content ? <>
        {content.debug ? <aside className="em-notice loop-learning">
          <strong>上一轮的学习 → 本轮生成的输入（{content.debug.feedbackUsed.length} 条）</strong>
          <p>筛选规则：同账号 · 同性质（真实 / 演示不混用）· 30 天内 · 已发布且已录指标；同一篇只取最新一条，直接上一轮排最前，最多 3 条。只有 KEEP / CHANGE 会被当成结论。</p>
          {content.debug.feedbackUsed.length
            ? content.debug.feedbackUsed.map(item => <p key={item.feedbackId}><strong>{item.verdict}</strong>（置信度 {item.confidence}）· {item.text}</p>)
            : <p>没有可用的上一轮学习：上一轮没有「已发布且已录指标」的同类内容。演示数据不会与真实数据混用。</p>}
          <p>账号策略 {content.debug.strategyUsed.length} 条 · 本轮唯一实验 {content.debug.experimentUsed ?? '无'} · 生效约束 {content.debug.constraintsApplied.length} 项 · 生成上下文版本 {content.debug.promptVersion}</p>
        </aside> : null}
        {content.experiment ? <aside className="em-notice"><strong>本篇唯一实验：{content.experiment.variable} = {content.experiment.variant}</strong><p>假设：{content.experiment.hypothesis}</p><p>{content.experiment.instruction}</p><p>基线：{content.experiment.baseline}</p><p>保持不变：{content.experiment.keepConstant}</p><p>进度 {content.experiment.currentSamples}/{content.experiment.requiredSamples} · 状态 {content.experiment.status} · 置信度 {content.experiment.confidence}；观察 {content.experiment.targetMetric}。</p></aside> : null}
        {content.sourceContentId ? <div className="loop-links"><Link to={`/growth-content/${content.sourceContentId}`}>查看上一轮内容与反馈</Link></div> : null}
        <GrowthContentReview key={content.id + ':' + content.revision} content={content} sourceRetro={state.retrospectives.find(x => x.id === content.sourceRetrospectiveId)} busy={busy} act={act} />
        {content.status === 'published' ? <MetricsEditor content={content} state={state} busy={busy} act={act} /> : null}
      </> : <p>未找到内容。<Link to="/history">返回历史</Link></p> : null}
      {path === '/performance' ? <section><h1>Daily Feedback</h1><p>选择已发布内容，手动录入真实指标；演示数据明确标记。</p><ContentList items={state.contents.filter(x => x.status === 'published')} state={state} /></section> : null}
      {path === '/history' ? <History state={state} /> : null}
    </> : null}
  </div>;
}

function Dashboard({ settings, busy, act, state }: { settings: boolean; busy: boolean; act: LoopAction; state: GrowthLoopState }) {
  const remote = useRemote(base + '/dashboard', 'normal', GrowthDashboardSchema);
  if (!remote.data) return <p>{remote.error ?? '读取今日重点…'}</p>;
  const data = remote.data;
  const active = state.strategies.filter(x => x.status === 'active');
  return <section><h1>{settings ? 'Settings / 运行状态' : 'Today · 今日行动'}</h1>
    <p className="em-notice">{data.mode === 'mock' ? '离线演示模式' : 'DeepSeek 分析 / 生成'} · {data.repository === 'memory' ? '内存模式：重启 API 后增长闭环记录会清空；英语原有本地文件仍保留。' : 'PostgreSQL 持久化'} · 日期按 Asia/Shanghai 统计。</p>
    <p>英语生成模式在 <Link to="/english">趣味英语工作流</Link>单独配置和显示。所有发布都由用户手动完成；不抓取账号数据。</p>
    <button disabled={busy} onClick={() => act(() => apiRequest(base + '/demo', 'normal', GrowthLoopStateSchema, { method: 'POST' }))}>加载7篇离线演示数据</button><p>成长内容 3 / 英语内容 3 / 情感内容 1；再次点击不会重复加入，不会调用模型。</p>
    {settings ? <p>服务端设置 CONTENT_REPOSITORY、DATABASE_URL、AI_PROVIDER；真实英语使用 ENGLISH_AI_MODE。不要把 API Key 输入网页或写入仓库。数据库需显式执行迁移，应用不会自动改表。</p> : <>
      <div className="loop-stats"><Link to="/retrospectives"><strong>{data.retrospectiveDone ? '已记录' : '待记录'}</strong>Today's Retrospective</Link><Link to="/history"><strong>{data.contentOpportunities}</strong>Content Opportunity</Link><Link to="/history"><strong>{data.readyToPublish}</strong>Ready to Publish</Link><Link to="/performance"><strong>{data.yesterday.metricsCount ? data.yesterday.views : '—'}</strong>昨日发布 {data.yesterday.count} 篇 / 已录指标 {data.yesterday.metricsCount} 篇<br />当前累计阅读（不含演示）</Link></div>
      <section className="english-compose"><h2>Today's Focus / Where Should I Focus?</h2><p>{data.focus.FOCUS_NOW}</p><p>{data.focus.evidence}</p><h3>KEEP DOING</h3>{data.focus.KEEP_DOING.map(text => <p key={text}>{text}</p>)}<h3>STOP DOING</h3>{data.focus.STOP_DOING.map(text => <p key={text}>{text}</p>)}</section>
      <h2>NEXT 3 POSTS</h2><div className="loop-list">{data.focus.NEXT_3_POSTS.map((post, index) => <Link key={index} to={'/create?' + new URLSearchParams({ topic: post.topic, account: post.account, contentType: post.contentType, ...(post.sourceContentId ? { sourceContentId: post.sourceContentId } : {}) }).toString()}><strong>{index + 1}. {post.topic}</strong><span>{post.experiment.instruction}</span><small>进入下一篇生产 → Growth 请附上新的真实经历</small></Link>)}</div>
      <section className="english-compose"><h2>账号策略 · 会进入下一轮生成</h2>{active.length ? active.map(entry => <p key={entry.id}><strong>{accountLabels[entry.account]} · {entry.category}</strong>　{entry.value}（证据 {entry.evidenceCount} 次 · 置信度 {entry.confidence}）</p>) : <p>还没有任何已确认策略：一次修改或一条数据都只算弱信号，不会直接升级为长期策略。</p>}</section>
      <div className="english-review-actions"><Link className="em-primary" to="/retrospectives">记录今天发生了什么</Link><Link className="em-primary" to="/create">创建内容</Link><Link to="/english">趣味英语演示 →</Link></div>
    </>}
  </section>;
}

const retroFields = [['whatHappened', '今天发生了什么'], ['myReaction', '我当时怎么处理的'], ['whatBotheredMe', '哪里让我不舒服 / 犹豫 / 焦虑 / 浪费时间'], ['whatCouldBeHandledBetter', '现在回头看哪里可以处理得更好'], ['lessonLearned', '我学到了什么'], ['nextAction', '下次遇到类似情况怎么做'], ['optionalNote', '补充备注']] as const;
function RetrospectiveEditor({ record, state, busy, act }: { record: Retrospective | undefined; state: GrowthLoopState; busy: boolean; act: LoopAction }) {
  const navigate = useNavigate();
  const [input, setInput] = useState<RetrospectiveInput>(() => record ? RetrospectiveInputSchema.parse(Object.fromEntries(['date', ...retroFields.map(x => x[0])].map(key => [key, record[key as keyof Retrospective]]))) : { date: isoDate(), whatHappened: '', myReaction: '', whatBotheredMe: '', whatCouldBeHandledBetter: '', lessonLearned: '', nextAction: '', optionalNote: '' });
  const [newBlank, setNewBlank] = useState(!record);
  const actual = { ...input, whatHappened: newBlank ? '' : input.whatHappened };
  const dirty = !record || Object.entries(actual).some(([key, value]) => record[key as keyof Retrospective] !== value);
  function submit() { act(async () => { const parsed = RetrospectiveInputSchema.parse(actual); const saved = await apiRequest(record ? `${base}/retrospectives/${record.id}` : base + '/retrospectives', 'normal', RetrospectiveSchema, { method: record ? 'PUT' : 'POST', body: JSON.stringify(record ? { input: parsed, revision: record.revision } : parsed) }); navigate(`/retrospectives/${saved.id}`); }); }
  const analysis = record?.analysis;
  return <section className="retrospective-workspace">
    <header className="retrospective-header">
      <h1>复盘记录</h1>
      <p className="retrospective-subtitle">记录真实发生的事情，不急着把它写成内容。</p>
      <div className="retrospective-flow">
        <div className="retrospective-flow-item">真实经历</div>
        <div className="retrospective-flow-item">找到问题</div>
        <div className="retrospective-flow-item">内容机会</div>
        <div className="retrospective-flow-item">创作</div>
      </div>
    </header>

    <div className="retrospective-editor">
      <div className="retrospective-editor-top">
        <h2 className="retrospective-editor-title">今天发生了什么？</h2>
        <p className="retrospective-editor-description">今天有什么事情让你印象比较深？发生了什么？你当时是怎么处理的？现在回头看，有没有哪里可以做得更好？</p>
      </div>

      <div className="retrospective-main-content">
        <textarea
          className="retrospective-main-input"
          placeholder="今天有什么事情让你印象比较深？发生了什么？你当时是怎么处理的？现在回头看，有没有哪里可以做得更好？"
          required={true}
          rows={12}
          value={actual.whatHappened}
          onChange={event => { setInput({ ...input, whatHappened: event.target.value }); setNewBlank(false); }}
        />
      </div>

      <div className="retrospective-fields">
        <div className="retrospective-field">
          <label className="retrospective-field-label">日期</label>
          <input
            type="date"
            className="retrospective-field-input"
            value={input.date}
            onChange={event => setInput({ ...input, date: event.target.value })}
          />
        </div>
        <div className="retrospective-field">
          <label className="retrospective-field-label">标签</label>
          <input
            type="text"
            className="retrospective-field-input"
            placeholder="用空格分隔多个标签"
            value={input.tags?.join(' ') || ''}
            onChange={event => setInput({ ...input, tags: event.target.value.split(/\s+/).filter(Boolean) })}
          />
        </div>
        <div className="retrospective-field">
          <label className="retrospective-field-label">情绪</label>
          <select
            className="retrospective-field-input"
            value={input.emotion || ''}
            onChange={event => setInput({ ...input, emotion: event.target.value })}
          >
            <option value="">请选择情绪</option>
            <option value="happy">开心</option>
            <option value="sad">难过</option>
            <option value="angry">生气</option>
            <option value="frustrated">沮丧</option>
            <option value="excited">兴奋</option>
            <option value="calm">平静</option>
            <option value="anxious">焦虑</option>
          </select>
        </div>
        <div className="retrospective-field">
          <label className="retrospective-field-label">事件类型</label>
          <select
            className="retrospective-field-input"
            value={input.eventType || ''}
            onChange={event => setInput({ ...input, eventType: event.target.value })}
          >
            <option value="">请选择事件类型</option>
            <option value="work">工作</option>
            <option value="life">生活</option>
            <option value="study">学习</option>
            <option value="relationship">人际关系</option>
            <option value="health">健康</option>
            <option value="other">其他</option>
          </select>
        </div>
      </div>

      <div className="retrospective-actions">
        <button type="submit" className="em-primary" onClick={submit}>保存复盘</button>
        {record && !dirty && (
          <button
            disabled={busy}
            onClick={() => act(() => apiRequest(`${base}/retrospectives/${record.id}/analyze`, 'normal', RetrospectiveSchema, { method: 'POST', body: JSON.stringify({ revision: record.revision }) }))}
          >
            分析复盘
          </button>
        )}
      </div>
    </div>

    {analysis && !dirty && (
      <div className="retrospective-analysis">
        <h3 className="retrospective-analysis-title">内容机会分析</h3>
        <div className="retrospective-analysis-content">
          <p>{record?.analysisProvider === 'mock' ? 'OFFLINE DEMO MODE · 透明规则结果，需人工确认' : 'AI 复盘 · 推断待验证'}</p>
          <h3 className="retrospective-facts-title">事实 · 来自你的原始记录</h3>
          <ul className="retrospective-facts">
            {analysis.facts.map(fact => <li key={fact}>{fact}</li>)}
          </ul>
          <h3 className="retrospective-interpretations-title">推断 · 待验证，不是事实</h3>
          <ul className="retrospective-interpretations">
            {analysis.interpretations.map(value => <li key={value}>{value}</li>)}
          </ul>
          <dl className="loop-analysis">
            {Object.entries(analysis).filter(([key]) => !['recommendedTitleIdeas', 'contentPotential', 'facts', 'interpretations'].includes(key)).map(([key, value]) => (
              <div key={key}>
                <dt>{analysisLabels[key] ?? key}</dt>
                <dd>{analysisValue(key, value)}</dd>
              </div>
            ))}
          </dl>
          <h3>候选标题</h3>
          {analysis.recommendedTitleIdeas.map(title => (
            <p key={title}>{title}</p>
          ))}
          {analysis.contentPotential >= CONTENT_POTENTIAL_THRESHOLD ? (
            <Link className="create-content-link" to={`/create?sourceRetrospectiveId=${record!.id}`}>
              已发现内容机会（潜力 {analysis.contentPotential}/10）→ 创建内容
            </Link>
          ) : (
            <p>先补充事件、行动与经验；达到6分后再生产。</p>
          )}
        </div>
      </div>
    )}

    {state.retrospectives.length > 0 && (
      <div className="retrospective-history">
        <h3 className="retrospective-history-title">历史复盘</h3>
        <div className="retrospective-history-list">
          {[...state.retrospectives].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(item => (
            <div className="retrospective-history-item" key={item.id}>
              <div className="retrospective-history-date">{item.date}</div>
              <div className="retrospective-history-content">{item.whatHappened.slice(0, 120)}</div>
              {(item.analysis?.contentPotential ?? 0) >= CONTENT_POTENTIAL_THRESHOLD && (
                <div className="retrospective-history-opportunity">
                  <span className="icon">✓</span>
                  内容潜力 {item.analysis?.contentPotential}/10 · 已发现内容机会
                </div>
              )}
              <div className="retrospective-history-actions">
                <Link to={`/retrospectives/${item.id}`}>查看复盘 →</Link>
                <Link to={`/create?sourceRetrospectiveId=${item.id}`}>用这条创建内容 →</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </section>;
}

function CreateContent({ state, busy, act, createdId, onCreated }: { state: GrowthLoopState; busy: boolean; act: LoopAction; createdId: string | null; onCreated: (id: string) => void }) {
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search);
  const source = state.retrospectives.find(x => x.id === params.get('sourceRetrospectiveId'));
  const [account, setAccount] = useState<ContentAccount>(ContentAccountSchema.safeParse(params.get('account')).data ?? (source?.analysis?.recommendedAccount !== 'none' ? source?.analysis?.recommendedAccount : undefined) ?? 'growth');
  const [type, setType] = useState<ContentType>(ContentTypeSchema.safeParse(params.get('contentType')).data ?? source?.analysis?.recommendedContentType ?? 'solution');
  const [topic, setTopic] = useState(params.get('topic') ?? source?.analysis?.recommendedTitleIdeas[0] ?? '');
  const [retroId, setRetroId] = useState(source?.id ?? '');
  const contentCreated = createdId !== null;

  // 自动设置复盘来源
  useEffect(() => {
    if (source && !retroId) {
      setRetroId(source.id);
    }
  }, [source, retroId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    act(async () => {
      const content = await apiRequest(
        base + '/contents',
        'normal',
        PublishedContentSchema,
        {
          method: 'POST',
          body: JSON.stringify({ account, topic, contentType: type, sourceRetrospectiveId: retroId || null, sourceContentId: params.get('sourceContentId') })
        }
      );
      onCreated(content.id);
    });
  };

  const goToReview = () => {
    if (createdId) {
      navigate(`/growth-content/${createdId}`);
    }
  };

  return (
    <section className="content-creation">
      <div className="page-header">
        <h1>内容创作</h1>
        <p className="page-subtitle">把今天发生的事情，变成一篇值得发布的内容。</p>

        <div className="flow-indicator">
          <span className="flow-step">真实经历</span>
          <span className="flow-step">提炼问题</span>
          <span className="flow-step">生成内容</span>
          <span className="flow-step">人工审核</span>
        </div>
      </div>

      {!contentCreated ? (
        <div className="content-creation-workspace">
          {/* 左侧：内容来源 */}
          <div className="content-source-section">
            <h2 className="section-title">复盘来源</h2>

            {source ? (
              <div className="retro-card">
                <div className="retro-date">{source.date}</div>
                <div className="retro-summary">{source.whatHappened}</div>
                <div className="retro-meta">
                  <span className="retro-tag">真实复盘</span>
                </div>
                <Link
                  to={`/retrospectives/${source.id}`}
                  className="retro-view-link"
                  onClick={(e) => e.preventDefault()}
                >
                  查看完整复盘 →
                </Link>
              </div>
            ) : (
              <div className="retro-selector">
                <label className="section-title">选择复盘来源</label>
                <select
                  value={retroId}
                  onChange={event => setRetroId(event.target.value)}
                  required={account === 'growth'}
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1e3cc', borderRadius: '6px', fontSize: '15px' }}
                >
                  <option value="">请选择（Growth 必选）</option>
                  {state.retrospectives
                    .filter(x => (x.analysis?.contentPotential ?? 0) >= 6)
                    .map(x => (
                      <option value={x.id} key={x.id}>
                        {x.date} · {x.whatHappened.slice(0, 35)}
                      </option>
                    ))}
                </select>
                {account === 'growth' && !retroId && (
                  <p style={{ color: '#d32f2f', fontSize: '14px', marginTop: '8px' }}>
                    Growth 类型必须选择一个复盘来源
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 右侧：创作方向 */}
          <div className="content-creation-section">
            <h2 className="section-title">创作方向</h2>

            <form className="creation-form" onSubmit={handleSubmit}>
              <div>
                <label>账号</label>
                <select
                  value={account}
                  onChange={event => setAccount(ContentAccountSchema.parse(event.target.value))}
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1e3cc', borderRadius: '6px', fontSize: '15px' }}
                >
                  {ContentAccountSchema.options.map(value => (
                    <option key={value} value={value}>{accountLabels[value]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>内容类型</label>
                <select
                  value={type}
                  onChange={event => setType(ContentTypeSchema.parse(event.target.value))}
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1e3cc', borderRadius: '6px', fontSize: '15px' }}
                >
                  {ContentTypeSchema.options.map(value => (
                    <option key={value} value={value}>{typeLabels[value]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>主题</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={topic}
                  onChange={event => setTopic(event.target.value)}
                  placeholder="请输入内容主题"
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1e3cc', borderRadius: '6px', fontSize: '15px' }}
                />
                {account === 'english' && (
                  <p className="creation-hint">
                    离线可用：尴尬时刻英语50句、拒绝别人英语50句、夸人英语50句。已生成主题复用现有稿件，不再请求模型。
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="creation-button"
                disabled={busy || (account === 'growth' && !retroId)}
              >
                {busy ? '正在生成...' : '生成内容 →'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="content-success">
          <h2>内容创建成功！</h2>
          <p>您的新内容已经生成完成，现在可以进行编辑和审核。</p>
          <div className="success-actions">
            <button className="em-primary" onClick={goToReview}>
              立即进入内容审核 →
            </button>
            <Link to="/" className="secondary-button">
              返回 Dashboard
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function MetricsEditor({ content, state, busy, act }: { content: PublishedContent; state: GrowthLoopState; busy: boolean; act: LoopAction }) {
  const metric = latest(state.metrics, content.id);
  const [values, setValues] = useState(() => ({ views: metric?.views ?? 0, likes: metric?.likes ?? 0, favorites: metric?.favorites ?? 0, comments: metric?.comments ?? 0, followersGained: metric?.followersGained ?? 0, note: '' }));
  const records = state.metrics.filter(x => x.contentId === content.id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const feedback = state.feedback.filter(x => x.contentId === content.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="loop-performance">
      <h2>Daily Content Feedback · 手动录入</h2>
      <p>请输入当前累计数据，尽量统一发布后观察时长。每次保存保留历史，不覆盖旧记录。{content.isDemo ? '当前为合成演示内容，数据不计入真实表现。' : ''}</p>
      <form className="english-compose" onSubmit={event => { event.preventDefault(); act(() => apiRequest(`${base}/contents/${content.id}/metrics`, 'normal', ContentMetricsSchema, { method: 'POST', body: JSON.stringify(values) })); }}>
        <fieldset className="loop-fields" disabled={busy}>
          {(['views', 'likes', 'favorites', 'comments', 'followersGained'] as const).map(key => (
            <label key={key}>
              {key}
              <input
                type="number"
                min={0}
                max={1000000000}
                required
                value={values[key]}
                onChange={event => setValues({ ...values, [key]: Number(event.target.value) })}
              />
            </label>
          ))}
          <label>
            观察窗口 / 备注
            <input
              value={values.note}
              onChange={event => setValues({ ...values, note: event.target.value })}
            />
          </label>
          <button className="em-primary">保存流量</button>
        </fieldset>
      </form>
      <button disabled={busy || !metric} onClick={() => act(() => apiRequest(`${base}/contents/${content.id}/analyze`, 'normal', ContentFeedbackSchema, { method: 'POST' }))}>
        Analyze Performance
      </button>
      {feedback.map(item => (
        <Feedback key={item.id} value={item} content={content} stale={item.metricsId !== metric?.id} busy={busy} act={act} />
      ))}
      <h3>Performance History</h3>
      {records.map(item => (
        <details id={`metric-${item.id}`} key={item.id}>
          <summary>{stamp(item.capturedAt)} · {item.views} views</summary>
          <pre>{JSON.stringify(item, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}
function Feedback({ value, content, stale, busy, act }: { value: ContentFeedback; content: PublishedContent; stale: boolean; busy: boolean; act: LoopAction }) {
  const [outcome, setOutcome] = useState<ExperimentOutcome>('promote_to_strategy');
  const experiment = content.experiment;
  return (
    <section id={`feedback-${value.id}`} className="english-compose">
      <h2>KEEP / CHANGE / NEXT EXPERIMENT</h2>
      {stale ? <p>历史反馈：存在更新指标，请重新 Analyze。</p> : null}
      <p>{value.performanceSummary}</p>
      <p><strong>结论 {value.verdict}</strong> · 置信度 {value.confidence}{value.hoursSincePublish === null ? '' : ` · 发布后 ${value.hoursSincePublish.toFixed(1)}h`}</p>
      <dl className="loop-analysis">
        <div><dt>观察（事实）</dt><dd>{value.observation}</dd></div>
        <div><dt>假设（尚未验证）</dt><dd>{value.hypothesis}</dd></div>
        <div><dt>证据</dt><dd>{value.evidence}</dd></div>
        <div>
          <dt>相对表现</dt>
          <dd>{value.relative.comparable
            ? `同账号同窗口（${value.relative.bucket}）基线 ${value.relative.sampleCount} 篇：阅读 ${signedPercent(value.relative.relativeViews)} · 点赞 ${signedPercent(value.relative.relativeLikes)} · 收藏 ${signedPercent(value.relative.relativeSaves)} · 评论 ${signedPercent(value.relative.relativeComments)}`
            : `样本不足（${value.relative.sampleCount} 篇），本窗口不做比较，不判定赢家。`}</dd>
        </div>
      </dl>
      <dl className="loop-analysis">
        {Object.entries(value.rates).map(([key, number]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{percentage(number)}</dd>
          </div>
        ))}
      </dl>
      <div className="loop-table-wrap">
        <table>
          <caption>历史对比：排除当前篇；同类型限定同账号；零阅读不计入比例均值。</caption>
          <thead>
            <tr>
              <th>基准</th>
              <th>样本 / 比例样本</th>
              <th>平均阅读</th>
              <th>点赞率</th>
              <th>收藏率</th>
              <th>评论率</th>
              <th>关注转化率</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(value.comparisons).map(([key, average]) => (
              <tr key={key}>
                <th>{key}</th>
                <td>{average.sampleCount} / {average.rateSampleCount}</td>
                <td>{average.avgViews?.toFixed(0) ?? '—'}</td>
                <td>{percentage(average.avgLikeRate)}</td>
                <td>{percentage(average.avgFavoriteRate)}</td>
                <td>{percentage(average.avgCommentRate)}</td>
                <td>{percentage(average.avgFollowConversionRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>KEEP</h3>
      {value.KEEP.length ? value.KEEP.map(text => <p key={text}>{text}</p>) : <p>本次不给 KEEP 结论（当前结论 {value.verdict}，允许不下判断）。</p>}
      <h3>WATCH</h3>
      {value.WATCH.length ? value.WATCH.map(text => <p key={text}>{text}</p>) : <p>—</p>}
      <h3>CHANGE</h3>
      {value.CHANGE.length ? value.CHANGE.map(text => <p key={text}>{text}</p>) : <p>—</p>}
      <h3>NEXT EXPERIMENT · {value.NEXT_EXPERIMENT.variable} = {value.NEXT_EXPERIMENT.variant}</h3>
      <p>假设（尚未验证）：{value.NEXT_EXPERIMENT.hypothesis}</p>
      <p>{value.NEXT_EXPERIMENT.instruction}</p>
      <p>保持不变：{value.NEXT_EXPERIMENT.keepConstant}</p>
      <p>观察指标：{value.NEXT_EXPERIMENT.targetMetric} · 状态 {value.NEXT_EXPERIMENT.status} · 样本 {value.NEXT_EXPERIMENT.currentSamples}/{value.NEXT_EXPERIMENT.requiredSamples} · 置信度 {value.NEXT_EXPERIMENT.confidence}</p>
      <p>基线：{value.NEXT_EXPERIMENT.baseline}</p>
      {experiment && experiment.status !== 'completed' ? (
        <div className="loop-decide">
          <label htmlFor={`decide-${value.id}`}>结束本轮实验</label>
          <select id={`decide-${value.id}`} value={outcome} onChange={event => setOutcome(event.target.value as ExperimentOutcome)}>
            <option value="promote_to_strategy">升级为长期策略（需样本达标）</option>
            <option value="continue_testing">证据不足，继续测试</option>
            <option value="reject">否决该取值，不再自动提议</option>
          </select>
          <button
            disabled={busy}
            onClick={() => act(() => apiRequest(`${base}/contents/${content.id}/experiment`, 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ revision: content.revision, outcome }) }))}
          >
            提交实验结论
          </button>
          <p>样本不足时升级会被拒绝（INSUFFICIENT_EVIDENCE），只能留在 WATCH。</p>
        </div>
      ) : null}
      <Link to="/">返回 Dashboard 查看下一篇策略 →</Link>
    </section>
  );
}
function ContentList({ items, state }: { items: PublishedContent[]; state: GrowthLoopState }) {
  return (
    <div className="loop-list">
      {items.length ? (
        [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(item => (
          <Link key={item.id} to={`/growth-content/${item.id}`}>
            <strong>{item.title}</strong>
            <span>{item.account} · {item.contentType} · {item.status} · {item.isDemo ? '合成 Demo' : '个人记录'} · {latest(state.metrics, item.id)?.views ?? '—'} views</span>
          </Link>
        ))
      ) : (
        <p>暂无内容。</p>
      )}
    </div>
  );
}
function History({ state }: { state: GrowthLoopState }) {
  return (
    <section>
      <h1>History</h1>
      <h2>Retrospective History</h2>
      <div className="loop-list">
        {state.retrospectives.map(item => (
          <Link key={item.id} to={`/retrospectives/${item.id}`}>
            <strong>{item.date} · {item.whatHappened.slice(0, 80)}</strong>
            <span>Content Potential: {item.analysis?.contentPotential ?? '待分析'}</span>
          </Link>
        ))}
      </div>
      <h2>Content History</h2>
      <ContentList items={state.contents} state={state} />
      <h2>Performance History</h2>
      <div className="loop-list">
        {state.metrics.map(item => (
          <Link key={item.id} to={`/growth-content/${item.contentId}#metric-${item.id}`}>
            {state.contents.find(x => x.id === item.contentId)?.title} · {stamp(item.capturedAt)} · {item.views} views
          </Link>
        ))}
      </div>
      <h2>Feedback History</h2>
      <div className="loop-list">
        {state.feedback.map(item => (
          <Link key={item.id} to={`/growth-content/${item.contentId}#feedback-${item.id}`}>
            {stamp(item.createdAt)} · {item.performanceSummary}
          </Link>
        ))}
      </div>
    </section>
  );
}
