import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Eye, Flag, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Material, ReviewInbox, ReviewMaterialInput } from '@emotion-studio/contracts';
import { apiRequest, useRemote } from '../lib/api';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';

const riskLabels: Record<Material['riskLevel'], string> = { low: '低风险', medium: '需留意', high: '高风险', blocked: '已隔离' };
const statusLabels: Record<Material['reviewStatus'], string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', needs_edit: '需修改', reference_only: '仅参考' };
const flagLabels: Record<string, string> = { duplicate: '疑似重复', birthday: '生日祝福', fandom: '追星内容', advertising: '广告', privacy: '隐私', copyright_like: '版权疑似', long_copy: '长文案' };

const longReading = '这段内容故意写得更长，用来检查在有限宽度里是否仍然保持舒适的行距、合理的段落长度和稳定的审核操作。它不依赖夸张的截断来掩盖问题，也不会因为字数增加就把操作按钮推到无法找到的位置。阅读者可以先完整理解情绪和语境，再决定它适合继续创作、需要修改，还是只应该留在研究区域。';

export default function ReviewPage() {
  const { mode, setMode } = usePreviewMode();
  const state = useRemote<ReviewInbox>('/api/v1/review-inbox', mode);
  const [items, setItems] = useState<Material[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'risk' | 'duplicate' | 'privacy'>('all');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') return;
    setItems(state.data.items);
    setHydrated(true);
    setSelectedId((current) => current || state.data.items[0]?.id || '');
  }, [state]);

  const filtered = useMemo(() => items.filter((item) => {
    if (filter === 'risk') return item.riskLevel === 'high' || item.riskLevel === 'blocked';
    if (filter === 'duplicate') return item.filterFlags.includes('duplicate');
    if (filter === 'privacy') return item.filterFlags.includes('privacy');
    return true;
  }), [filter, items]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const counts = useMemo(() => ({
    total: items.length,
    pending: items.filter((item) => item.reviewStatus === 'pending').length,
    highRisk: items.filter((item) => item.riskLevel === 'high' || item.riskLevel === 'blocked').length,
    duplicates: items.filter((item) => item.filterFlags.includes('duplicate')).length,
    privacy: items.filter((item) => item.filterFlags.includes('privacy')).length,
  }), [items]);

  if (state.status === 'loading') return <LoadingState rows={5} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setMode('normal')} />;
  if (!hydrated) return <LoadingState rows={5} />;
  if (mode === 'empty' || items.length === 0) return <EmptyState title="收件箱已经清空" description="没有待处理素材。导入新内容后，自动检查结果会先来到这里。" action="前往素材导入" actionTo="/import" />;

  const review = async (decision: ReviewMaterialInput['decision']) => {
    if (!selected) return;
    const input: ReviewMaterialInput = { decision, ...(decision === 'approved' ? {} : { reason: decision === 'reference_only' ? '仅用于主题研究' : '需要人工调整后再评估' }) };
    try {
      const updated = await apiRequest<Material>(`/api/v1/materials/${selected.id}/review`, mode, { method: 'POST', body: JSON.stringify(input) });
      setItems((current) => updated.reviewStatus === 'needs_edit'
        ? current.map((item) => item.id === updated.id ? updated : item)
        : current.filter((item) => item.id !== updated.id));
      setSelectedId('');
      setNotice({ tone: 'success', text: `已标记为“${statusLabels[updated.reviewStatus]}”，继续检查下一条内容。` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '模拟审核失败' });
    }
  };

  const currentIndex = selected ? filtered.findIndex((item) => item.id === selected.id) : -1;
  const move = (offset: number) => {
    const next = filtered[(currentIndex + offset + filtered.length) % filtered.length];
    if (next) setSelectedId(next.id);
  };
  const blocked = mode === 'blocked' || selected?.licenseStatus === 'reference_only' || selected?.licenseStatus === 'prohibited' || selected?.riskLevel === 'blocked';

  return (
    <>
      <div className="review-summary">
        <div><p className="kicker">HUMAN IN THE LOOP</p><h2>先读懂，再决定是否留下。</h2></div>
        <div className="review-counts"><span><strong>{counts.pending}</strong>待审核</span><span><strong>{counts.highRisk}</strong>高风险</span><span><strong>{counts.duplicates}</strong>疑似重复</span></div>
      </div>
      <div className="filter-bar review-filters">
        {[
          ['all', `全部 ${counts.total}`], ['risk', `高风险 ${counts.highRisk}`], ['duplicate', `疑似重复 ${counts.duplicates}`], ['privacy', `隐私 ${counts.privacy}`],
        ].map(([value, label]) => <button key={value} className={filter === value ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setFilter(value as typeof filter)}>{label}</button>)}
        <span className="review-shortcut">快捷键仅在正式版本启用</span>
      </div>

      <div className="review-workspace">
        <aside className="review-list" aria-label="待审核素材列表">
          {filtered.map((item, index) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={selected?.id === item.id ? 'review-list-item is-selected' : 'review-list-item'}>
            <span className="review-list-index">{String(index + 1).padStart(2, '0')}</span>
            <span><strong>{item.text}</strong><small>{item.theme} · {riskLabels[item.riskLevel]}</small></span>
            {item.filterFlags.length ? <Flag size={13} /> : null}
          </button>)}
        </aside>

        <article className="review-reader">
          {selected ? <>
            <header className="reader-head"><div className="meta-line"><StatusPill tone={selected.riskLevel === 'low' ? 'good' : selected.riskLevel === 'medium' ? 'warning' : 'danger'}>{riskLabels[selected.riskLevel]}</StatusPill><span>{selected.theme}</span><span>{selected.scenario}</span></div><span>{currentIndex + 1} / {filtered.length}</span></header>
            <div className="reader-copy"><p className={`quote-text ${mode === 'long' ? 'long-copy' : ''}`}>{mode === 'long' ? `${selected.text}\n\n${longReading}` : selected.text}</p></div>
            <section className="assessment-grid">
              <div><span>来源与授权</span><strong>{selected.licenseStatus === 'original' ? '本人原创' : selected.licenseStatus === 'licensed' ? '明确许可' : selected.licenseStatus === 'reference_only' ? '仅供参考' : '禁止使用'}</strong><small>{selected.sourceType}</small></div>
              <div><span>自动检查</span><strong>{selected.filterFlags.length ? selected.filterFlags.map((flag) => flagLabels[flag]).join('、') : '未发现明显问题'}</strong><small>仍需人工判断</small></div>
              <div><span>当前状态</span><strong>{statusLabels[selected.reviewStatus]}</strong><small>{new Date(selected.importedAt).toLocaleDateString('zh-CN')}</small></div>
            </section>
            {selected.filterFlags.length ? <div className="risk-callout"><ShieldAlert size={17} /><div><strong>检查提示</strong><p>{selected.filterFlags.map((flag) => flagLabels[flag]).join('、')}。请结合上下文判断，不要仅依据自动标签。</p></div></div> : null}
            {blocked ? <BlockedNotice title="这条内容不能进入创作流程" description="授权或风险状态不满足使用条件。你仍可将它保留为研究参考，不能生成文案或视频。" /> : null}
            {notice ? <div className={`review-notice ${notice.tone === 'error' ? 'is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'error' ? <AlertTriangle size={14} /> : <Check size={14} />}{notice.text}<button onClick={() => setNotice(null)}><RotateCcw size={12} />关闭</button></div> : null}
            <footer className="review-actions">
              <div><button className="danger-button" onClick={() => void review('rejected')}><X size={14} />拒绝</button><button className="quiet-button" onClick={() => void review('reference_only')}><Eye size={14} />仅参考</button><button className="secondary-button" onClick={() => void review('needs_edit')}><Copy size={14} />需要修改</button></div>
              <button className="primary-button" disabled={blocked} onClick={() => void review('approved')}><Check size={14} />通过并加入灵感库</button>
            </footer>
          </> : <EmptyState title="没有符合筛选的内容" description="切换筛选条件后再试。" />}
        </article>

        <div className="reader-pagination"><button aria-label="上一条" disabled={filtered.length === 0} onClick={() => move(-1)}><ChevronLeft size={16} /></button><button aria-label="下一条" disabled={filtered.length === 0} onClick={() => move(1)}><ChevronRight size={16} /></button></div>
      </div>
      <div className="mobile-review-note"><AlertTriangle size={15} />移动端支持基础审核；复杂风险判断建议在桌面端完成。</div>
    </>
  );
}
