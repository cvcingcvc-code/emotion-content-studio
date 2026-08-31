import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { GeneratedContent } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, EmptyState, ErrorState, LoadingState, StatusPill } from '../components/States';
import { useRemote } from '../lib/api';

export default function GeneratedContentPage() {
  const { id = '' } = useParams();
  const { mode, setMode } = usePreviewMode();
  const state = useRemote<GeneratedContent>(`/api/v1/generated-contents/${encodeURIComponent(id)}`, mode);

  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => setMode('normal')} />;
  if (mode === 'empty') return <EmptyState title="没有找到生成结果" description="回到灵感库选择 1–5 条素材，再生成一份新的 DEMO 草稿。" action="返回灵感库" actionTo="/inspirations" />;

  const generated = state.data;

  return (
    <>
      <div className="detail-topline"><Link className="text-button" to="/inspirations"><ArrowLeft size={15} />返回灵感库</Link><StatusPill tone="warning">草稿 · 待人工确认</StatusPill></div>
      {mode === 'blocked' ? <BlockedNotice title="当前为只读预览" description="你可以阅读生成结果，但后续编辑与发布能力尚未开放。" /> : null}

      <div className="generated-layout">
        <article className="panel generated-paper">
          <header>
            <div><span className="demo-ai-label"><Sparkles size={14} />{generated.generatorLabel}</span><p>由 MockContentGenerator 根据 {generated.contentIds.length} 条素材组合生成</p></div>
            <FileText size={22} strokeWidth={1.4} />
          </header>
          <section className="generated-section">
            <span>小红书标题</span>
            <h2>{generated.title}</h2>
          </section>
          <section className="generated-section generated-body">
            <span>正文</span>
            {generated.body.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section className="generated-section">
            <span>标签</span>
            <div className="generated-tags">{generated.hashtags.map((tag) => <i key={tag}>{tag}</i>)}</div>
          </section>
        </article>

        <aside className="panel generated-note">
          <p className="kicker">DEMO ONLY</p>
          <h3>这不是可直接发布的成稿。</h3>
          <p>当前结果由固定规则生成，没有调用真实 AI。接入模型后，仍需保留授权校验、相似度检查和人工确认。</p>
          <dl><div><dt>状态</dt><dd>草稿</dd></div><div><dt>生成器</dt><dd>Mock</dd></div><div><dt>素材数</dt><dd>{generated.contentIds.length}</dd></div><div><dt>正文长度</dt><dd>{generated.body.length} 字</dd></div></dl>
          <Link className="secondary-button" to="/inspirations">重新选择素材</Link>
        </aside>
      </div>
    </>
  );
}
