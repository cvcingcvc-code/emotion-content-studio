import { ArrowRight, Heart, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ContentItemSchema, type AccountDashboard, type ContentItem, type LicenseStatus } from '@emotion-studio/contracts';
import { AnalysisDetails } from '../../components/AnalysisDetails';
import { BlockedNotice, StatusPill } from '../../components/States';
import { apiRequest, type PreviewMode } from '../../lib/api';
import { analyzeStudioContent, createStudioContent, generateStudioContent } from '../../lib/studioApi';

export default function EmotionWorkspace({ dashboard, mode, onChange }: { dashboard: AccountDashboard; mode: PreviewMode; onChange: () => void }) {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceAuthor, setSourceAuthor] = useState('');
  const [authorAllowed, setAuthorAllowed] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>('reference_only');
  const [external, setExternal] = useState(true);
  const [item, setItem] = useState<ContentItem | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'analyzing' | 'generating' | 'favorite'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const blocked = mode === 'blocked';
  const analysis = item?.analysis?.kind === 'emotion.v1' ? item.analysis : null;

  async function saveAndAnalyze() {
    if (!content.trim() || blocked || busy !== 'idle') return;
    setBusy('saving'); setError(''); setMessage('');
    let saved: ContentItem;
    try {
      saved = await createStudioContent({
        accountId: 'emotion_library', sourceType: external ? 'external_emotion_source' : 'manual', contentLane: 'emotion_material',
        content, licenseStatus, sourcePlatform: external ? sourcePlatform.trim() || null : null, sourceUrl: sourceUrl.trim() || null,
        sourceAuthor: licenseStatus === 'licensed' && authorAllowed ? sourceAuthor.trim() || null : null, sourceAuthorAuthorized: authorAllowed,
      }, mode);
      setItem(saved); setMessage('素材已保存，正在分析。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '素材保存失败。'); setBusy('idle'); return;
    }
    await analyze(saved);
  }

  async function analyze(target = item) {
    if (!target || blocked || target.licenseStatus === 'prohibited') return;
    setBusy('analyzing'); setError('');
    try {
      const analyzed = await analyzeStudioContent(target.id, mode);
      setItem(analyzed); setMessage('情绪分析已完成，生成结果仍需人工确认。');
    } catch (caught) {
      setError(caught instanceof Error ? `素材已保存，但分析失败：${caught.message}` : '素材已保存，但分析失败。');
    } finally { setBusy('idle'); }
  }

  async function toggleFavorite() {
    if (!item || blocked || busy !== 'idle') return;
    setBusy('favorite'); setError('');
    try {
      const updated = await apiRequest(`/api/v1/content-items/${item.id}/favorite`, mode, ContentItemSchema, { method: 'POST', body: JSON.stringify({ favorite: !item.isFavorite }) });
      setItem(updated); setMessage(updated.isFavorite ? '已加入收藏。' : '已取消收藏。'); onChange();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '收藏操作失败。'); }
    finally { setBusy('idle'); }
  }

  async function generate() {
    if (!item || !analysis || blocked || busy !== 'idle') return;
    setBusy('generating'); setError('');
    try {
      const generated = await generateStudioContent([item.id], mode);
      navigate(`/generated/${generated.id}?accountId=emotion_library`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '创作草稿生成失败。'); setBusy('idle'); }
  }

  return (
    <section className="workspace-flow" aria-labelledby="emotion-flow-title">
      <div className="section-header"><div><h2 id="emotion-flow-title">素材研究台</h2><p>先保存来源与授权状态，再理解情绪、场景和心理冲突。</p></div><Link className="secondary-button" to="/library?accountId=emotion_library"><Search size={15} />打开情绪素材库</Link></div>
      {blocked ? <BlockedNotice title="当前只能浏览" description="禁止操作状态下不会保存、收藏或生成内容。" /> : null}
      {message ? <div className="action-notice is-success" role="status"><span>{message}</span></div> : null}
      {error ? <div className="action-notice is-error" role="alert"><span>{error}</span>{item && !analysis ? <button disabled={busy !== 'idle' || blocked} onClick={() => void analyze()}>重试分析</button> : null}</div> : null}
      <div className="emotion-workspace-grid">
        <article className="panel workspace-input-card">
          <label htmlFor="emotion-material">手动记录情绪素材</label>
          <textarea id="emotion-material" value={content} maxLength={12_000} onChange={(event) => setContent(event.target.value)} placeholder="输入获得授权的文案，或仅用于研究的情绪观察……" />
          <div className="studio-form-grid">
            <label>素材来源<select aria-label="素材来源类型" value={external ? 'external' : 'manual'} onChange={(event) => setExternal(event.target.value === 'external')}><option value="external">外部情绪素材</option><option value="manual">本人手动记录</option></select></label>
            <label>授权状态<select aria-label="素材授权状态" value={licenseStatus} onChange={(event) => setLicenseStatus(event.target.value as LicenseStatus)}><option value="reference_only">仅供研究</option><option value="original">本人原创</option><option value="licensed">明确许可</option></select></label>
            {external ? <label>来源平台（必填）<input aria-label="来源平台" value={sourcePlatform} maxLength={100} onChange={(event) => setSourcePlatform(event.target.value)} placeholder="例如：获授权的读者投稿" /></label> : null}
            <label>来源链接（可选）<input aria-label="来源链接" type="url" value={sourceUrl} maxLength={2048} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
          </div>
          {licenseStatus === 'licensed' ? <><label className="human-confirm"><input type="checkbox" checked={authorAllowed} onChange={(event) => setAuthorAllowed(event.target.checked)} />许可包含记录作者署名</label>{authorAllowed ? <label>授权署名（可选）<input aria-label="授权署名" value={sourceAuthor} maxLength={100} onChange={(event) => setSourceAuthor(event.target.value)} /></label> : null}</> : null}
          <div className="workspace-warning"><strong>默认仅供研究</strong><span>未明确记录授权时，不能标记发布。</span></div>
          <footer><span>{content.length} / 12000</span><button className="primary-button" disabled={!content.trim() || (external && !sourcePlatform.trim()) || blocked || busy !== 'idle'} onClick={() => void saveAndAnalyze()}>{busy === 'saving' || busy === 'analyzing' ? '正在处理…' : '保存并分析'} <ArrowRight size={15} /></button></footer>
        </article>
        <aside className="panel workspace-distribution-card">
          <p className="kicker">CURRENT SIGNALS</p><h3>当前素材结构</h3>
          <div>{dashboard.emotionDistribution.slice(0, 4).map((value) => <span key={value.label}><i>{value.label}</i><strong>{value.count}</strong></span>)}</div>
          <div>{dashboard.themeDistribution.slice(0, 4).map((value) => <span key={value.label}><i>{value.label}</i><strong>{value.count}</strong></span>)}</div>
        </aside>
      </div>
      {analysis && item ? <article className="panel emotion-analysis-result">
        <header><div><p className="kicker">EMOTION ANALYSIS</p><h3>{analysis.reusableTheme}</h3></div><StatusPill tone={analysis.originalityRisk.level === 'high' ? 'danger' : 'warning'}>原创风险 {analysis.originalityRisk.level}</StatusPill></header>
        <AnalysisDetails analysis={analysis} />
        <div className="detail-tags">{analysis.keywords.map((keyword) => <i key={keyword}>#{keyword}</i>)}</div>
        <footer><button className="secondary-button" disabled={blocked || busy !== 'idle'} onClick={() => void toggleFavorite()}><Heart size={15} fill={item.isFavorite ? 'currentColor' : 'none'} />{item.isFavorite ? '取消收藏' : '加入收藏'}</button><button className="primary-button" disabled={blocked || busy !== 'idle'} onClick={() => void generate()}><Sparkles size={15} />{busy === 'generating' ? '正在生成…' : '生成原创研究草稿'}</button></footer>
      </article> : null}
    </section>
  );
}
