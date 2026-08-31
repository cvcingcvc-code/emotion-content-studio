import { Check, Clock3, Download, FileArchive, MoreHorizontal, RefreshCw, Search, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ExportRecord } from '@emotion-studio/contracts';
import { useRemote } from '../lib/api';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';

const statusMeta: Record<ExportRecord['status'], { label: string; tone: 'good' | 'warning' | 'danger'; icon: typeof Check }> = {
  succeeded: { label: '已完成', tone: 'good', icon: Check },
  processing: { label: '处理中', tone: 'warning', icon: Clock3 },
  failed: { label: '失败', tone: 'danger', icon: XCircle },
};

export default function ExportsPage() {
  const { mode, setMode } = usePreviewMode();
  const state = useRemote<ExportRecord[]>('/api/v1/exports', mode);
  const [records, setRecords] = useState<ExportRecord[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ExportRecord['status']>('all');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (state.status === 'ready') setRecords(state.data); }, [state]);
  const filtered = useMemo(
    () => records.filter((item) => (statusFilter === 'all' || item.status === statusFilter) && `${item.title} ${item.templateName}`.toLowerCase().includes(query.toLowerCase())),
    [query, records, statusFilter],
  );

  if (state.status === 'loading') return <LoadingState rows={5} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setMode('normal')} />;
  if (mode === 'empty' || records.length === 0) return <EmptyState title="还没有导出记录" description="完成一支模拟视频后，草稿包和处理状态会出现在这里。" action="前往视频工作室" actionTo="/studio/video-01" />;

  const blocked = mode === 'blocked';
  const retry = (id: string) => {
    setRecords((current) => current.map((item) => item.id === id ? { ...item, status: 'processing', progress: 12, errorMessage: null, downloadable: false } : item));
    setNotice('已重新加入模拟处理队列；不会启动真实视频渲染。');
  };

  return (
    <>
      <div className="page-intro exports-intro"><div className="page-intro-copy"><p className="kicker">OUTPUT / DRAFT ONLY</p><h2>每一次导出，都能找到它的来路。</h2><p>原型只展示视频草稿、封面、字幕和发布清单的模拟记录，不会连接任何发布平台。</p></div><div className="export-total"><strong>{records.filter((item) => item.status === 'succeeded').length}</strong><span>/ 30 条验证目标</span></div></div>
      {blocked ? <BlockedNotice title="下载操作已暂停" description="当前演示为禁止操作状态。记录仍可查看，但不能下载或重试。" /> : null}
      {notice ? <div className="export-notice" role="status"><Check size={14} />{notice}<button onClick={() => setNotice('')}>关闭</button></div> : null}

      <div className="export-toolbar"><label className="search-field"><Search size={16} /><input aria-label="搜索导出记录" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文案或模板" /></label><div className="filter-bar">{([
        ['all', `全部 ${records.length}`],
        ['succeeded', '已完成'],
        ['processing', '处理中'],
        ['failed', '失败'],
      ] as const).map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={statusFilter === value ? 'filter-chip is-active' : 'filter-chip'}>{label}</button>)}</div></div>

      {filtered.length === 0 ? <EmptyState title="没有找到导出记录" description="尝试清除搜索条件。" action="清除筛选" onAction={() => { setQuery(''); setStatusFilter('all'); }} /> : <div className="exports-table" role="table" aria-label="导出记录">
        <div className="export-row export-head" role="row"><span role="columnheader" aria-colspan={2}>内容</span><span role="columnheader">模板</span><span role="columnheader">状态</span><span role="columnheader">创建时间</span><span role="columnheader">操作</span></div>
        {filtered.map((record, index) => {
          const meta = statusMeta[record.status];
          const Icon = meta.icon;
          const title = mode === 'long' && index === 0 ? `${record.title}——一条用于验证超长标题在导出记录中如何换行与保持操作可见性的模拟文案` : record.title;
          return <article className="export-row" role="row" key={record.id}>
            <div role="cell" className={`export-preview preview-${record.templateKey}`}><span>{String(index + 1).padStart(2, '0')}</span></div>
            <div role="cell" className="export-title"><strong>{title}</strong><small>{record.id} · MP4 / JPG / SRT / CSV</small>{record.errorMessage ? <p>{record.errorMessage}</p> : null}</div>
            <span role="cell" className="export-template">{record.templateName}</span>
            <div role="cell" className="export-status"><StatusPill tone={meta.tone}><Icon size={11} />{meta.label}</StatusPill>{record.status === 'processing' && record.progress !== null ? <div className="record-progress"><i style={{ width: `${record.progress}%` }} /><span>{record.progress}%</span></div> : null}</div>
            <time role="cell">{new Date(record.createdAt).toLocaleDateString('zh-CN')}<small>{new Date(record.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></time>
            <div role="cell" className="export-actions">{record.status === 'succeeded' ? <button disabled={blocked} aria-label="模拟下载" onClick={() => setNotice('这是模拟下载入口，没有生成真实文件。')}><Download size={15} />下载草稿包</button> : null}{record.status === 'failed' ? <button disabled={blocked} onClick={() => retry(record.id)}><RefreshCw size={14} />重试</button> : null}{record.status === 'processing' ? <button disabled><Clock3 size={14} />处理中</button> : null}<button aria-label="更多操作" onClick={() => setNotice('当前原型没有更多外部操作，也不会自动发布。')}><MoreHorizontal size={16} /></button></div>
          </article>;
        })}
      </div>}

      <div className="export-footnote"><FileArchive size={16} /><div><strong>模拟导出包</strong><span>计划包含 video.mp4、cover.jpg、captions.srt、copy.txt 和 publishing-checklist.csv。本轮不会创建这些真实文件。</span></div></div>
    </>
  );
}
