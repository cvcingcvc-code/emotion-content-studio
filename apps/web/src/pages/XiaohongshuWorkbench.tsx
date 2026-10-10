import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BatchGenerateInputSchema, BatchGenerateResultSchema, ContentTextExportResultSchema, GrowthLoopStateSchema, growthPublishText, type BatchContentItem, type BatchGenerateResult, type PublishedContent } from '@emotion-studio/contracts';
import { apiRequest, useRemote } from '../lib/api';
import './xiaohongshu-workbench.css';

const base = '/api/v1/growth-loop';
const statusLabels: Record<PublishedContent['status'], string> = { draft: '待生成', review: '待审核', ready: '已通过', published: '已发布', rejected: '已拒绝' };
const accountLabels = { growth: '个人成长', emotion: '情绪灵感库', english: '趣味英语' };
type ResultRow = { item: BatchContentItem; result: BatchGenerateResult['results'][number] };

export default function XiaohongshuWorkbench() {
  const [refresh, setRefresh] = useState(0);
  const remote = useRemote(base, 'normal', GrowthLoopStateSchema, refresh);
  const [account, setAccount] = useState<'growth' | 'emotion'>('growth');
  const [source, setSource] = useState('');
  const [topics, setTopics] = useState('');
  const [contentType, setContentType] = useState<BatchContentItem['contentType']>('solution');
  const [filter, setFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manualCopy, setManualCopy] = useState('');
  const operation = useRef(false);
  const state = remote.data;
  const opportunities = state?.retrospectives.filter(item => item.analysis && item.analysis.contentPotential >= 6) ?? [];
  const contents = state?.contents.filter(item => !item.isDemo).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const visible = contents.filter(item => (filter === 'all' || item.status === filter) && (accountFilter === 'all' || item.account === accountFilter) && `${item.topic} ${item.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const chosen = contents.filter(item => selected.includes(item.id));
  const exportable = chosen.length > 0 && chosen.length <= 50 && chosen.every(item => ['ready', 'published'].includes(item.status));

  async function generateItems(items: BatchContentItem[]) {
    if (operation.current) return;
    const checked = BatchGenerateInputSchema.safeParse({ items });
    if (!checked.success) { setError('每批填写1–10个主题，每个主题不超过120字。'); return; }
    if (checked.data.items.some(item => item.account === 'growth' && !item.sourceRetrospectiveId)) { setError('个人成长内容需要选择已分析的真实复盘。'); return; }
    operation.current = true; setBusy(true); setError(''); setMessage(''); setRows([]); setProgress({ done: 0, total: items.length });
    const updated: ResultRow[] = [];
    try {
      for (const [index, item] of checked.data.items.entries()) {
        try {
          // One item per request keeps feedback timely and prevents long batch requests timing out.
          const response = await apiRequest(base + '/batch/generate', 'normal', BatchGenerateResultSchema, { method: 'POST', body: JSON.stringify({ items: [item] }) });
          updated.push({ item, result: response.results[0]! });
        } catch (caught) {
          updated.push({ item, result: { index, status: 'failed', content: null, error: { code: 'REQUEST_FAILED', message: caught instanceof Error ? caught.message : '连接失败，重试前会检查已有记录。' } } });
        }
        setRows([...updated]); setProgress({ done: index + 1, total: items.length });
      }
      setMessage(`本批完成：生成 ${updated.filter(row => row.result.status === 'generated').length} 篇，重复 ${updated.filter(row => row.result.status === 'duplicate').length} 条，失败 ${updated.filter(row => row.result.status === 'failed').length} 条。生成结果仍需逐篇审核。`);
      setRefresh(value => value + 1);
    } finally { operation.current = false; setBusy(false); }
  }
  function generate() {
    void generateItems(topics.split(/\r?\n/).map(topic => topic.trim()).filter(Boolean).map(topic => ({ account, topic, contentType, sourceRetrospectiveId: account === 'growth' ? source || null : null })));
  }
  async function copy(text: string) {
    setManualCopy(text);
    try { await navigator.clipboard.writeText(text); setMessage('已复制。'); }
    catch { setMessage('复制不可用，请在下方文案框中手动复制。'); }
  }
  async function exportSelected(format: 'text' | 'json', clipboard = false) {
    if (!exportable || operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await apiRequest(base + '/batch/export', 'normal', ContentTextExportResultSchema, { method: 'POST', body: JSON.stringify({ items: chosen.map(({ id, revision }) => ({ id, revision })), format }) });
      if (clipboard) await copy(result.content);
      else {
        const url = URL.createObjectURL(new Blob([result.content], { type: result.mimeType + ';charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = result.filename;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage(`已导出 ${result.total} 篇审核内容。`);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : '导出失败，请刷新后重试。'); }
    finally { operation.current = false; setBusy(false); }
  }
  function toggle(id: string) {
    if (!selected.includes(id) && selected.length >= 50) { setError('每次最多选择50篇内容。'); return; }
    setSelected(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  }
  function selectVisible() {
    setSelected(visible.slice(0, 50).map(item => item.id));
    if (visible.length > 50) setMessage('已选择当前列表前50篇；剩余内容可分批导出。');
  }
  return <section className="xiaohongshu-workbench" aria-labelledby="workbench-title">
    <header><p className="kicker">记录 · 生成 · 人工审核</p><h1 id="workbench-title">小红书内容工作台</h1><p>一次整理多个主题，继续审核已有稿件，复制和导出通过审核的文案。</p><Link to="/english">English 50句 · 五页图片工作流 →</Link></header>
    {remote.status === 'loading' ? <p role="status">读取内容历史…</p> : null}
    {remote.status === 'error' ? <p role="alert">{remote.error} <button onClick={() => setRefresh(value => value + 1)}>重新读取</button></p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    <section className="wb-compose" aria-label="批量生成">
      <h2>批量生成草稿</h2>
      <div className="wb-form-grid"><label>内容账号<select aria-label="内容账号" value={account} disabled={busy} onChange={event => setAccount(event.target.value as typeof account)}><option value="growth">个人成长</option><option value="emotion">情绪灵感库</option></select></label>
        <label>内容形式<select aria-label="内容形式" value={contentType} disabled={busy} onChange={event => setContentType(event.target.value as typeof contentType)}><option value="solution">问题解决</option><option value="story">真实故事</option><option value="reflection">反思随笔</option><option value="list">清单合集</option><option value="educational">知识科普</option></select></label></div>
      {account === 'growth' ? <label>真实复盘来源<select aria-label="真实复盘来源" value={source} disabled={busy} onChange={event => setSource(event.target.value)}><option value="">请选择已分析的复盘</option>{opportunities.map(item => <option key={item.id} value={item.id}>{item.date} · {item.whatHappened.slice(0, 60)}</option>)}</select></label> : null}
      <label>主题列表（每行一个，最多10个）<textarea aria-label="主题列表（每行一个，最多10个）" rows={5} value={topics} disabled={busy} onChange={event => setTopics(event.target.value)} placeholder="接到任务先确认范围&#10;把验收标准写清楚" /></label>
      <p>同账号、同复盘、同形式的重复主题会复用历史稿件。失败项保留草稿，可安全重试。</p>
      <div className="wb-actions"><button disabled={busy || !state || !topics.trim()} onClick={generate}>{busy && progress.done < progress.total ? `生成中 ${progress.done}/${progress.total}` : '批量生成'}</button>{rows.some(row => row.result.status === 'failed') ? <button disabled={busy} onClick={() => void generateItems(rows.filter(row => row.result.status === 'failed').map(row => row.item))}>重试失败项</button> : null}</div>
      {busy && progress.total ? <progress aria-label="批量生成进度" value={progress.done} max={progress.total} /> : null}
      {rows.length ? <ul className="wb-results">{rows.map((row, index) => <li key={index}><strong>{row.item.topic}</strong> · {row.result.status === 'generated' ? '生成成功 · 待审核' : row.result.status === 'duplicate' ? '重复 · 已复用历史' : '失败'} {row.result.error?.message}{row.result.content ? <Link to={'/growth-content/' + row.result.content.id}>打开稿件 →</Link> : null}</li>)}</ul> : null}
    </section>
    <section aria-label="内容历史"><h2>生成历史与审核</h2><div className="wb-filters">
      <label>搜索主题<input aria-label="搜索主题" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>筛选账号<select aria-label="筛选账号" value={accountFilter} onChange={event => setAccountFilter(event.target.value)}><option value="all">全部账号</option>{Object.entries(accountLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>审核状态<select aria-label="审核状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
      <div className="wb-actions"><button disabled={busy} onClick={() => { setError(''); setRefresh(value => value + 1); }}>刷新历史</button><button disabled={busy || !visible.length} onClick={selectVisible}>选择当前列表</button><button disabled={busy || !selected.length} onClick={() => setSelected([])}>清空选择</button><span>已选 {chosen.length} 篇</span><button disabled={busy || !exportable} onClick={() => void exportSelected('text', true)}>复制所选发布文案</button><button disabled={busy || !exportable} onClick={() => void exportSelected('text')}>导出 TXT</button><button disabled={busy || !exportable} onClick={() => void exportSelected('json')}>导出 JSON</button></div>
      {chosen.length && !exportable ? <p>所选内容包含未通过审核的稿件。请逐篇审核，再导出发布文案。</p> : null}
      <div className="wb-content-list">{visible.map(content => <article key={content.id}><div className="wb-content-head"><label className="wb-select"><input type="checkbox" aria-label={'选择 ' + content.title} checked={selected.includes(content.id)} disabled={busy} onChange={() => toggle(content.id)} /></label><div><Link to={'/growth-content/' + content.id}><h3>{content.title}</h3></Link><p>{accountLabels[content.account]} · {statusLabels[content.status]} · {content.provider}</p></div></div><p className="wb-excerpt">{growthPublishText(content).slice(0, 160) || '主题已保存，等待生成。'}</p><div className="wb-actions"><Link to={'/growth-content/' + content.id}>{['draft', 'review', 'ready'].includes(content.status) ? '打开审核' : '查看稿件'} →</Link><button disabled={!content.writing && !content.english} onClick={() => void copy(growthPublishText(content))}>复制正文与标签</button></div></article>)}</div>
      {state && !visible.length ? <p>暂无符合筛选条件的稿件。</p> : null}
    </section>
    {manualCopy ? <label className="wb-manual-copy">可手动复制的文案<textarea aria-label="可手动复制的文案" readOnly rows={8} value={manualCopy} /></label> : null}
  </section>;
}
