import { AlertCircle, ArrowRight, CheckCircle2, FileSpreadsheet, Sparkles, UploadCloud } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import type { CsvImportSummary } from '@emotion-studio/contracts';
import { usePreviewMode } from '../components/AppShell';
import { BlockedNotice, ErrorState, LoadingState } from '../components/States';
import { apiRequest } from '../lib/api';

type LicenseStatus = 'original' | 'licensed';

export default function ImportPage() {
  const { mode, setMode } = usePreviewMode();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>('original');
  const [sourceName, setSourceName] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'uploading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<CsvImportSummary | null>(null);
  const [message, setMessage] = useState('');
  const [demoMessage, setDemoMessage] = useState('');
  const blocked = mode === 'blocked';

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setResult(null);
    setMessage('');
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setStatus('error');
      setMessage('请选择 .csv 文件。');
      return;
    }
    if (nextFile.size > 2_000_000) {
      setFile(null);
      setStatus('error');
      setMessage('CSV 文件不能超过 2 MB。');
      return;
    }
    setFile(nextFile);
    setStatus('idle');
  }

  async function importCsv() {
    if (!file || blocked) return;
    setStatus('reading');
    setMessage('');
    try {
      const csvText = await file.text();
      setStatus('uploading');
      const summary = await apiRequest<CsvImportSummary>('/api/v1/imports/csv', mode, {
        method: 'POST',
        body: JSON.stringify({ csvText, licenseStatus, ...(sourceName.trim() ? { sourceName: sourceName.trim() } : {}) }),
      });
      setResult(summary);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '无法导入这份 CSV。');
    }
  }

  async function loadDemoData() {
    if (blocked) return;
    setDemoMessage('正在载入演示素材…');
    try {
      const response = await apiRequest<{ loadedCount: number; totalCount: number }>('/api/v1/demo-data/load', mode, { method: 'POST' });
      setDemoMessage(`已载入 ${response.loadedCount} 条原创演示素材，当前共 ${response.totalCount} 条。`);
    } catch (error) {
      setDemoMessage(error instanceof Error ? error.message : '演示数据加载失败。');
    }
  }

  if (mode === 'loading') return <LoadingState rows={4} />;
  if (mode === 'error') return <ErrorState message="导入服务暂时不可用，没有内容被写入。" onRetry={() => setMode('normal')} />;

  return (
    <>
      <div className="page-intro compact-intro">
        <div className="page-intro-copy">
          <p className="kicker">CSV IN, SIGNAL OUT</p>
          <h2>导入一份 CSV，自动完成清洗与模拟分析。</h2>
          <p>只有 <code>content</code> 列是必填的。可选列为 author、likes、source 和 url。原文会保留，分析结果由 MockAnalyzer 生成。</p>
        </div>
        <button className="secondary-button" disabled={blocked || demoMessage.startsWith('正在')} onClick={() => void loadDemoData()}><Sparkles size={15} />加载演示数据</button>
      </div>

      {blocked ? <BlockedNotice title="导入已停用" description="当前为禁止操作状态，不会读取或发送文件内容。" /> : null}
      {demoMessage ? <div className={`action-notice ${demoMessage.startsWith('已') ? 'is-success' : ''}`} role="status"><span>{demoMessage}</span>{demoMessage.startsWith('已') ? <Link to="/library">查看素材库 <ArrowRight size={14} /></Link> : null}</div> : null}

      <div className="demo-import-grid">
        <section className="panel csv-import-panel">
          <div className="panel-head"><div><h3>选择 CSV 文件</h3><span>文件内容只会发送给当前 Mock API</span></div><FileSpreadsheet size={20} /></div>
          <div className="panel-body csv-import-body">
            <input ref={inputRef} className="visually-hidden" aria-label="选择 CSV 文件" type="file" accept=".csv,text/csv" onChange={chooseFile} />
            <button className={`real-upload-zone ${file ? 'has-file' : ''}`} disabled={blocked} onClick={() => inputRef.current?.click()}>
              {file ? <CheckCircle2 size={30} /> : <UploadCloud size={30} />}
              <strong>{file ? file.name : '点击选择 CSV'}</strong>
              <span>{file ? `${Math.max(1, Math.ceil(file.size / 1024))} KB · 可以开始导入` : '支持 UTF-8 CSV，不需要字段 Mapping'}</span>
            </button>

            <div className="form-grid demo-import-form">
              <label><span>授权状态</span><select value={licenseStatus} onChange={(event) => setLicenseStatus(event.target.value as LicenseStatus)}><option value="original">本人原创</option><option value="licensed">已获得明确许可</option></select></label>
              <label><span>来源名称 <small>可选</small></span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="例如：我的创作笔记" /></label>
            </div>

            {status === 'error' ? <div className="action-notice is-error" role="alert"><AlertCircle size={16} /><span>{message}</span></div> : null}
            <button className="primary-button import-submit" disabled={!file || blocked || status === 'reading' || status === 'uploading'} onClick={() => void importCsv()}>
              {status === 'reading' ? '正在读取文件…' : status === 'uploading' ? '正在清洗与分析…' : '导入并自动处理'} <ArrowRight size={15} />
            </button>
          </div>
        </section>

        <aside className="panel csv-format-card">
          <p className="kicker">MINIMUM FORMAT</p>
          <h3>最小可用格式</h3>
          <pre>content,author,likes,source,url{`\n`}&quot;今天也想好好生活&quot;,,12,我的笔记,</pre>
          <ul><li>content 必填</li><li>保留中文和 Emoji</li><li>识别空内容与明显重复</li><li>不调用真实 AI</li></ul>
        </aside>
      </div>

      {status === 'success' && result ? <ImportResult result={result} /> : null}
    </>
  );
}

function ImportResult({ result }: { result: CsvImportSummary }) {
  return (
    <section className="import-result" aria-labelledby="import-result-title">
      <div className="section-header"><div><h2 id="import-result-title">导入完成</h2><p>清洗与 MockAnalyzer 分析已完成</p></div><Link className="primary-button" to="/library">查看素材库 <ArrowRight size={15} /></Link></div>
      <div className="validation-summary five-columns">
        <div><strong>{result.totalRows}</strong><span>总行数</span></div>
        <div><strong>{result.importedCount}</strong><span>成功导入</span></div>
        <div><strong>{result.failedCount}</strong><span>失败</span></div>
        <div><strong>{result.duplicateCount}</strong><span>重复</span></div>
        <div><strong>{result.totalRows}</strong><span>已检查</span></div>
      </div>
      {result.errors.length > 0 ? <div className="panel import-errors"><strong>未导入的行</strong>{result.errors.map((error) => <p key={`${error.row}-${error.message}`}><span>第 {error.row} 行</span>{error.message}</p>)}</div> : <div className="action-notice is-success" role="status"><CheckCircle2 size={16} /><span>没有发现无法处理的行。</span></div>}
    </section>
  );
}
