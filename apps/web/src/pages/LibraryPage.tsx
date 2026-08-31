import { ArrowRight, Heart, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentItem } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { apiRequest, useRemote } from '../lib/api';

const emotions = ['全部', '开心', '难过', '遗憾', '孤独', '爱情', '治愈', '愤怒', '其他'];
const categories = ['全部', '爱情', '友情', '家庭', '成长', '孤独', '生活', '其他'];
const sortOptions = [
  { value: 'newest', label: '最新导入' },
  { value: 'resonance_desc', label: '共鸣分数从高到低' },
  { value: 'likes_desc', label: '点赞从高到低' },
] as const;

export default function LibraryPage() {
  const { mode, setMode } = usePreviewMode();
  const [search, setSearch] = useState('');
  const [emotion, setEmotion] = useState('全部');
  const [category, setCategory] = useState('全部');
  const [sort, setSort] = useState<(typeof sortOptions)[number]['value']>('newest');
  const [highOnly, setHighOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState('');

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (emotion !== '全部') params.set('emotion', emotion);
    if (category !== '全部') params.set('category', category);
    params.set('sort', sort);
    if (highOnly) params.set('highResonance', 'true');
    return `/api/v1/content-items?${params.toString()}`;
  }, [category, emotion, highOnly, search, sort]);

  const state = useRemote<ContentItem[]>(endpoint, mode, refreshKey);

  async function toggleFavorite(item: ContentItem) {
    if (mode === 'blocked') return;
    setActionError('');
    try {
      await apiRequest<ContentItem>(`/api/v1/content-items/${item.id}/favorite`, mode, {
        method: 'POST',
        body: JSON.stringify({ favorite: !item.isFavorite }),
      });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '收藏操作失败。');
    }
  }

  if (state.status === 'loading') return <LoadingState rows={6} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefreshKey((value) => value + 1); }} />;

  const items = mode === 'empty' ? [] : state.data;
  const hasFilters = Boolean(search.trim() || emotion !== '全部' || category !== '全部' || highOnly);

  function clearFilters() {
    setSearch('');
    setEmotion('全部');
    setCategory('全部');
    setHighOnly(false);
    setSort('newest');
  }

  return (
    <>
      <div className="library-hero material-library-hero">
        <div><p className="kicker">ANALYZED MATERIALS</p><h2>每条素材，都已有一份可见的分析。</h2><p>搜索、筛选并找到真正值得继续创作的句子。评分由 MockAnalyzer 生成，只用于 DEMO 流程。</p></div>
        <div className="library-stats"><span><strong>{items.length}</strong>当前结果</span><span><strong>{items.filter((item) => item.resonanceScore >= 80).length}</strong>高共鸣</span></div>
      </div>

      {mode === 'blocked' ? <BlockedNotice title="当前只能浏览" description="禁止操作状态下不能收藏或生成文案。" /> : null}
      {actionError ? <div className="action-notice is-error" role="alert"><span>{actionError}</span><button onClick={() => setActionError('')}>关闭</button></div> : null}

      <section className="material-filter-panel" aria-label="素材筛选">
        <label className="search-field material-search"><Search size={16} /><input aria-label="搜索素材" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索原文、作者、来源或标签" /></label>
        <label className="compact-select"><span>情绪</span><select aria-label="情绪筛选" value={emotion} onChange={(event) => setEmotion(event.target.value)}>{emotions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="compact-select"><span>分类</span><select aria-label="分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="compact-select sort-select"><span>排序</span><select aria-label="素材排序" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>{sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <button className={highOnly ? 'high-resonance-toggle is-active' : 'high-resonance-toggle'} aria-pressed={highOnly} onClick={() => setHighOnly((value) => !value)}><Sparkles size={15} />只看高共鸣</button>
      </section>

      {items.length === 0 ? (
        <EmptyState
          title={hasFilters ? '没有符合条件的素材' : '素材库还是空的'}
          description={hasFilters ? '试试放宽情绪、分类或共鸣分数条件。' : '导入 CSV 或载入演示数据后，分析结果会出现在这里。'}
          action={hasFilters ? '清除筛选' : '前往导入'}
          {...(hasFilters ? { onAction: clearFilters } : { actionTo: '/import' })}
        />
      ) : <ContentTable items={items} mode={mode} onFavorite={toggleFavorite} />}
    </>
  );
}

function ContentTable({ items, mode, onFavorite }: { items: ContentItem[]; mode: string; onFavorite: (item: ContentItem) => void }) {
  const longSuffix = '。这是一段用于检查超长文案布局的额外演示文字，它会保持卡片结构稳定，也不会把操作按钮挤出可视区域。';
  return (
    <div className="material-table" role="table" aria-label="情绪素材库">
      <div className="material-row material-head" role="row"><span>原文 / 来源</span><span>点赞</span><span>情绪</span><span>评分</span><span>分类 / 标签</span><span>操作</span></div>
      {items.map((item, index) => (
        <article className="material-row" role="row" key={item.id}>
          <div className="material-copy-cell" role="cell"><Link to={`/materials/${item.id}`}>{item.originalContent}{mode === 'long' && index === 0 ? longSuffix : ''}</Link><small>{item.author ?? '匿名素材'} · {item.source}</small></div>
          <strong className="likes-cell" role="cell">{item.likes.toLocaleString('zh-CN')}</strong>
          <div className="emotion-cell" role="cell"><StatusPill tone={item.emotionScore >= 80 ? 'good' : 'neutral'}>{item.emotion}</StatusPill><small>情绪 {item.emotionScore}</small></div>
          <div className="score-cell" role="cell"><strong>{item.resonanceScore}</strong><span>共鸣</span><div><i style={{ width: `${item.resonanceScore}%` }} /></div></div>
          <div className="tag-cell" role="cell"><strong>{item.category}</strong><div>{item.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
          <div className="material-actions" role="cell"><button className="icon-button" aria-label={item.isFavorite ? '取消收藏' : '收藏'} disabled={mode === 'blocked'} onClick={() => onFavorite(item)}><Heart size={16} fill={item.isFavorite ? 'currentColor' : 'none'} /></button><Link className="text-button" to={`/materials/${item.id}`}>查看 <ArrowRight size={14} /></Link></div>
        </article>
      ))}
    </div>
  );
}
