import { useState } from 'react';
import { Link } from 'react-router-dom';
import { growthCardHtml, growthCardPages, growthPublishText, normalizePublishText, PublishedContentSchema, type PublishedContent, type RejectReason, type Retrospective } from '@emotion-studio/contracts';
import { apiRequest } from '../lib/api';
import './review-workspace.css';

export type LoopAction = (task: () => Promise<unknown>) => void;

const statusLabels: Record<string, string> = { draft: '草稿', review: '待审核', ready: '已通过', published: '已发布', rejected: '已拒绝' };
const typeLabels: Record<string, string> = { story: '真实故事', solution: '问题解决', reflection: '反思随笔', list: '清单合集', educational: '知识科普' };
const accountLabels: Record<string, string> = { growth: '个人成长', english: '趣味英语', emotion: '情绪灵感库' };
const rejectReasonLabels: Record<RejectReason, string> = { not_me: '不像我会说的话', too_dramatic: '太夸张', too_preachy: '太说教', factually_wrong: '事实不对', bad_title: '标题不好', no_value: '没有价值', private_topic: '涉及隐私', other: '其他' };
const formatDay = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}月${date.getDate()}日`;
};

export function GrowthContentReview({ content, sourceRetro, busy, act }: { content: PublishedContent; sourceRetro?: Retrospective | undefined; busy: boolean; act: LoopAction }) {
  const [writing, setWriting] = useState(content.writing);
  const [english, setEnglish] = useState(content.english);
  const [note, setNote] = useState(content.note);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [publishTime, setPublishTime] = useState(() => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [rejectReason, setRejectReason] = useState<RejectReason>('not_me');
  const title = english?.title ?? writing?.title ?? content.title;
  const snapshot = { ...content, title, writing, english, note };
  const pages = growthCardPages(snapshot), currentPage = Math.min(page, Math.max(1, pages.length));
  const dirty = JSON.stringify({ writing, english, note }) !== JSON.stringify({ writing: content.writing, english: content.english, note: content.note });
  const published = content.status === 'published';
  const rejected = content.status === 'rejected';
  const locked = published || rejected;
  const base = `/api/v1/growth-loop/contents/${content.id}`;
  function save(status: 'review' | 'ready') {
    act(() => apiRequest(base + '/review', 'normal', PublishedContentSchema, { method: 'PUT', body: JSON.stringify({ revision: content.revision, writing, english, note, status }) }));
  }
  function reject() {
    act(() => apiRequest(base + '/reject', 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ revision: content.revision, reason: rejectReason }) }));
  }
  async function exportPng() {
    setExporting(true); setMessage('');
    try {
      const checked = PublishedContentSchema.safeParse(snapshot);
      if (!checked.success) throw new Error('请先填写有效标题和完整内容，再导出。');
      const response = await fetch('/api/v1/growth-loop/preview/png', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: snapshot, page: currentPage }) });
      if (!response.ok) throw new Error('导出失败，请检查文字长度和服务端浏览器。');
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${content.account}-page-${currentPage}.png`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('PNG 已导出：900 × 1200');
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败'); }
    finally { setExporting(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setMessage('已复制'); } catch { setMessage('复制不可用，请在输入框中手动复制。'); } }
  if (content.status === 'draft') return <section className="growth-review-workspace">
    <header className="review-header"><h1>内容审核</h1><p className="review-subtitle">把 AI 生成的初稿，变成真正属于你的内容。</p></header>
    <section className="review-draft-pending"><h2>待生成 · {content.topic}</h2><p>内容来源与账号已保存，生成后进入人工审核。</p><button className="em-primary" disabled={busy} onClick={() => act(() => apiRequest(base + '/generate', 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ revision: content.revision }) }))}>生成内容</button></section>
  </section>;
  const bodyValue = english?.body ?? writing?.body ?? '';
  const publishText = growthPublishText(snapshot);
  const sourceSummary = sourceRetro ? sourceRetro.analysis?.summary ?? sourceRetro.whatHappened : content.isDemo ? '这是合成演示内容，用于展示完整创作流程，不代表真实经历。' : `来自${accountLabels[content.account] ?? content.account}账号的内容记录。`;
  return <section className="growth-review-workspace">
    <header className="review-header">
      <h1>内容审核</h1>
      <p className="review-subtitle">把 AI 生成的初稿，变成真正属于你的内容。</p>
      <div className="review-meta">
        <span>来源：{sourceRetro ? `${formatDay(sourceRetro.date)}真实复盘` : content.isDemo ? '合成演示数据' : accountLabels[content.account] ?? content.account}</span>
        <span>内容类型：{typeLabels[content.contentType] ?? content.contentType}</span>
        <span>状态：{statusLabels[content.status] ?? content.status}</span>
      </div>
    </header>

    <div className="review-columns">
      <div className="review-editor">
        <div className="review-editor-top">
          <span className={`edit-state ${dirty ? 'is-dirty' : ''}`}>{dirty ? '已修改' : '未修改'}</span>
          <span>{published ? '已发布内容为只读快照。' : dirty ? '预览与导出使用当前编辑，发布前须重新保存。' : '当前已保存。'}</span>
        </div>
        <section className="review-publish-copy" aria-labelledby="publish-copy-heading">
          <h2 id="publish-copy-heading">发布文案</h2>
          <p id="publish-copy-hint">正文、结尾问题和标签已整理为纯文本。核对后复制到发布页，标题单独复制。</p>
          <textarea aria-label="可复制的发布文案" aria-describedby="publish-copy-hint" readOnly rows={8} value={publishText} />
          <div className="review-copy-row"><button className="em-primary" onClick={() => void copy(publishText)}>复制发布文案</button><button onClick={() => void copy(normalizePublishText(title))}>复制标题</button><button onClick={() => void copy(normalizePublishText(bodyValue))}>复制正文</button><button onClick={() => void copy((english?.tags ?? writing?.tags ?? []).join(' '))}>复制标签</button></div>
        </section>
        <fieldset disabled={locked || busy} className="manuscript">
          <label className="manuscript-title"><span>标题</span><input aria-label="内容标题" maxLength={80} value={title} onChange={event => english ? setEnglish({ ...english, title: event.target.value, titles: english.titles.includes(event.target.value) ? english.titles : [event.target.value, ...english.titles.slice(1)] }) : writing && setWriting({ ...writing, title: event.target.value })} /></label>
          <label className="manuscript-body"><span>正文</span><textarea rows={14} aria-label="内容正文" value={bodyValue} onChange={event => english ? setEnglish({ ...english, body: event.target.value }) : writing && setWriting({ ...writing, body: event.target.value })} /></label>
          {writing ? <div className="manuscript-sections">{(['corePoint', 'solution', 'endingQuestion'] as const).map((key, index) => <label key={key}><span>{['核心观点', '解决方案', '结尾问题'][index]}</span><textarea rows={2} value={writing[key]} onChange={event => setWriting({ ...writing, [key]: event.target.value })} /></label>)}</div> : null}
          <label className="manuscript-tags"><span>标签</span><input value={(english?.tags ?? writing?.tags ?? []).join(' ')} onChange={event => { const tags = event.target.value.split(/\s+/).filter(Boolean); if (english) setEnglish({ ...english, tags }); else if (writing) setWriting({ ...writing, tags }); }} /></label>
          {english ? <div className="english-lines"><h3>中英文 · 第 {currentPage} / 5 页</h3>{english.sentences.slice((currentPage - 1) * 10, currentPage * 10).map(line => <div className="english-edit-line" key={line.number}><span>{line.number}</span>{(['english', 'chinese'] as const).map(key => <label key={key}>{key === 'english' ? '英文' : '中文'}<input aria-label={`${key === 'english' ? '英文' : '中文'} ${line.number}`} value={line[key]} onChange={event => setEnglish({ ...english, sentences: english.sentences.map(item => item.number === line.number ? { ...item, [key]: event.target.value } : item) })} /></label>)}</div>)}</div> : null}
          <label className="manuscript-note"><span>审核备注</span><textarea rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
        </fieldset>
      </div>

      <aside className="review-judgment">
        <section>
          <h3>内容来源</h3>
          <p className="judgment-source">{sourceSummary}</p>
          {sourceRetro ? <Link className="judgment-link" to={`/retrospectives/${sourceRetro.id}`}>查看完整复盘 →</Link> : null}
        </section>
        <section>
          <h3>内容机会</h3>
          <p>{sourceRetro?.analysis?.contentReason ?? (content.note || '暂无补充判断，可在审核备注里记录这篇为什么值得发。')}</p>
        </section>
        <section>
          <h3>审核状态</h3>
          <p className="judgment-status">{statusLabels[content.status] ?? content.status}{content.isDemo ? ' · 合成演示' : ''}</p>
          <p className="judgment-sub">{content.provider === 'mock' ? '离线演示模式生成' : 'AI 草稿'}</p>
        </section>
      </aside>
    </div>

    <footer className="review-footer">
      {rejected ? <p className="review-published-note">已拒绝 · {rejectReasonLabels[(content.rejectReason ?? 'other') as RejectReason]}{content.rejectedAt ? ` · ${new Date(content.rejectedAt).toLocaleString()}` : ''}。已拒绝内容不计入任何指标，同时已作为学习信号写入账号策略。</p> : !published ? <>
        <div className="review-primary-actions">
          <button disabled={busy} onClick={() => save('review')}>保存修改</button>
          <button className="em-primary" disabled={busy} onClick={() => save('ready')}>通过审核 →</button>
        </div>
        <div className="review-secondary-actions">
          <Link to="/create">返回内容创作</Link>
          <button onClick={() => setPreview(!preview)} aria-pressed={preview}>预览发布效果 →</button>
        </div>
        <div className="review-secondary-actions review-reject-actions">
          <label htmlFor="review-reject-reason">拒绝理由</label>
          <select id="review-reject-reason" value={rejectReason} onChange={event => setRejectReason(event.target.value as RejectReason)}>{Object.entries(rejectReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button disabled={busy || dirty} onClick={reject}>标记为已拒绝</button>
          <span>拒绝会写入账号策略（需避免项），且这篇不会进入指标口径。</span>
        </div>
      </> : <p className="review-published-note">已发布：{new Date(content.publishTime!).toLocaleString()}。此快照只读，流量请在下方录入。</p>}
    </footer>

    {message ? <p role="status" className="review-message">{message}</p> : null}
    {(preview || english) ? <nav className="loop-page-nav" aria-label="内容预览页码">{pages.map((_, index) => <button key={index} aria-pressed={currentPage === index + 1} onClick={() => setPage(index + 1)}>{index + 1}</button>)}</nav> : null}
    {preview ? <section aria-label="内容预览" className="review-preview"><p>3:4 · 900 × 1200 · 当前编辑实时同步</p><div className="loop-preview"><iframe sandbox="allow-same-origin" title={`Content Preview ${currentPage}`} srcDoc={growthCardHtml(snapshot, currentPage)} /></div><button disabled={exporting} onClick={() => void exportPng()}>导出当前页</button></section> : null}

    {!locked ? <section className="review-publish"><h3>用户手动发布后，记录实际时间</h3><label>发布时间<input type="datetime-local" value={publishTime} onChange={event => setPublishTime(event.target.value)} /></label><button disabled={busy || content.status !== 'ready' || dirty || !publishTime} onClick={() => act(() => apiRequest(base + '/publish', 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ revision: content.revision, publishTime: new Date(publishTime).toISOString() }) }))}>标记为已发布</button><p>仅保存发布记录，不登录或自动发布到小红书。</p></section> : null}
  </section>;
}
