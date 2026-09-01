import { ArrowLeft, ExternalLink, Heart, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContentItem, GeneratedContent } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { apiRequest, useRemote } from '../lib/api';

const licenseLabels: Record<ContentItem['licenseStatus'], string> = {
  original: '本人原创',
  licensed: '明确许可',
  reference_only: '仅供研究',
  prohibited: '禁止使用',
};

export default function MaterialDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { mode, setMode } = usePreviewMode();
  const [refreshKey, setRefreshKey] = useState(0);
  const [action, setAction] = useState<'idle' | 'favorite' | 'generate'>('idle');
  const [message, setMessage] = useState('');
  const state = useRemote<ContentItem>(`/api/v1/content-items/${encodeURIComponent(id)}`, mode, refreshKey);

  async function setFavorite(item: ContentItem) {
    setAction('favorite');
    setMessage('');
    try {
      await apiRequest<ContentItem>(`/api/v1/content-items/${item.id}/favorite`, mode, { method: 'POST', body: JSON.stringify({ favorite: !item.isFavorite }) });
      setRefreshKey((value) => value + 1);
      setMessage(item.isFavorite ? '已从灵感库移除。' : '已加入灵感库。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '收藏失败。');
    } finally {
      setAction('idle');
    }
  }

  async function generate(item: ContentItem) {
    setAction('generate');
    setMessage('');
    try {
      const generated = await apiRequest<GeneratedContent>('/api/v1/generated-contents', mode, { method: 'POST', body: JSON.stringify({ contentIds: [item.id] }) });
      navigate(`/generated/${generated.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成失败。');
      setAction('idle');
    }
  }

  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefreshKey((value) => value + 1); }} />;
  if (mode === 'empty') return <EmptyState title="没有找到这条素材" description="这条素材可能已经被移除，请返回素材库继续查看。" action="返回素材库" actionTo="/library" />;

  const item = state.data;
  const blocked = mode === 'blocked';
  const licenseRestricted = item.licenseStatus === 'reference_only' || item.licenseStatus === 'prohibited';
  const displayContent = mode === 'long' ? `${item.originalContent}。有些情绪不用立刻得到解释，先让它在一个安静的地方停留，再等自己有力气时慢慢读完。` : item.originalContent;

  return (
    <>
      <div className="detail-topline"><Link className="text-button" to="/library"><ArrowLeft size={15} />返回素材库</Link><StatusPill>MockAnalyzer 分析</StatusPill></div>
      {blocked ? <BlockedNotice title="当前只能浏览" description="禁止操作状态下不能收藏或生成文案。" /> : null}
      {message ? <div className="action-notice" role="status"><span>{message}</span></div> : null}

      <div className="material-detail-layout">
        <article className="panel material-reader">
          <header><p className="kicker">ORIGINAL MATERIAL</p><span>{new Date(item.importedAt).toLocaleDateString('zh-CN')}</span></header>
          <blockquote>{displayContent}</blockquote>
          {item.content !== item.originalContent ? <div className="cleaned-copy"><span>清洗后内容</span><p>{item.content}</p></div> : null}
          <footer>
            <dl><div><dt>作者</dt><dd>{item.author ?? '未提供'}</dd></div><div><dt>来源</dt><dd>{item.source}</dd></div><div><dt>点赞</dt><dd>{item.likes.toLocaleString('zh-CN')}</dd></div><div><dt>授权</dt><dd>{licenseLabels[item.licenseStatus]}</dd></div></dl>
            {item.sourceUrl ? <a className="text-button" href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源 <ExternalLink size={14} /></a> : null}
          </footer>
        </article>

        <aside className="panel analysis-card">
          <header><div><span>MOCK ANALYSIS</span><h2>情绪分析</h2></div><StatusPill tone="warning">DEMO</StatusPill></header>
          <div className="analysis-primary"><div><span>主情绪</span><strong>{item.emotion}</strong></div><ScoreRing label="情绪分" score={item.emotionScore} /><ScoreRing label="共鸣分" score={item.resonanceScore} /></div>
          <div className="analysis-meta"><div><span>内容分类</span><strong>{item.category}</strong></div><div><span>标签</span><div className="detail-tags">{item.tags.map((tag, tagIndex) => <i key={`${tag}-${tagIndex}`}>#{tag}</i>)}</div></div></div>
          <p className="mock-disclaimer">评分来自关键词规则，不代表真实 AI 模型判断。</p>
          <div className="detail-actions"><button className="secondary-button" disabled={blocked || action !== 'idle'} onClick={() => void setFavorite(item)}><Heart size={15} fill={item.isFavorite ? 'currentColor' : 'none'} />{item.isFavorite ? '移出灵感库' : '加入灵感库'}</button><button className="primary-button" disabled={blocked || licenseRestricted || action !== 'idle'} onClick={() => void generate(item)}><Sparkles size={15} />{licenseRestricted ? '授权状态不可生成' : action === 'generate' ? '正在生成…' : '生成文案'}</button></div>
        </aside>
      </div>
    </>
  );
}

function ScoreRing({ label, score }: { label: string; score: number }) {
  return <div className="score-ring" style={{ background: `conic-gradient(var(--accent) ${score}%, var(--paper-deep) 0)` }}><div><strong>{score}</strong><span>{label}</span></div></div>;
}
