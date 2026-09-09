import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContentItem } from '@emotion-studio/contracts';
import { BlockedNotice } from '../../components/States';
import type { PreviewMode } from '../../lib/api';
import { createStudioContent, generateStudioContent } from '../../lib/studioApi';

export default function EnglishWorkspace({ mode }: { mode: PreviewMode }) {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [item, setItem] = useState<ContentItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const blocked = mode === 'blocked';

  async function generate() {
    if (!topic.trim() || blocked || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    let saved = item;
    try {
      if (!saved || saved.content !== topic.trim()) {
        saved = await createStudioContent({
          accountId: 'fun_english', sourceType: 'english_topic', contentLane: 'english_50',
          content: topic, licenseStatus: 'original', sourcePlatform: null, sourceUrl: null,
          sourceAuthor: null, sourceAuthorAuthorized: false,
        }, mode);
        setItem(saved);
        setMessage('主题已保存，正在生成 5 组共 50 句。');
      }
      const generated = await generateStudioContent([saved.id], mode);
      navigate(`/generated/${generated.id}?accountId=fun_english`);
    } catch (caught) {
      setError(caught instanceof Error ? `${saved ? '主题已保存，' : ''}${caught.message}` : '生成失败。');
      setBusy(false);
    }
  }

  return (
    <section className="workspace-flow" aria-labelledby="english-flow-title">
      <div className="section-header"><div><h2 id="english-flow-title">今天做什么英语主题？</h2><p>输入一个生活主题，生成 5 个场景、每组 10 句的发布包。</p></div></div>
      {blocked ? <BlockedNotice title="当前只能浏览" description="禁止操作状态下不会保存主题或生成内容。" /> : null}
      {message ? <div className="action-notice is-success" role="status"><CheckCircle2 size={16} /><span>{message}</span></div> : null}
      {error ? <div className="action-notice is-error" role="alert"><span>{error}</span><button onClick={() => void generate()}>重试</button></div> : null}
      <div className="workspace-flow-grid english-topic-grid">
        <article className="panel workspace-input-card english-topic-card">
          <label htmlFor="english-topic">主题</label>
          <input id="english-topic" value={topic} maxLength={120} onChange={(event) => { setTopic(event.target.value); setItem(null); }} placeholder="例如：熬夜人的英语50句" />
          <div className="topic-suggestions" aria-label="演示主题建议"><button type="button" onClick={() => { setTopic('拖延症英语'); setItem(null); }}>拖延症英语</button><button type="button" onClick={() => { setTopic('社交电量英语'); setItem(null); }}>社交电量英语</button><button type="button" onClick={() => { setTopic('熬夜人的英语50句'); setItem(null); }}>熬夜人的英语50句</button><small>演示模式支持拖延症、社交电量、熬夜、打工人和吃货主题。</small></div>
          <footer><span>{topic.length} / 120</span><button className="primary-button" disabled={!topic.trim() || blocked || busy} onClick={() => void generate()}><Sparkles size={15} />{busy ? '正在生成 50 句…' : '生成英语 50 句'} <ArrowRight size={15} /></button></footer>
        </article>
        <aside className="panel english-spec-card"><p className="kicker">FIXED OUTPUT</p><h3>5 组 × 10 句</h3><ol><li>生活化英文</li><li>自然中文解释</li><li>必要的使用语境</li><li>5 页内容拆分</li><li>标题、正文和标签</li></ol></aside>
      </div>
    </section>
  );
}
