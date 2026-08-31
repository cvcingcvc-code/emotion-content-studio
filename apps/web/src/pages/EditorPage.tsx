import { AlertTriangle, ArrowLeft, Check, ChevronDown, CircleCheck, Clock3, Copy, History, Info, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Draft, Platform, Tone, VideoProject } from '@emotion-studio/contracts';
import { apiRequest, useRemote } from '../lib/api';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';

const toneLabels: Record<Tone, string> = { restrained: '克制', gentle: '温柔', clear: '清醒' };
const platformLabels: Record<Platform, string> = { xiaohongshu: '小红书', wechat_channels: '视频号', instagram_reels: 'Instagram Reels' };
const longDraft = '\n\n后来我不再催促自己立刻释怀。那些暂时说不清的感受，也可以先被认真安放。等生活重新有了具体的声音，答案的重要性就会慢慢变小。我们真正需要带走的，往往不是关于另一个人的结论，而是更诚实地理解自己。';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mode, setMode } = usePreviewMode();
  const state = useRemote<Draft[]>('/api/v1/drafts', mode);
  const [selectedId, setSelectedId] = useState(id ?? '');
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [tone, setTone] = useState<Tone>('restrained');
  const [platform, setPlatform] = useState<Platform>('wechat_channels');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [invalidatedIds, setInvalidatedIds] = useState<Set<string>>(new Set());
  const [projectIds, setProjectIds] = useState<Map<string, string>>(new Map([['draft-03', 'video-01']]));
  const [versionsOpen, setVersionsOpen] = useState(true);
  const confirmTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);

  const selected = useMemo(
    () => state.status === 'ready'
      ? state.data.find((draft) => draft.id === selectedId || draft.inspirationId === selectedId) ?? state.data[0]
      : undefined,
    [selectedId, state],
  );
  useEffect(() => {
    if (!selected) return;
    const nextText = selected.text + (mode === 'long' ? longDraft : '');
    setSelectedId(selected.id);
    setText(nextText);
    setSavedText(nextText);
    setTone(selected.tone);
    setPlatform(selected.targetPlatform);
  }, [mode, selected?.id]);

  const closeConfirmation = () => {
    setConfirmOpen(false);
    window.setTimeout(() => confirmTriggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!confirmOpen) return;
    cancelConfirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirmation();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [confirmOpen]);

  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setMode('normal')} />;
  if (mode === 'empty' || state.data.length === 0 || !selected) return <EmptyState title="还没有文案草稿" description="从灵感库选择一条内容，生成的版本会在这里等待人工编辑。" action="返回灵感库" actionTo="/library" />;

  const blocked = mode === 'blocked' || selected.safetyStatus === 'blocked' || selected.similarityRisk >= 70;
  const dirty = text !== savedText;
  const isConfirmed = (selected.status === 'confirmed' || confirmedIds.has(selected.id)) && !invalidatedIds.has(selected.id);
  const projectId = projectIds.get(selected.id);
  const estimatedSeconds = Math.max(8, Math.round(text.length / 5.2));

  const confirm = async () => {
    try {
      const updated = await apiRequest<Draft>(`/api/v1/drafts/${selected.id}/confirm`, mode, { method: 'POST', body: JSON.stringify({ humanConfirmed: true, text }) });
      setConfirmedIds((current) => new Set(current).add(updated.id));
      setInvalidatedIds((current) => { const next = new Set(current); next.delete(updated.id); return next; });
      const project = await apiRequest<VideoProject>(`/api/v1/drafts/${updated.id}/video-project`, mode, { method: 'POST', body: JSON.stringify({ templateKey: 'blank_subtitle' }) });
      setProjectIds((current) => new Map(current).set(updated.id, project.id));
      setConfirmOpen(false);
      navigate(`/studio/${project.id}`);
    } catch (error) {
      closeConfirmation();
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '确认失败' });
    }
  };

  const regenerate = () => {
    const index = state.data.findIndex((draft) => draft.id === selected.id);
    const next = state.data[(index + 1) % state.data.length];
    if (next) setSelectedId(next.id);
    setNotice({ tone: 'success', text: '已切换到另一个模拟版本；没有调用真实 AI。' });
  };

  const trapDialogFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="editor-page">
      <div className="editor-topline"><Link to="/library" className="text-button"><ArrowLeft size={14} />返回灵感库</Link><div className="save-state"><span className={dirty ? 'is-dirty' : ''}>{dirty ? '有未保存修改' : '当前修改已保存'}</span><small>版本 {selected.version} · {isConfirmed ? '已人工确认' : 'AI 草稿'}</small></div><div className="button-row"><button className="secondary-button" disabled={!dirty} onClick={() => { setSavedText(text); setNotice({ tone: 'success', text: '草稿已保存在当前会话；修改后的版本仍需重新确认。' }); }}>保存草稿</button>{isConfirmed && projectId ? <Link className="primary-button" to={`/studio/${projectId}`}>进入视频工作室</Link> : <button ref={confirmTriggerRef} className="primary-button" disabled={blocked || dirty} onClick={() => setConfirmOpen(true)}><Check size={14} />确认文案</button>}</div></div>

      {blocked ? <BlockedNotice title="当前版本无法确认" description={selected.similarityRisk >= 70 ? '文本相似风险过高，请重新生成或进行实质性改写。' : '安全检查或授权状态不满足要求。'} /> : null}
      {notice ? <div className={`editor-notice ${notice.tone === 'error' ? 'is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'error' ? <AlertTriangle size={15} /> : <CircleCheck size={15} />}{notice.text}<button onClick={() => setNotice(null)}>关闭</button></div> : null}

      <div className={`editor-workspace ${versionsOpen ? '' : 'versions-collapsed'}`}>
        <aside className={`version-rail ${versionsOpen ? '' : 'is-collapsed'}`}>
          <header><div><History size={15} /><strong>草稿版本</strong></div><button aria-label={versionsOpen ? '收起版本' : '展开版本'} aria-expanded={versionsOpen} onClick={() => setVersionsOpen((value) => !value)}><ChevronDown size={14} /></button></header>
          <div className="version-list">
            {state.data.map((draft) => <button key={draft.id} onClick={() => setSelectedId(draft.id)} className={draft.id === selected.id ? 'version-card is-selected' : 'version-card'}><span>V{draft.version}</span><strong>{toneLabels[draft.tone]}表达</strong><p>{draft.text}</p><small>{draft.generatedBy === 'ai' ? 'AI 草稿' : '人工版本'} · {new Date(draft.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></button>)}
          </div>
        </aside>

        <main className="writing-surface">
          <header><div><p className="kicker">DRAFT / {String(selected.version).padStart(2, '0')}</p><h1>把情绪写成自己的句子</h1></div><StatusPill tone={isConfirmed ? 'good' : 'neutral'}>{isConfirmed ? '已确认' : 'AI 草稿'}</StatusPill></header>
          <textarea aria-label="文案正文" value={text} onChange={(event) => { setText(event.target.value); if (isConfirmed) setInvalidatedIds((current) => new Set(current).add(selected.id)); }} />
          <footer><div><span>{text.length} 字</span><span><Clock3 size={13} />预计 {estimatedSeconds} 秒</span></div><button className="text-button" onClick={() => void navigator.clipboard?.writeText(text)}><Copy size={13} />复制文案</button></footer>
          {text.length > 220 ? <div className="length-warning"><Info size={15} /><span>当前文案可能超过固定模板容量。建议拆成两条内容或精简到 220 字以内，系统不会自动截断。</span></div> : null}
        </main>

        <aside className="generation-panel">
          <div className="generation-heading"><Sparkles size={18} /><div><strong>创作设置</strong><span>仅模拟，不调用真实 AI</span></div></div>
          <label><span>表达语气</span><select value={tone} onChange={(event) => setTone(event.target.value as Tone)}><option value="restrained">克制</option><option value="gentle">温柔</option><option value="clear">清醒</option></select></label>
          <label><span>文案长度</span><select defaultValue="medium"><option value="short">短 · 30—60字</option><option value="medium">中 · 60—140字</option><option value="long">长 · 140—220字</option></select></label>
          <label><span>目标平台</span><select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{Object.entries(platformLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="secondary-button full-button" onClick={regenerate}><RotateCcw size={14} />切换模拟版本</button>
          <div className="quality-checks"><h3>生成后检查</h3><div><ShieldCheck size={14} /><span>内容安全</span><strong>{selected.safetyStatus === 'safe' ? '通过' : selected.safetyStatus === 'blocked' ? '阻止' : '需复核'}</strong></div><div><ShieldCheck size={14} /><span>文本相似</span><strong>{selected.similarityRisk}%</strong></div><p>风险提示不是法律结论，确认前仍需完整阅读。</p></div>
        </aside>
      </div>

      {confirmOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={closeConfirmation}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={trapDialogFocus} onMouseDown={(event) => event.stopPropagation()}><p className="kicker">HUMAN CONFIRMATION</p><h2 id="confirm-title">确认这是可以继续制作的文案？</h2><p>确认代表你已经阅读全文，并检查了授权、内容安全和相似风险。之后仍可复制为新版本继续修改。</p><ul><li><Check size={14} />当前文本由你人工确认</li><li><Check size={14} />没有直接使用歌词或评论原文</li><li><Check size={14} />仅生成视频草稿，不会自动发布</li></ul><div className="button-row"><button ref={cancelConfirmRef} className="secondary-button" onClick={closeConfirmation}>返回检查</button><button className="primary-button" onClick={() => void confirm()}>确认并进入视频制作</button></div></section></div> : null}
    </div>
  );
}
