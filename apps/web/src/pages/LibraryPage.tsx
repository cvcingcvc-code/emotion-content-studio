import { ArrowUpRight, Bookmark, Heart, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Inspiration, Platform } from '@emotion-studio/contracts';
import { useRemote } from '../lib/api';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';

const platformLabels: Record<Platform, string> = { xiaohongshu: '小红书', wechat_channels: '视频号', instagram_reels: 'Reels' };
const longSuffix = ' 有些感受不必立刻被解决，它们更像一封需要慢慢读完的信。先允许自己停留一会儿，等情绪不再追着答案奔跑，再决定要把什么留下。';

export default function LibraryPage() {
  const { mode, setMode } = usePreviewMode();
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('全部');
  const [newestFirst, setNewestFirst] = useState(true);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Set<string>>(new Set());
  const state = useRemote<Inspiration[]>('/api/v1/inspirations', mode);

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data
      .filter((item) => (theme === '全部' || item.theme === theme) && (!query || `${item.text}${item.theme}${item.scenario}`.toLowerCase().includes(query.toLowerCase())))
      .sort((first, second) => newestFirst
        ? Date.parse(second.updatedAt) - Date.parse(first.updatedAt)
        : Date.parse(first.updatedAt) - Date.parse(second.updatedAt));
  }, [newestFirst, query, state, theme]);

  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setMode('normal')} />;

  const themes = ['全部', ...new Set(state.data.map((item) => item.theme))].slice(0, 6);
  const blocked = mode === 'blocked';

  return (
    <>
      <div className="library-hero">
        <div><p className="kicker">CURATED, NOT COLLECTED</p><h2>留下能继续生长的句子。</h2><p>这里不是原文仓库，而是通过审核后形成的创作起点。先按阅读感受选择，再看分数。</p></div>
        <div className="library-stats"><span><strong>{state.data.length}</strong>可用灵感</span><span><strong>{state.data.filter((item) => favoriteOverrides.has(item.id) ? !item.favorite : item.favorite).length}</strong>收藏</span></div>
      </div>

      {blocked ? <BlockedNotice title="研究内容已隐藏制作入口" description="当前演示为禁止操作状态。仅供参考的内容可以阅读，但不能进入文案生成或视频流程。" /> : null}

      <div className="library-tools">
        <label className="search-field"><Search size={16} /><input aria-label="搜索灵感" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题、场景或一句话" /></label>
        <div className="filter-bar">
          {themes.map((item) => <button key={item} onClick={() => setTheme(item)} className={theme === item ? 'filter-chip is-active' : 'filter-chip'}>{item}</button>)}
        </div>
        <button className="secondary-button" onClick={() => setNewestFirst((value) => !value)}><SlidersHorizontal size={14} />{newestFirst ? '最近确认' : '最早确认'}</button>
      </div>

      {mode === 'empty' || filtered.length === 0 ? (query
        ? <EmptyState title="没有找到对应灵感" description="试试更短的关键词，或清除当前主题筛选。" action="清除搜索" onAction={() => setQuery('')} />
        : <EmptyState title="灵感库还没有内容" description="审核通过的素材会在这里形成可继续创作的灵感卡片。" action="前往审核收件箱" actionTo="/review" />
      ) : (
        <div className="inspiration-grid">
          {filtered.map((item, index) => {
            const isFavorite = favoriteOverrides.has(item.id) ? !item.favorite : item.favorite;
            const isBlocked = blocked || item.licenseStatus === 'reference_only' || item.licenseStatus === 'prohibited';
            return <article className={`inspiration-card card-size-${index % 3}`} key={item.id}>
              <header><span>{String(index + 1).padStart(2, '0')} / {item.theme}</span><button aria-label={isFavorite ? '取消收藏' : '收藏'} onClick={() => setFavoriteOverrides((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}><Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} /></button></header>
              <blockquote>{mode === 'long' && index === 0 ? item.text + longSuffix : item.text}</blockquote>
              <div className="card-context"><span>{item.scenario}</span><span>{item.platforms.map((platform) => platformLabels[platform]).join(' · ')}</span></div>
              <footer><StatusPill tone={item.score >= 88 ? 'good' : 'neutral'}>{item.score} 共鸣分</StatusPill>{isBlocked ? <span className="locked-action"><Bookmark size={14} />仅供阅读</span> : <Link to={`/editor/${item.id}`}>继续创作 <ArrowUpRight size={14} /></Link>}</footer>
            </article>;
          })}
        </div>
      )}
    </>
  );
}
