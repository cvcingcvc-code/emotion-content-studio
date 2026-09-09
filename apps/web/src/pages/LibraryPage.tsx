import { ArrowRight, Heart, Search, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ContentItemListSchema, ContentItemSchema, ContentSourceTypeSchema, type ContentItem } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { apiRequest, useRemote } from '../lib/api';
import { accountLabels, accountProfiles, laneLabels, relationshipLabels } from '../lib/accounts';
import { generateStudioContent } from '../lib/studioApi';

const sourceLabels = { manual: '手动记录', daily_review: '每日复盘', english_topic: '英语主题', external_emotion_source: '外部情绪素材', idea: '灵感', legacy_import: '历史 / CSV 导入' };
const emotions = ['开心', '难过', '遗憾', '孤独', '爱情', '治愈', '愤怒', '其他'];
export default function LibraryPage() {
  const { mode, setMode } = usePreviewMode();
  const [query, setQuery] = useSearchParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endpoint = '/api/v1/content-items?' + query.toString();
  const state = useRemote(endpoint, mode, ContentItemListSchema, refresh);
  useEffect(() => { setSelected([]); setError(''); }, [endpoint]);
  const items = state.status === 'ready' && mode !== 'empty' ? state.data : [];
  const chosen = items.filter((item) => selected.includes(item.id));
  const canGenerate = chosen.length > 0 && chosen.every((item) => item.accountId === chosen[0]?.accountId && item.licenseStatus !== 'prohibited') &&
    (chosen[0]?.accountId === 'emotion_library' ? chosen.length <= 5 : chosen.length === 1);
  function filter(key: string, value: string) {
    setQuery((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }
  async function favorite(item: ContentItem) {
    if (busy || mode === 'blocked') return;
    setBusy(true); setError('');
    try { await apiRequest('/api/v1/content-items/' + item.id + '/favorite', mode, ContentItemSchema, { method: 'POST', body: JSON.stringify({ favorite: !item.isFavorite }) }); setRefresh((value) => value + 1); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '收藏失败。'); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!canGenerate || busy || mode === 'blocked') return;
    setBusy(true); setError('');
    try { const generated = await generateStudioContent(selected, mode); navigate('/generated/' + generated.id + '?accountId=' + generated.accountId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '生成失败。'); setBusy(false); }
  }
  return <>
    <div className="library-hero material-library-hero"><div><p className="kicker">MATERIAL LIBRARY</p><h2>把记录放在一起，把创作分得清楚。</h2><p>按账号、主题与来源筛选。研究素材的创作结果仍保留研究限制。</p></div><div className="library-stats"><span><strong>{items.length}</strong>当前结果</span></div></div>
    {mode === 'blocked' ? <BlockedNotice title="当前只能浏览" description="当前不能收藏或生成内容。" /> : null}
    {error ? <div className="action-notice is-error" role="alert">{error}</div> : null}
    <section className="studio-filters" aria-label="素材筛选">
      <label className="search-field"><Search size={16} /><input aria-label="搜索素材" value={query.get('search') ?? ''} maxLength={100} onChange={(event) => filter('search', event.target.value)} placeholder="搜索原文、主题或来源" /></label>
      <label>账号<select aria-label="素材账号筛选" value={query.get('accountId') ?? ''} onChange={(event) => filter('accountId', event.target.value)}><option value="">全部账号</option>{accountProfiles.map((account) => <option value={account.id} key={account.id}>{account.displayName}</option>)}</select></label>
      <label>来源类型<select aria-label="来源类型筛选" value={query.get('sourceType') ?? ''} onChange={(event) => filter('sourceType', event.target.value)}><option value="">全部来源</option>{ContentSourceTypeSchema.options.map((source) => <option value={source} key={source}>{sourceLabels[source]}</option>)}</select></label>
      <label>情绪<select aria-label="情绪筛选" value={query.get('emotion') ?? ''} onChange={(event) => filter('emotion', event.target.value)}><option value="">全部</option>{emotions.map((emotion) => <option key={emotion}>{emotion}</option>)}</select></label>
      <label>分类<select aria-label="分类筛选" value={query.get('category') ?? ''} onChange={(event) => filter('category', event.target.value)}><option value="">全部</option>{['爱情', '友情', '家庭', '成长', '孤独', '生活', '其他'].map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>场景<input aria-label="场景筛选" maxLength={120} value={query.get('scene') ?? ''} onChange={(event) => filter('scene', event.target.value)} placeholder="例如：夜晚" /></label>
      <label>关系<select aria-label="关系筛选" value={query.get('relationship') ?? ''} onChange={(event) => filter('relationship', event.target.value)}><option value="">全部关系</option>{Object.entries(relationshipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>主题<input aria-label="主题筛选" maxLength={120} value={query.get('theme') ?? ''} onChange={(event) => filter('theme', event.target.value)} placeholder="主题关键词" /></label>
      <label>收藏<select aria-label="收藏筛选" value={query.get('favorite') ?? ''} onChange={(event) => filter('favorite', event.target.value)}><option value="">全部</option><option value="true">只看收藏</option><option value="false">未收藏</option></select></label>
      <label>发布<select aria-label="发布状态筛选" value={query.get('published') ?? ''} onChange={(event) => filter('published', event.target.value)}><option value="">全部</option><option value="true">已发布</option><option value="false">未发布</option></select></label>
      <label>排序<select aria-label="素材排序" value={query.get('sort') ?? 'newest'} onChange={(event) => filter('sort', event.target.value)}><option value="newest">最新导入</option><option value="resonance_desc">共鸣分数从高到低</option><option value="likes_desc">点赞从高到低</option></select></label>
      <button className="secondary-button" aria-pressed={query.get('highResonance') === 'true'} onClick={() => filter('highResonance', query.get('highResonance') === 'true' ? '' : 'true')}><Sparkles size={15} />只看高共鸣</button>
    </section>
    <div className="selection-toolbar"><div><strong>已选择 {selected.length} / 5</strong><span>情绪账号可组合 1–5 条；成长与英语每次 1 条。仅同一账号可一起生成。</span></div><button className="primary-button" disabled={!canGenerate || busy || mode === 'blocked'} onClick={() => void generate()}>{busy ? '正在处理…' : '生成文案'}</button></div>
    {state.status === 'loading' ? <LoadingState rows={4} /> : state.status === 'error' ? <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefresh((value) => value + 1); }} /> : items.length === 0 ? <EmptyState title={query.size ? '没有符合条件的素材' : '素材库还是空的'} description="保存内容或导入授权素材后，可以在这里筛选并继续创作。" action={query.size ? '清除筛选' : '前往工作区'} {...(query.size ? { onAction: () => setQuery({}) } : { actionTo: '/accounts/emotion_library' })} /> :
      <div className="unified-material-grid">{items.map((item, index) => <article className="panel unified-material-card" key={item.id}>
        <header><label className="select-material"><input type="checkbox" aria-label={'选择素材 ' + item.content.slice(0, 30)} checked={selected.includes(item.id)} disabled={mode === 'blocked' || busy || item.licenseStatus === 'prohibited' || (!selected.includes(item.id) && selected.length >= 5)} onChange={() => setSelected((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />{accountLabels[item.accountId]}</label><button className="icon-button" aria-label={item.isFavorite ? '取消收藏' : '收藏'} disabled={mode === 'blocked' || busy} onClick={() => void favorite(item)}><Heart size={16} fill={item.isFavorite ? 'currentColor' : 'none'} /></button></header>
        <Link className="material-card-copy" to={'/materials/' + item.id + '?accountId=' + item.accountId}>{item.originalContent}{mode === 'long' && index === 0 ? '。这段较长的阅读预览用来检查文字换行和卡片操作区域。'.repeat(8) : ''}</Link>
        <small>{item.source} · {sourceLabels[item.sourceType]} · {laneLabels[item.contentLane]}</small>
        <div className="material-card-stats"><span>{item.emotion ?? '未分析'} {item.emotionScore ?? '—'}</span><span>共鸣 {item.resonanceScore ?? '—'}</span><span>点赞 {item.likes}</span></div>
        {item.theme ? <p className="material-theme">{item.theme}</p> : null}
        <footer><StatusPill tone={item.licenseStatus === 'reference_only' ? 'warning' : 'neutral'}>{item.isPublished ? '已发布' : item.licenseStatus === 'reference_only' ? '研究区' : '未发布'}</StatusPill><Link className="text-button" to={'/materials/' + item.id + '?accountId=' + item.accountId}>查看详情 <ArrowRight size={14} /></Link></footer>
      </article>)}</div>}
  </>;
}
