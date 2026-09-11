import { useState } from 'react';
import { growthCardHtml, growthCardPages, PublishedContentSchema, type PublishedContent } from '@emotion-studio/contracts';
import { apiRequest } from '../lib/api';

export type LoopAction = (task: () => Promise<unknown>) => void;
export function GrowthContentReview({ content, busy, act }: { content: PublishedContent; busy: boolean; act: LoopAction }) {
  const [writing, setWriting] = useState(content.writing);
  const [english, setEnglish] = useState(content.english);
  const [note, setNote] = useState(content.note);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [publishTime, setPublishTime] = useState(() => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const title = english?.title ?? writing?.title ?? content.title;
  const snapshot = { ...content, title, writing, english, note };
  const pages = growthCardPages(snapshot), currentPage = Math.min(page, Math.max(1, pages.length));
  const dirty = JSON.stringify({ writing, english, note }) !== JSON.stringify({ writing: content.writing, english: content.english, note: content.note });
  const published = content.status === 'published';
  const base = `/api/v1/growth-loop/contents/${content.id}`;
  function save(status: 'review' | 'ready') {
    act(() => apiRequest(base + '/review', 'normal', PublishedContentSchema, { method: 'PUT', body: JSON.stringify({ revision: content.revision, writing, english, note, status }) }));
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
  if (content.status === 'draft') return <section className="english-compose"><h2>待生成 · {content.topic}</h2><p>内容来源与账号已保存。生成后进入人工 Review。</p><button className="em-primary" disabled={busy} onClick={() => act(() => apiRequest(base + '/generate', 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ revision: content.revision }) }))}>Generate Content</button></section>;
  return <section className="english-review">
    <h2>Review · {content.account}</h2><p>{content.status} · {content.provider === 'mock' ? 'OFFLINE DEMO MODE' : 'AI 草稿'}{content.isDemo ? ' · 合成演示记录' : ''}</p>
    <p>{dirty ? '有未保存修改：Preview / PNG 使用当前编辑，发布前须重新批准。' : '当前已保存；只有人工批准后才能标记发布。'}</p>
    <fieldset disabled={published || busy} className="loop-fields">
      <label>标题<input aria-label="内容标题" maxLength={80} value={title} onChange={event => english ? setEnglish({ ...english, title: event.target.value, titles: english.titles.includes(event.target.value) ? english.titles : [event.target.value, ...english.titles.slice(1)] }) : writing && setWriting({ ...writing, title: event.target.value })} /></label>
      <label>正文<textarea rows={8} aria-label="内容正文" value={english?.body ?? writing?.body ?? ''} onChange={event => english ? setEnglish({ ...english, body: event.target.value }) : writing && setWriting({ ...writing, body: event.target.value })} /></label>
      {writing ? <>{(['corePoint', 'solution', 'endingQuestion'] as const).map((key, index) => <label key={key}>{['核心观点', '解决方案', '结尾问题'][index]}<textarea rows={2} value={writing[key]} onChange={event => setWriting({ ...writing, [key]: event.target.value })} /></label>)}</> : null}
      <label>标签<input value={(english?.tags ?? writing?.tags ?? []).join(' ')} onChange={event => { const tags = event.target.value.split(/\s+/).filter(Boolean); if (english) setEnglish({ ...english, tags }); else if (writing) setWriting({ ...writing, tags }); }} /></label>
      {english ? <div className="english-lines"><h3>中英文 · 第 {currentPage} / 5 页</h3>{english.sentences.slice((currentPage - 1) * 10, currentPage * 10).map(line => <div className="english-edit-line" key={line.number}><span>{line.number}</span>{(['english', 'chinese'] as const).map(key => <label key={key}>{key === 'english' ? '英文' : '中文'}<input aria-label={`${key === 'english' ? '英文' : '中文'} ${line.number}`} value={line[key]} onChange={event => setEnglish({ ...english, sentences: english.sentences.map(item => item.number === line.number ? { ...item, [key]: event.target.value } : item) })} /></label>)}</div>)}</div> : null}
      <label>审核备注<textarea rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
    </fieldset>
    <div className="english-review-actions">{!published ? <><button disabled={busy} onClick={() => save('review')}>需要修改 / 保存</button><button className="em-primary" disabled={busy} onClick={() => save('ready')}>批准</button></> : null}<button onClick={() => setPreview(!preview)} aria-pressed={preview}>Preview</button></div>
    {(preview || english) ? <nav className="loop-page-nav" aria-label="内容预览页码">{pages.map((_, index) => <button key={index} aria-pressed={currentPage === index + 1} onClick={() => setPage(index + 1)}>{index + 1}</button>)}</nav> : null}
    {preview ? <section aria-label="内容 Preview"><p>3:4 · 900 × 1200 · 当前编辑实时同步</p><div className="loop-preview"><iframe sandbox="allow-same-origin" title={`Content Preview ${currentPage}`} srcDoc={growthCardHtml(snapshot, currentPage)} /></div><button disabled={exporting} onClick={() => void exportPng()}>Export Current Page</button></section> : null}
    <div className="english-copy-actions"><button onClick={() => void copy(title)}>复制标题</button><button onClick={() => void copy(english?.body ?? writing?.body ?? '')}>复制正文</button><button onClick={() => void copy((english?.tags ?? writing?.tags ?? []).join(' '))}>复制标签</button></div>
    {message ? <p role="status">{message}</p> : null}
    {!published ? <section className="english-compose"><h3>用户手动发布后，记录实际时间</h3><label>发布时间<input type="datetime-local" value={publishTime} onChange={event => setPublishTime(event.target.value)} /></label><button disabled={busy || content.status !== 'ready' || dirty || !publishTime} onClick={() => act(() => apiRequest(base + '/publish', 'normal', PublishedContentSchema, { method: 'POST', body: JSON.stringify({ revision: content.revision, publishTime: new Date(publishTime).toISOString() }) }))}>Mark as Published</button><p>仅保存发布记录，不登录或自动发布到小红书。</p></section> : <p>已发布：{new Date(content.publishTime!).toLocaleString()}。此快照只读，流量请在下方录入。</p>}
  </section>;
}
