import { ArrowRight, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContentItem, GrowthAnalysis } from '@emotion-studio/contracts';
import { BlockedNotice, StatusPill } from '../../components/States';
import type { PreviewMode } from '../../lib/api';
import { analyzeStudioContent, createStudioContent, generateStudioContent } from '../../lib/studioApi';

export default function GrowthWorkspace({ mode }: { mode: PreviewMode }) {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [item, setItem] = useState<ContentItem | null>(null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'analyzing' | 'generating'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const blocked = mode === 'blocked';
  const analysis = item?.analysis?.kind === 'growth.v1' ? item.analysis : null;

  async function saveAndAnalyze() {
    if (!content.trim() || blocked || busy !== 'idle') return;
    setError('');
    setMessage('');
    setBusy('saving');
    let saved: ContentItem;
    try {
      saved = await createStudioContent({
        accountId: 'personal_growth', sourceType: 'daily_review', contentLane: 'growth_review',
        content, licenseStatus: 'original', sourcePlatform: null, sourceUrl: null,
        sourceAuthor: null, sourceAuthorAuthorized: false,
      }, mode);
      setItem(saved);
      setMessage('真实经历已保存，正在分析。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败。');
      setBusy('idle');
      return;
    }
    await analyze(saved);
  }

  async function analyze(target = item) {
    if (!target || blocked) return;
    setBusy('analyzing');
    setError('');
    try {
      const analyzed = await analyzeStudioContent(target.id, mode);
      setItem(analyzed);
      setMessage('复盘已完成。生成时只会使用下方事实锚点。');
    } catch (caught) {
      setError(caught instanceof Error ? `经历已保存，但分析失败：${caught.message}` : '经历已保存，但分析失败。');
    } finally {
      setBusy('idle');
    }
  }

  async function generate() {
    if (!item || !analysis || blocked || busy !== 'idle') return;
    setBusy('generating');
    setError('');
    try {
      const generated = await generateStudioContent([item.id], mode);
      navigate(`/generated/${generated.id}?accountId=personal_growth`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文案生成失败。');
      setBusy('idle');
    }
  }

  return (
    <section className="workspace-flow" aria-labelledby="growth-flow-title">
      <div className="section-header"><div><h2 id="growth-flow-title">今天发生了什么？</h2><p>只记录你真实经历的人、事、时间、对话和结果。</p></div></div>
      {blocked ? <BlockedNotice title="当前只能浏览" description="禁止操作状态下不会保存、分析或生成内容。" /> : null}
      {message ? <div className="action-notice is-success" role="status"><CheckCircle2 size={16} /><span>{message}</span></div> : null}
      {error ? <div className="action-notice is-error" role="alert"><span>{error}</span>{item && !analysis ? <button onClick={() => void analyze()}><RotateCcw size={14} />重试分析</button> : null}</div> : null}

      <div className="workspace-flow-grid">
        <article className="panel workspace-input-card">
          <label htmlFor="growth-event">真实经历</label>
          <textarea id="growth-event" value={content} maxLength={12_000} onChange={(event) => setContent(event.target.value)} placeholder="例如：今天面试后，我发现自己一遇到追问就容易语速变快……" />
          <footer><span>{content.length} / 12000</span><button className="primary-button" disabled={!content.trim() || blocked || busy !== 'idle'} onClick={() => void saveAndAnalyze()}>{busy === 'saving' || busy === 'analyzing' ? '正在保存与分析…' : '保存并分析'} <ArrowRight size={15} /></button></footer>
        </article>
        <aside className="panel truth-policy-card">
          <p className="kicker">TRUTH FIRST</p>
          <h3>AI 不得补写事实</h3>
          <p>人物、对话、金额、时间、结果和经历只能来自你的输入。缺少信息会被标记，不会被自动补齐。</p>
        </aside>
      </div>
      {analysis ? <GrowthAnalysisPanel analysis={analysis} busy={busy} blocked={blocked} onGenerate={() => void generate()} /> : null}
    </section>
  );
}

function GrowthAnalysisPanel({ analysis, busy, blocked, onGenerate }: { analysis: GrowthAnalysis; busy: string; blocked: boolean; onGenerate: () => void }) {
  return (
    <article className="panel workspace-analysis-card">
      <header><div><p className="kicker">GROUNDED REVIEW</p><h3>事实锚点与问题拆解</h3></div><StatusPill tone={analysis.riskFlags.length ? 'warning' : 'good'}>{analysis.riskFlags.length ? '需人工复核' : '已引用事实'}</StatusPill></header>
      <div className="truth-anchor-list">{analysis.truthAnchors.map((anchor) => <blockquote key={anchor.id}><span>{anchor.kind}</span><p>{anchor.quote}</p></blockquote>)}</div>
      <div className="analysis-columns">
        <div><span>核心矛盾</span><p>{analysis.coreConflict.text}</p></div>
        <div><span>根本问题</span><p>{analysis.rootProblem.text}</p></div>
        <div><span>普通人可以怎么做</span><ul>{analysis.actionableAdvice.map((advice) => <li key={advice}>{advice}</li>)}</ul></div>
      </div>
      {analysis.missingInformation.length ? <div className="workspace-warning"><strong>缺少的信息</strong><span>{analysis.missingInformation.join('、')}</span></div> : null}
      <footer><span>生成结果仍是草稿，发布前必须人工确认。</span><button className="primary-button" disabled={blocked || busy !== 'idle'} onClick={onGenerate}><Sparkles size={15} />{busy === 'generating' ? '正在生成…' : '生成小红书发布包'}</button></footer>
    </article>
  );
}
