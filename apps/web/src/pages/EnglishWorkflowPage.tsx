import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ENGLISH_DEMO_TOPICS, ENGLISH_CANDIDATE_TOPICS, EnglishToneSchema,
  EnglishWorkflowInfoSchema, EnglishGenerateResultSchema, EnglishWorkflowDraftSchema,
  EnglishReviewInputSchema, EnglishExportResultSchema, normalizeEnglishTopic, similarEnglishTopics,
  type EnglishWorkflowDraft, type EnglishWorkflowInput, type EnglishHistoryEntry, type EnglishWriting,
} from '@emotion-studio/contracts';
import { apiRequest } from '../lib/api';
import './english-workflow.css';

const base = '/api/v1/english';
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

export default function EnglishWorkflowPage() {
  const { id } = useParams();
  return <main className="english-mvp">
    <header className="english-header"><Link to="/">little english<span>碎片时间学一点英语</span></Link><span>ENGLISH CONTENT STUDIO</span></header>
    {id ? <EnglishReview key={id} id={id} /> : <EnglishHome />}
  </main>;
}

function EnglishHome() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState<string>(ENGLISH_DEMO_TOPICS[0]);
  const [tone, setTone] = useState<EnglishWorkflowInput['tone']>('日常');
  const [history, setHistory] = useState<EnglishHistoryEntry[]>([]);
  const [mode, setMode] = useState<'demo' | 'real' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<EnglishHistoryEntry | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const load = new AbortController();
    void apiRequest(base, 'normal', EnglishWorkflowInfoSchema, { signal: load.signal })
      .then((data) => { if (!load.signal.aborted) { setHistory(data.history); setMode(data.mode); } })
      .catch((caught) => { if (!load.signal.aborted) setError(messageOf(caught)); });
    return () => { load.abort(); controller.current?.abort(); };
  }, []);
  const similar = similarEnglishTopics(topic, history);
  async function generate(nextTopic = topic) {
    if (!nextTopic.trim() || controller.current) return;
    setTopic(nextTopic); setError(''); setExisting(null);
    const previous = history.find((entry) => normalizeEnglishTopic(entry.topic) === normalizeEnglishTopic(nextTopic));
    if (previous) { setExisting(previous); return; }
    const request = new AbortController();
    controller.current = request; setBusy(true);
    try {
      const result = await apiRequest(base + '/generate', 'normal', EnglishGenerateResultSchema, {
        method: 'POST', signal: request.signal, body: JSON.stringify({ topic: nextTopic, tone }),
      });
      if (request.signal.aborted) return;
      if (result.duplicate) {
        setExisting(result.existing ?? (result.draft ? {
          topic: result.draft.writing.topic, generated_at: result.draft.generated_at, status: result.draft.status,
          output_path: result.draft.output_path, draft_id: result.draft.id,
        } : null));
      } else if (result.draft) navigate('/english/' + result.draft.id);
    } catch (caught) { setError(request.signal.aborted ? '已取消请求。' : messageOf(caught)); }
    finally { controller.current = null; setBusy(false); }
  }
  return <>
    <section className="english-intro"><p className="english-eyebrow">ONE TOPIC. FIFTY LITTLE CONVERSATIONS.</p><h1>把生活，聊成英语。</h1><p>一个主题，50句中英表达，5张图。<br />你负责最后看一眼，我们把发布包整理好。</p></section>
    <section className="english-compose" aria-label="主题生成">
      <label>主题<input aria-label="主题" value={topic} maxLength={60} disabled={busy} onChange={(event) => { setTopic(event.target.value); setExisting(null); }} placeholder="例如：尴尬时刻英语50句" /></label>
      <div className="english-generate-row"><label>语气 · 可选<select aria-label="语气" value={tone} disabled={busy} onChange={(event) => setTone(EnglishToneSchema.parse(event.target.value))}>{EnglishToneSchema.options.map((item) => <option key={item}>{item}</option>)}</select></label><button className="em-primary" disabled={busy || !topic.trim()} onClick={() => void generate()}>{busy ? '正在生成50句…' : 'Generate'} <span>↗</span></button></div>
      <p className="english-mode">{mode === 'demo' ? '离线原创 Demo · 三个新主题 · 不消耗模型额度，语气不改变样稿' : mode === 'real' ? '真实 AI · 一次结构化请求 · 无后台自动 repair' : '正在连接本地内容服务…'}</p>
      {busy ? <p role="status">分析主题与生成中英内容中，随后自动分为五页。<button onClick={() => controller.current?.abort()}>取消</button></p> : null}
    </section>
    {error ? <p className="em-error" role="alert">{error}</p> : null}
    {existing ? <section className="em-notice" role="status"><strong>该主题已经生成过，是否查看已有内容？</strong><p>{existing.topic} · {existing.generated_at ? new Date(existing.generated_at).toLocaleString() : '既有生产记录'}</p>{existing.draft_id ? <Link className="em-primary" to={'/english/' + existing.draft_id}>查看已有内容</Link> : <p>旧生产记录未附本地稿件；不会再次调用模型。请换一个新主题。</p>}</section> : null}
    {similar.length ? <p className="em-notice">相似主题提醒：{similar.map((entry) => entry.topic).join('、')}。这是名称查重，不调用模型；确认不同后仍可生成。</p> : null}
    <section className="english-demos"><div className="english-section-head"><h2>今天，从新场景开始</h2><span>3 个一键 Demo</span></div><div className="english-demo-grid">{ENGLISH_DEMO_TOPICS.map((item, index) => <button key={item} disabled={busy} onClick={() => void generate(item)}><span>0{index + 1}</span><strong>{item}</strong><small>{['把尴尬轻轻接住', '温柔，也有边界', '真诚夸到点子上'][index]}</small><i>生成或查看 →</i></button>)}</div></section>
    <details className="english-candidates"><summary>还有这些新主题可以做</summary><div>{ENGLISH_CANDIDATE_TOPICS.map((item) => <button key={item} disabled={busy} onClick={() => { setTopic(item); setExisting(null); }}>{item}</button>)}</div></details>
    {history.some((entry) => entry.draft_id) ? <section className="english-history"><h2>继续上次的内容</h2>{history.filter((entry) => entry.draft_id).map((entry) => <Link key={entry.topic} to={'/english/' + entry.draft_id}>{entry.topic}<span>{entry.status === 'exported' ? '已导出' : entry.status === 'approved' ? '已批准' : '需要修改'} →</span></Link>)}</section> : null}
  </>;
}

function EnglishReview({ id }: { id: string }) {
  const [draft, setDraft] = useState<EnglishWorkflowDraft | null>(null);
  const [writing, setWriting] = useState<EnglishWriting | null>(null);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [output, setOutput] = useState<{ output_path: string; files: { name: string; url: string }[] } | null>(null);
  const operation = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest(base + '/drafts/' + id, 'normal', EnglishWorkflowDraftSchema, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setDraft(data); setWriting(data.writing); } })
      .catch((caught) => { if (!controller.signal.aborted) setError(messageOf(caught)); });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(update: Partial<EnglishWriting>) {
    setWriting((current) => current ? { ...current, ...update } : current);
    setDirty(true); setOutput(null); setNotice('');
  }
  async function save(status: 'approved' | 'needs_revision') {
    if (!draft || !writing || operation.current) return;
    const validation = EnglishReviewInputSchema.safeParse({ revision: draft.revision, writing, status });
    if (!validation.success) { setError(validation.error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).slice(0, 3).join('；')); return; }
    operation.current = true; setBusy(true); setError('');
    try {
      const saved = await apiRequest(base + '/drafts/' + id, 'normal', EnglishWorkflowDraftSchema, { method: 'PUT', body: JSON.stringify(validation.data) });
      setDraft(saved); setWriting(saved.writing); setDirty(false); setOutput(null);
      setNotice(status === 'approved' ? '已批准。可以生成最终发布包。' : '已保存为“需要修改”，五页预览已更新。');
    } catch (caught) { setError(messageOf(caught)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function publishingPackage() {
    if (!draft || dirty || draft.status !== 'approved' || operation.current) return;
    operation.current = true; setBusy(true); setError(''); setNotice('正在渲染5张独立 PNG，不调用模型…');
    try {
      const result = await apiRequest(base + '/drafts/' + id + '/export', 'normal', EnglishExportResultSchema, { method: 'POST', body: JSON.stringify({ revision: draft.revision }) });
      setOutput(result); setNotice('发布包已生成：5张 PNG + content.md + content.json。');
    } catch (caught) { setError(messageOf(caught)); setNotice(''); }
    finally { operation.current = false; setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('已复制。'); }
    catch { setError('浏览器未允许复制，请从编辑框中手动复制。'); }
  }
  if (!writing || !draft) return <p role={error ? 'alert' : 'status'}>{error || '正在读取内容…'}</p>;
  const approved = draft.status === 'approved' && !dirty;
  return <section className="english-review">
    <div className="english-section-head"><div><p className="english-eyebrow">REVIEW / 50 SENTENCES / 5 PAGES</p><h1>先看一眼，再发布。</h1></div><span className={approved ? 'em-badge approved' : 'em-badge'}>{approved ? '已批准' : '需要修改'}</span></div>
    <p className="english-mode">{draft.provider === 'demo' ? '本次为全新编写的离线原创 Demo，不是实时 AI 生成。' : '真实 AI 生成 · ' + draft.model} 修改任何内容后需要重新批准。</p>
    {error ? <p className="em-error" role="alert">{error}</p> : null}{notice ? <p className="em-notice" role="status">{notice}</p> : null}
    <div className="english-review-actions"><button disabled={busy} onClick={() => void save('needs_revision')}>需要修改 / 保存预览</button><button className="em-primary" disabled={busy} onClick={() => void save('approved')}>批准</button><button className="em-primary" disabled={busy || !approved} onClick={() => void publishingPackage()}>{busy ? '处理中…' : 'Generate Publishing Package'}</button></div>
    <label className="english-topic-edit">主题<input aria-label="编辑主题" value={writing.topic} maxLength={60} disabled={busy} onChange={(event) => change({ topic: event.target.value })} /></label>
    <details><summary>主题分析与分组方向</summary><p>{writing.analysis}</p><p>{writing.groupNames.join(' / ')}</p></details>
    <div className="english-section-head"><h2>五张卡片 · 3:4</h2><span>{dirty ? '有未保存修改，保存后更新预览' : '与导出 PNG 使用同一模板'}</span></div>
    <div className="english-card-grid">{[1, 2, 3, 4, 5].map((n) => <figure key={n}><div className="english-card-frame"><iframe title={'Page ' + n} sandbox="" src={base + '/drafts/' + id + '/pages/' + n + '?revision=' + draft.revision} /></div><figcaption>Page {n} · {n * 10 - 9}–{n * 10}</figcaption></figure>)}</div>
    <section className="english-lines"><div className="english-section-head"><h2>逐句核对</h2><span>英文为主，中文自然好懂</span></div><nav aria-label="编辑页码">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-pressed={page === n} onClick={() => setPage(n)}>Page {n}</button>)}</nav>
      {writing.sentences.slice((page - 1) * 10, page * 10).map((line) => <div className="english-edit-line" key={line.number}><span>{String(line.number).padStart(2, '0')}</span><label>英文<input aria-label={'英文 ' + line.number} value={line.english} maxLength={110} disabled={busy} onChange={(event) => change({ sentences: writing.sentences.map((value) => value.number === line.number ? { ...value, english: event.target.value } : value) })} /></label><label>中文<input aria-label={'中文 ' + line.number} value={line.chinese} maxLength={55} disabled={busy} onChange={(event) => change({ sentences: writing.sentences.map((value) => value.number === line.number ? { ...value, chinese: event.target.value } : value) })} /></label></div>)}
    </section>
    <section className="english-publish-copy"><h2>发布文案</h2><p>5个候选标题，点击选用，也可以直接修改。</p><div className="english-title-options">{writing.titles.map((title) => <button key={title} disabled={busy} onClick={() => change({ title })}>{title}</button>)}</div>
      <label>最终标题<input aria-label="最终标题" value={writing.title} maxLength={60} disabled={busy} onChange={(event) => change({ title: event.target.value })} /></label>
      <label>正文<textarea aria-label="发布正文" value={writing.body} maxLength={700} disabled={busy} onChange={(event) => change({ body: event.target.value })} /></label>
      <label>标签（5–10个，用空格分隔）<input aria-label="标签" value={writing.tags.join(' ')} disabled={busy} onChange={(event) => change({ tags: event.target.value.split(' ') })} /></label>
      <div className="english-copy-actions"><button onClick={() => void copy(writing.title)}>复制标题</button><button onClick={() => void copy(writing.body)}>复制正文</button><button onClick={() => void copy(writing.tags.join(' '))}>复制标签</button><button onClick={() => void copy([writing.title, writing.body, writing.tags.join(' ')].join('\n\n'))}>复制完整文案</button></div>
    </section>
    {output ? <section className="english-downloads"><h2>最终发布包</h2><p><code>{output.output_path}</code></p><div>{output.files.map((file) => <a key={file.name} href={file.url} download={file.name}>{file.name} ↓</a>)}</div><p>七个文件已写入项目目录。逐张下载 PNG，或直接从 output 文件夹取用。</p></section> : null}
    <div className="english-review-actions"><button disabled={busy} onClick={() => void save('needs_revision')}>需要修改 / 保存预览</button><button className="em-primary" disabled={busy} onClick={() => void save('approved')}>批准</button><button className="em-primary" disabled={busy || !approved} onClick={() => void publishingPackage()}>Generate Publishing Package</button></div>
  </section>;
}
