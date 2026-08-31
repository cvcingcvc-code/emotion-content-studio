import { AlertTriangle, ArrowLeft, Check, ChevronRight, CirclePlay, Clock3, Download, Image, LayoutTemplate, MonitorSmartphone, Pause, Play, RefreshCw, SlidersHorizontal, Type } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Draft, ExportRecord, TemplateKey, VideoProject } from '@emotion-studio/contracts';
import { apiRequest, useRemote } from '../lib/api';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';

const templates: Array<{ key: TemplateKey; name: string; eyebrow: string; description: string; bestFor: string }> = [
  { key: 'blank_subtitle', name: '留白字幕', eyebrow: '01 / MINIMAL', description: '暖白底色与克制排版，让一句话拥有足够的停顿。', bestFor: '观点 · 成长 · 清醒表达' },
  { key: 'cinematic_monologue', name: '电影独白', eyebrow: '02 / CINEMATIC', description: '深色场景与中下部字幕，适合带有故事感的叙述。', bestFor: '遗憾 · 回忆 · 关系故事' },
  { key: 'night_mood', name: '夜色情绪', eyebrow: '03 / NIGHT', description: '低饱和夜色和细微光点，保留安静的情绪张力。', bestFor: '夜晚 · 治愈 · 独处' },
];

export default function StudioPage() {
  const { id } = useParams();
  const { mode, setMode } = usePreviewMode();
  const projects = useRemote<VideoProject[]>('/api/v1/video-projects', mode);
  const drafts = useRemote<Draft[]>('/api/v1/drafts', mode);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('blank_subtitle');
  const [alignment, setAlignment] = useState<'left' | 'center'>('center');
  const [palette, setPalette] = useState<'warm_white' | 'soft_gray' | 'deep_ink'>('warm_white');
  const [pace, setPace] = useState<'slow' | 'standard'>('slow');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(28);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const selected = useMemo(() => projects.status === 'ready' ? projects.data.find((item) => item.id === selectedId) ?? projects.data[0] : undefined, [projects, selectedId]);
  const draft = useMemo(() => drafts.status === 'ready' && selected ? drafts.data.find((item) => item.id === selected.draftId) ?? drafts.data[0] : undefined, [drafts, selected]);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setTemplateKey(selected.templateKey);
    setAlignment(selected.config.alignment);
    setPalette(selected.config.palette);
    setPace(selected.config.pace);
  }, [selected?.id]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setProgress((value) => value >= 100 ? 0 : value + 1), pace === 'slow' ? 120 : 75);
    return () => window.clearInterval(timer);
  }, [pace, playing]);

  if (projects.status === 'loading' || drafts.status === 'loading') return <LoadingState rows={4} />;
  if (projects.status === 'error') return <ErrorState message={projects.error} onRetry={() => setMode('normal')} />;
  if (drafts.status === 'error') return <ErrorState message={drafts.error} onRetry={() => setMode('normal')} />;
  if (mode === 'empty' || !selected || !draft) return <EmptyState title="还没有视频项目" description="确认一版原创文案后，选择三套固定模板之一开始制作。" action="返回文案编辑器" actionTo="/editor/draft-01" />;

  const template = templates.find((item) => item.key === templateKey) ?? templates[0]!;
  const blocked = mode === 'blocked' || selected.licenseStatus === 'reference_only' || selected.licenseStatus === 'prohibited' || draft.status !== 'confirmed';
  const displayText = mode === 'long' ? `${draft.text} 这一段额外的文字用来检查长文案在九比十六画布中的容量边界。系统不会为了塞下全部内容而缩小到难以阅读。` : draft.text;

  const simulateExport = async () => {
    try {
      const updated = await apiRequest<ExportRecord>(`/api/v1/video-projects/${selected.id}/simulated-export`, mode, {
        method: 'POST',
        body: JSON.stringify({ acknowledgedRights: true, templateKey, config: { alignment, palette, pace } }),
      });
      setNotice({ tone: 'success', text: `“${updated.title}”已加入模拟导出队列。没有调用真实渲染器。` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '模拟导出失败' });
    }
  };

  return (
    <div className="studio-page">
      <div className="studio-toolbar"><Link className="text-button" to="/editor/draft-01"><ArrowLeft size={14} />返回文案</Link><div className="studio-document"><strong>{selected.title}</strong><span>上次保存于 {new Date(selected.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div><div className="button-row"><button className="secondary-button" onClick={() => setNotice({ tone: 'success', text: '当前预览参数已应用；本轮不会持久保存项目配置。' })}>应用预览</button><button className="primary-button" disabled={blocked} onClick={() => void simulateExport()}><Download size={14} />模拟导出</button></div></div>
      {blocked ? <BlockedNotice title="当前项目不能导出" description={draft.status !== 'confirmed' ? '文案仍是 AI 草稿。请先返回编辑器完成人工确认。' : '授权状态只允许研究，不能制作或导出视频。'} /> : null}
      {mode === 'long' ? <div className="studio-warning">文案预计超过模板容量，请精简或拆分。预览不会自动把字体缩小到不可读。</div> : null}
      {notice ? <div className={`studio-notice ${notice.tone === 'error' ? 'is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'error' ? <AlertTriangle size={14} /> : <Check size={14} />}{notice.text}<button onClick={() => setNotice(null)}>知道了</button></div> : null}

      <div className="studio-mobile-gate"><MonitorSmartphone size={22} /><div><strong>移动端提供简化预览</strong><span>完整画布和属性调整请使用 768px 以上的屏幕。</span></div></div>

      <div className="studio-workspace">
        <aside className="asset-panel studio-panel">
          <header><LayoutTemplate size={16} /><strong>素材与模板</strong></header>
          <section><span className="panel-label">当前文案</span><div className="studio-copy-card"><p>{draft.text}</p><small>{draft.text.length} 字 · 已人工确认</small></div></section>
          <section><span className="panel-label">固定模板</span><div className="template-list">{templates.map((item) => <button key={item.key} aria-pressed={templateKey === item.key} onClick={() => setTemplateKey(item.key)} className={templateKey === item.key ? 'template-option is-selected' : 'template-option'}><span className={`template-swatch template-${item.key}`}><i /></span><span><small>{item.eyebrow}</small><strong>{item.name}</strong></span><ChevronRight size={14} /></button>)}</div></section>
          <section><span className="panel-label">背景素材</span><div className="asset-placeholder"><Image size={20} /><span>使用模板内置抽象背景</span><small>不包含外部媒体</small></div></section>
        </aside>

        <main className="canvas-stage">
          <div className="canvas-meta"><span>{template.name}</span><StatusPill tone={selected.status === 'preview_ready' ? 'good' : 'neutral'}>{selected.status === 'preview_ready' ? '预览已就绪' : '模拟预览'}</StatusPill></div>
          <div className={`video-canvas canvas-${templateKey} palette-${palette} align-${alignment}`}>
            <div className="canvas-safe-zone">
              {templateKey === 'cinematic_monologue' ? <div className="cinema-scene"><i /><i /><i /></div> : null}
              {templateKey === 'night_mood' ? <div className="night-scene"><i /><span /></div> : null}
              <p>{displayText}</p>
              <small>{templateKey === 'blank_subtitle' ? '字里 · 情绪札记' : templateKey === 'cinematic_monologue' ? 'A QUIET MONOLOGUE' : 'AFTER MIDNIGHT'}</small>
            </div>
          </div>
          <div className="playback"><button aria-label={playing ? '暂停' : '播放'} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button><span>00:{String(Math.round(selected.durationSeconds * progress / 100)).padStart(2, '0')}</span><button className="play-track" onClick={() => setProgress((value) => value >= 75 ? 12 : value + 25)} aria-label="调整预览进度"><i style={{ width: `${progress}%` }} /></button><span>00:{String(selected.durationSeconds).padStart(2, '0')}</span><button aria-label="重新播放" onClick={() => setProgress(0)}><RefreshCw size={14} /></button></div>
          <div className="canvas-caption"><CirclePlay size={14} /><span>浏览器模拟预览 · 1080 × 1920 · 30 fps</span></div>
        </main>

        <aside className="property-panel studio-panel">
          <header><SlidersHorizontal size={16} /><strong>属性</strong></header>
          <section><span className="panel-label">模板说明</span><h3>{template.name}</h3><p>{template.description}</p><small>{template.bestFor}</small></section>
          <section><span className="panel-label"><Type size={13} />文字对齐</span><div className="segmented"><button aria-pressed={alignment === 'left'} className={alignment === 'left' ? 'is-active' : ''} onClick={() => setAlignment('left')}>左对齐</button><button aria-pressed={alignment === 'center'} className={alignment === 'center' ? 'is-active' : ''} onClick={() => setAlignment('center')}>居中</button></div></section>
          <section><span className="panel-label">背景色调</span><div className="palette-options">{(['warm_white', 'soft_gray', 'deep_ink'] as const).map((value) => <button aria-label={value === 'warm_white' ? '暖白' : value === 'soft_gray' ? '柔灰' : '深墨'} aria-pressed={palette === value} key={value} className={`${value} ${palette === value ? 'is-active' : ''}`} onClick={() => setPalette(value)}><i /></button>)}</div></section>
          <section><span className="panel-label"><Clock3 size={13} />文字节奏</span><div className="segmented"><button aria-pressed={pace === 'slow'} className={pace === 'slow' ? 'is-active' : ''} onClick={() => setPace('slow')}>舒缓</button><button aria-pressed={pace === 'standard'} className={pace === 'standard' ? 'is-active' : ''} onClick={() => setPace('standard')}>标准</button></div></section>
          <section className="project-spec"><div><span>画幅</span><strong>9:16</strong></div><div><span>时长</span><strong>{selected.durationSeconds}s</strong></div><div><span>字幕</span><strong>开启</strong></div></section>
          <button className="secondary-button full-button" onClick={() => { setPlaying(true); setNotice({ tone: 'success', text: '模拟预览正在播放。' }); }}><CirclePlay size={14} />生成模拟预览</button>
        </aside>
      </div>
    </div>
  );
}
