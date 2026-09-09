import { ArrowLeft, Copy, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ContentItemListSchema, GeneratedContentSchema, PostRecordListSchema, PostRecordSchema, SavePostInputSchema,
  type English50Package, type GeneratedContent,
} from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { apiRequest, useRemote, type PreviewMode } from '../lib/api';
import { regenerateStudioContent } from '../lib/studioApi';
import { accountLabels } from '../lib/accounts';

export default function GeneratedContentPage() {
  const { id = '' } = useParams();
  const { mode, setMode } = usePreviewMode();
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useRemote('/api/v1/generated-contents/' + encodeURIComponent(id), mode, GeneratedContentSchema, refreshKey);
  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefreshKey((value) => value + 1); }} />;
  if (mode === 'empty') return <EmptyState title="没有找到生成结果" description="回到工作区保存一份输入，再生成草稿。" action="返回工作区" actionTo="/accounts/personal_growth" />;
  return <GeneratedEditor key={id} generated={state.data} mode={mode} />;
}

function localDateTime() {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function GeneratedEditor({ generated, mode }: { generated: GeneratedContent; mode: PreviewMode }) {
  const [title, setTitle] = useState(generated.title);
  const [body, setBody] = useState(generated.body);
  const [tags, setTags] = useState(generated.hashtags.join(' '));
  const [confirmed, setConfirmed] = useState(false);
  const [cover, setCover] = useState('');
  const [publishedAt, setPublishedAt] = useState(localDateTime);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [outputOverride, setOutputOverride] = useState(generated.output);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const records = useRemote('/api/v1/post-records?accountId=' + generated.accountId, mode, PostRecordListSchema);
  const sources = useRemote('/api/v1/content-items?accountId=' + generated.accountId, mode, ContentItemListSchema);
  useEffect(() => {
    if (records.status !== 'ready' || dirty) return;
    const post = records.data.find((item) => item.generatedContentId === generated.id);
    if (post) {
      setTitle(post.titleUsed); setBody(post.bodyUsed); setTags(post.hashtagsUsed.join(' '));
      setCover(post.coverType ?? ''); setSaved(true);
    }
  }, [records, generated.id, dirty]);
  const restricted = generated.publishability !== 'eligible';
  const blocked = mode === 'blocked' || restricted;
  const output = outputOverride;
  const edit = () => { setDirty(true); setConfirmed(false); setSaved(false); };
  async function regenerate(section: 'title' | 'hook' | 'body' | 'ending' | 'tags') {
    if (blocked || regenerating) return;
    setRegenerating(section); setError(''); setMessage('');
    try {
      const next = await regenerateStudioContent(generated.id, section, mode);
      setOutputOverride(next.output);
      setTitle(next.title); setBody(next.body); setTags(next.hashtags.join(' '));
      setDirty(true); setConfirmed(false); setSaved(false);
      setMessage(`已重新生成${section === 'title' ? '标题' : section === 'hook' ? '开头' : section === 'body' ? '正文' : section === 'ending' ? '结尾' : '标签'}，请人工核对。`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '局部重生成失败，请重试。'); }
    finally { setRegenerating(null); }
  }
  async function copy() {
    if (blocked) return;
    setError('');
    const english = output?.kind === 'english_50.v1' ? output.groups.map((group) =>
      group.groupName + '\n' + group.sentences.map((sentence, index) => (index + 1) + '. ' + sentence.english + '\n' + sentence.chinese + (sentence.usageNote ? '\n' + sentence.usageNote : '')).join('\n\n')).join('\n\n') : '';
    try { await navigator.clipboard.writeText([title, body, english, tags].filter(Boolean).join('\n\n')); setMessage('已复制发布包。请人工核对后再到平台发布。'); }
    catch { setError('浏览器未允许复制，请在正文中手动选择并复制。'); }
  }
  async function save(status: 'draft' | 'published') {
    if (blocked || busy || !confirmed) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const payload = SavePostInputSchema.parse({
        generatedContentId: generated.id, humanConfirmed: confirmed, status,
        publishedAt: status === 'published' ? new Date(publishedAt).toISOString() : null,
        titleUsed: title, bodyUsed: body, hashtagsUsed: tags.trim().split(/\s+/).filter(Boolean), coverType: cover.trim() || null,
      });
      await apiRequest('/api/v1/post-records', mode, PostRecordSchema, { method: 'POST', body: JSON.stringify(payload) });
      setSaved(true);
      setMessage(status === 'published' ? '已记录为发布。可以前往“发布与数据”录入表现。' : '已保存人工确认稿，可在发布与数据中继续查看。');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="detail-topline"><Link className="text-button" to={'/accounts/' + generated.accountId}><ArrowLeft size={15} />返回{accountLabels[generated.accountId]}工作区</Link><StatusPill tone="warning">{saved || generated.status === 'confirmed' ? '已有人工作品记录' : '草稿 · 待人工确认'}</StatusPill></div>
    {blocked ? <BlockedNotice title={restricted ? (generated.publishability === 'research_only' ? '仅供研究' : '需重新创作') : '当前为只读预览'} description="可以阅读研究结果；当前状态不能复制发布包或记录发布。" /> : null}
    {message ? <div className="action-notice is-success" role="status">{message}<Link to={'/posts?accountId=' + generated.accountId}>查看发布与数据</Link></div> : null}
    {error ? <div className="action-notice is-error" role="alert">{error}</div> : null}
    <div className="generated-layout">
      <aside className="panel generated-source">
        <p className="kicker">SOURCE MATERIAL</p><h3>原始输入</h3>
        {sources.status === 'loading' ? <p>正在载入素材…</p> : sources.status === 'error' ? <p>来源暂时无法载入。</p> : sources.data.filter((item) => generated.contentIds.includes(item.id)).map((item) => <article key={item.id}><span>{item.source}</span><p>{item.content}</p><small>{item.id}</small></article>)}
        <div className="source-analysis"><p className="kicker">ANALYSIS</p>{output?.kind === 'growth_post.v1' ? <><strong>事实 → 问题 → 行动</strong><p>{output.problemBreakdown ?? '已提炼普遍问题，等待人工核对。'}</p></> : null}{output?.kind === 'english_50.v1' ? <><strong>5 组 × 10 句</strong><p>{output.positioning}</p></> : null}{output?.kind === 'emotion_post.v1' ? <><strong>{output.themes.join(' / ')}</strong><p>先提炼情绪与冲突，再完成原创表达。</p></> : null}</div>
      </aside>
      <article className="panel generated-paper">
        <header><div><span className="demo-ai-label"><Sparkles size={14} />{generated.generatorLabel}</span><p>{generated.provider === 'mock' ? '当前使用演示生成器，未调用真实 AI。' : '由已配置的 DeepSeek 模型生成。'}</p></div></header>
        {output ? <div className="title-options" aria-label="候选标题">{output.titles.map((option, index) => <button key={index} disabled={blocked} onClick={() => { edit(); setTitle(option); }}>{option}</button>)}</div> : null}
        <section className="generated-section"><span>小红书标题</span><h2>{title}</h2><label className="studio-field">编辑标题<input aria-label="编辑标题" maxLength={80} value={title} disabled={blocked} onChange={(event) => { edit(); setTitle(event.target.value); }} /></label><button className="text-button" disabled={blocked || regenerating !== null} onClick={() => void regenerate('title')}>{regenerating === 'title' ? '正在换标题…' : '换一个标题'}</button></section>
        <section className="generated-section generated-body"><label className="studio-field">正文<textarea aria-label="编辑正文" value={body} maxLength={8000} disabled={blocked} onChange={(event) => { edit(); setBody(event.target.value); }} /></label><small>{body.length} 字 · 编辑后需重新确认</small><div className="inline-actions"><button className="text-button" disabled={blocked || regenerating !== null} onClick={() => void regenerate('hook')}>{regenerating === 'hook' ? '正在重写开头…' : '重写开头'}</button><button className="text-button" disabled={blocked || regenerating !== null} onClick={() => void regenerate('body')}>{regenerating === 'body' ? '正在重写正文…' : '重写正文'}</button><button className="text-button" disabled={blocked || regenerating !== null} onClick={() => void regenerate('ending')}>{regenerating === 'ending' ? '正在换结尾…' : '换个结尾'}</button></div></section>
        {output?.hook || output?.endingQuestion ? <section className="generation-structure"><div><span>开头 Hook</span><p>{output.hook ?? '从具体场景切入，再进入正文。'}</p></div><div><span>结尾讨论问题</span><p>{output.endingQuestion ?? '把你的经验留给读者继续讨论。'}</p></div></section> : null}
        {output?.kind === 'english_50.v1' ? <EnglishPackage output={output} /> : null}
        {output?.kind === 'growth_post.v1' ? <details className="package-detail"><summary>查看生成稿的事实引用与视觉建议</summary>{output.factClaims.map((fact, index) => <blockquote key={index}>{fact.claim}<small>{fact.truthAnchorIds.join('、')}</small></blockquote>)}{output.story ? <p><strong>故事抽象：</strong>{output.story}</p> : null}{output.problemBreakdown ? <p><strong>问题拆解：</strong>{output.problemBreakdown}</p> : null}{output.solution ? <p><strong>可执行建议：</strong>{output.solution}</p> : null}{output.visualSuggestions?.map((item) => <p key={item.kind}><strong>{item.kind} × {item.count}：</strong>{item.description}</p>)}</details> : null}
        {output?.kind === 'emotion_post.v1' ? <div className="workspace-warning"><strong>原创相似风险：{output.originalityRisk.level}</strong><span>{output.originalityRisk.reasons.join('；')}</span><span>来源主题：{output.themes.join(' / ')}</span>{output.goldenQuotes?.map((quote) => <blockquote key={quote}>{quote}</blockquote>)}{output.visualSuggestions?.map((item) => <span key={item.kind}>{item.kind} × {item.count}：{item.description}</span>)}</div> : null}
        <section className="generated-section"><span>标签</span><div className="generated-tags">{tags.split(/\s+/).filter(Boolean).map((tag, index) => <i key={index}>{tag}</i>)}</div><label className="studio-field">编辑标签<input aria-label="编辑标签" value={tags} maxLength={400} disabled={blocked} onChange={(event) => { edit(); setTags(event.target.value); }} /></label><button className="text-button" disabled={blocked || regenerating !== null} onClick={() => void regenerate('tags')}>{regenerating === 'tags' ? '正在换标签…' : '换一组标签'}</button></section>
      </article>
      <aside className="panel generated-note studio-form">
        <p className="kicker">REVIEW & RECORD</p><h3>由你完成最后确认。</h3>
        <p>记录的是你手动完成的发布。作品正文与表现数据会分开保存。</p>
        <dl><div><dt>生成器</dt><dd>{generated.provider}</dd></div><div><dt>模型</dt><dd>{generated.model}</dd></div><div><dt>来源素材</dt><dd>{generated.contentIds.length} 条</dd></div></dl>
        <details className="package-detail"><summary>查看生成与来源提醒</summary><ul>{generated.reviewIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details>
        <button className="secondary-button" disabled={blocked} onClick={() => void copy()}><Copy size={15} />复制完整发布包</button>
        <label className="studio-field">封面类型<input value={cover} onChange={(event) => setCover(event.target.value)} maxLength={100} placeholder="例如：文字卡片" disabled={blocked} /></label>
        <label className="studio-field">实际发布时间<input aria-label="实际发布时间" type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} disabled={blocked} /></label>
        <label className="human-confirm"><input type="checkbox" checked={confirmed} disabled={blocked} onChange={(event) => setConfirmed(event.target.checked)} />我已核对事实、语言、来源与原创表达</label>
        <button className="secondary-button" disabled={blocked || busy || !confirmed} onClick={() => void save('draft')}>保存人工确认稿</button>
        <button className="primary-button" disabled={blocked || busy || !confirmed || !publishedAt} onClick={() => void save('published')}>{busy ? '正在保存…' : '标记已手动发布'}</button>
      </aside>
    </div>
  </>;
}

function EnglishPackage({ output }: { output: English50Package }) {
  return <section className="english-package">
    <header><h3>5 组 · 50 句 · 5 页</h3><p>{output.positioning}</p><p>{output.audience}</p></header>
    {output.groups.map((group, index) => <details className="package-detail english-group" key={group.groupName} open={index === 0}>
      <summary>第 {index + 1} 页 · {group.groupName} · 10 句</summary>
      <ol start={index * 10 + 1}>{group.sentences.map((sentence) => <li key={sentence.english}><strong>{sentence.english}</strong><p>{sentence.chinese}</p>{sentence.usageNote ? <small>{sentence.usageNote}</small> : null}</li>)}</ol>
      <p className="page-visual-note">{output.fivePageLayout[index]?.visualSuggestion}</p>
    </details>)}
    <details className="package-detail"><summary>五页排版与配图建议</summary>{output.fivePageLayout.map((page) => <p key={page.pageNumber}>第 {page.pageNumber} 页 / {page.headline}：{page.visualSuggestion}</p>)}<p>{output.visualSuggestions.join('；')}</p></details>
  </section>;
}
