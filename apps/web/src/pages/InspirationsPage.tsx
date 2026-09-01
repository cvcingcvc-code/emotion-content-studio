import { ArrowRight, Heart, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ContentItemListSchema,
  ContentItemSchema,
  GeneratedContentSchema,
  type ContentItem,
} from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { apiRequest, useRemote } from '../lib/api';

const maxSelection = 5;

export default function InspirationsPage() {
  const navigate = useNavigate();
  const { mode, setMode } = usePreviewMode();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const state = useRemote<ContentItem[]>('/api/v1/favorites', mode, ContentItemListSchema, refreshKey);

  function toggleSelected(id: string) {
    setMessage('');
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= maxSelection) {
        setMessage(`一次最多选择 ${maxSelection} 条素材。`);
        return current;
      }
      next.add(id);
      return next;
    });
  }

  async function removeFavorite(id: string) {
    if (mode === 'blocked' || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await apiRequest(`/api/v1/favorites/${id}`, mode, ContentItemSchema, { method: 'DELETE' });
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '移除收藏失败。');
    } finally {
      setBusy(false);
    }
  }

  async function generateSelected() {
    if (selected.size < 1 || selected.size > maxSelection || mode === 'blocked' || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const generated = await apiRequest('/api/v1/generated-contents', mode, GeneratedContentSchema, {
        method: 'POST',
        body: JSON.stringify({ contentIds: Array.from(selected) }),
      });
      navigate(`/generated/${generated.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文案生成失败。');
      setBusy(false);
    }
  }

  if (state.status === 'loading') return <LoadingState rows={5} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefreshKey((value) => value + 1); }} />;

  const items = mode === 'empty' ? [] : state.data;
  const blocked = mode === 'blocked';

  return (
    <>
      <div className="page-intro inspiration-intro">
        <div className="page-intro-copy">
          <p className="kicker">CURATED MATERIALS</p>
          <h2>把喜欢的素材，组合成一个新的表达起点。</h2>
          <p>选择 1–5 条素材交给当前生成器。生成结果只是一份 DEMO 草稿，仍需人工改写和确认。</p>
        </div>
        <Link className="secondary-button" to="/library">继续挑选素材 <ArrowRight size={15} /></Link>
      </div>

      {blocked ? <BlockedNotice title="当前只能浏览" description="禁止操作状态下不能删除收藏或生成文案。" /> : null}
      {message ? <div className="action-notice is-error" role="alert"><span>{message}</span><button onClick={() => setMessage('')}>关闭</button></div> : null}

      {items.length === 0 ? (
        <EmptyState title="灵感库还没有素材" description="先从情绪素材库收藏几条内容，再回来组合生成文案。" action="前往情绪素材库" actionTo="/library" />
      ) : (
        <>
          <div className="selection-toolbar" role="status">
            <div><strong>已选择 {selected.size} / {maxSelection}</strong><span>至少选择 1 条素材</span></div>
            <button className="primary-button" disabled={blocked || busy || selected.size === 0 || selected.size > maxSelection} onClick={() => void generateSelected()}>
              <Sparkles size={15} />{busy ? '正在处理…' : '生成文案'}
            </button>
          </div>

          <div className="favorite-grid">
            {items.map((item, index) => {
              const isSelected = selected.has(item.id);
              return (
                <article className={isSelected ? 'favorite-card is-selected' : 'favorite-card'} key={item.id}>
                  <header>
                    <label className="select-material">
                      <input type="checkbox" checked={isSelected} disabled={blocked || (!isSelected && selected.size >= maxSelection)} onChange={() => toggleSelected(item.id)} />
                      <span>{String(index + 1).padStart(2, '0')}</span>
                    </label>
                    <StatusPill tone={item.resonanceScore >= 80 ? 'good' : 'neutral'}>{item.resonanceScore} 共鸣</StatusPill>
                  </header>
                  <Link className="favorite-copy" to={`/materials/${item.id}`}>{item.originalContent}</Link>
                  <div className="favorite-meta"><span>{item.emotion}</span><span>{item.category}</span><span>{item.likes.toLocaleString('zh-CN')} 赞</span></div>
                  <footer>
                    <div>{item.tags.slice(0, 2).map((tag, tagIndex) => <i key={`${tag}-${tagIndex}`}>#{tag}</i>)}</div>
                    <button className="icon-button" aria-label={`删除收藏：${item.content}`} disabled={blocked || busy} onClick={() => void removeFavorite(item.id)}><Trash2 size={15} /></button>
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
