import { AlertCircle, ArrowLeft, ArrowRight, Check, FileSpreadsheet, Info, ShieldCheck, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BlockedNotice, ErrorState, LoadingState, StatusPill } from '../components/States';
import { usePreviewMode } from '../components/AppShell';

const previewRows = [
  { text: '我开始喜欢那些不急着解释自己的时刻。', result: '可导入' },
  { text: '夜深以后，安静比答案更接近内心。', result: '可导入' },
  { text: '真正的告别，有时只是停止反复确认。', result: '疑似重复' },
  { text: '愿我们都能在复杂里保留一点诚实。', result: '可导入' },
  { text: '联系我领取资料，添加社交账号。', result: '广告 / 隐私' },
];

const longText = '我曾经以为只有得到清楚的回答，才能把一段经历妥善放下。后来才明白，有些关系没有结论，有些离开也不会附带解释。真正让人恢复平静的，不是终于猜中了别人的想法，而是慢慢承认自己已经尽力，然后把注意力重新还给眼前的生活。';

const steps = ['选择文件', '来源与授权', '数据预览', '确认导入'];

export default function ImportPage() {
  const { mode, setMode } = usePreviewMode();
  const [step, setStep] = useState(1);
  const [fileSelected, setFileSelected] = useState(false);
  const [license, setLicense] = useState<'original' | 'licensed' | 'reference_only' | 'prohibited'>('original');
  const rows = useMemo(() => mode === 'long' ? [{ text: longText, result: '文案较长' }, ...previewRows.slice(0, 4)] : previewRows, [mode]);
  const blocked = mode === 'blocked' || license === 'prohibited';

  if (mode === 'loading') return <LoadingState rows={4} />;
  if (mode === 'error') return <ErrorState message="文件预检服务暂时不可用。没有内容被写入，请稍后重新选择文件。" onRetry={() => setMode('normal')} />;

  return (
    <>
      <div className="page-intro compact-intro">
        <div className="page-intro-copy"><p className="kicker">SOURCE FIRST</p><h2>先把来源说清楚，再开始整理内容。</h2><p>原型只演示导入体验，不会读取本地文件。正式版本中 CSV 只强制要求 <code>text</code> 字段。</p></div>
      </div>

      <ol className="stepper" aria-label="导入步骤">
        {steps.map((label, index) => <li key={label} className={step > index ? 'is-active' : ''}><span>{step > index + 1 ? <Check size={12} /> : index + 1}</span><strong>{label}</strong></li>)}
      </ol>

      <div className="import-layout">
        <section className="panel import-main">
          {step === 1 ? (
            <div className="upload-stage">
              <button className="upload-zone" onClick={() => { setFileSelected(true); setStep(2); }}>
                <UploadCloud size={30} strokeWidth={1.4} />
                <strong>{fileSelected ? '安全模拟文件已选择' : mode === 'empty' ? '还没有选择文件' : '将 CSV 放到这里'}</strong>
                <span>{fileSelected ? '可以继续填写来源与授权' : '或点击使用一份安全的模拟文件'}</span>
                <small>单文件 · 最多 10 MB · 必须包含 text 列</small>
              </button>
              <div className="format-example"><div><FileSpreadsheet size={20} /><strong>CSV 最小格式</strong></div><code>text<br />“一条由你拥有权利的原创文案”</code></div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="source-form">
              <div className="section-header"><div><h2>来源与授权</h2><p>本次导入的全部内容默认使用同一组信息</p></div><StatusPill>步骤 02</StatusPill></div>
              <div className="form-grid">
                <label><span>来源类型</span><select defaultValue="self"><option value="self">个人原创资料</option><option value="partner">合作方授权资料</option><option value="research">研究参考资料</option></select></label>
                <label><span>来源地址 <small>可选</small></span><input placeholder="https://example.com/source" /></label>
              </div>
              <fieldset className="license-fieldset"><legend>授权状态</legend><div className="license-grid">
                {[
                  ['original', '本人原创', '由你独立创作，可以进入审核与导出。'],
                  ['licensed', '明确许可', '已获得加工和商业使用许可。'],
                  ['reference_only', '仅供参考', '只进入研究区，不能生成或导出。'],
                  ['prohibited', '禁止使用', '仅记录拦截结果，不进入内容流程。'],
                ].map(([value, title, description]) => <label key={value} className={license === value ? 'license-card is-selected' : 'license-card'}><input type="radio" name="license" value={value} checked={license === value} onChange={() => setLicense(value as typeof license)} /><span><strong>{title}</strong><small>{description}</small></span></label>)}
              </div></fieldset>
              {license === 'reference_only' ? <BlockedNotice title="仅供研究" description="这批内容可以用于人工查看和主题研究，但不会进入 AI 生成、视频制作或导出。" /> : null}
              {blocked ? <BlockedNotice description="禁止使用的内容不会进入审核、生成或导出流程。请确认授权状态是否选择正确。" /> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="preview-stage">
              <div className="section-header"><div><h2>预检结果</h2><p>模拟检查字段、重复、广告和隐私风险</p></div><StatusPill tone="good">5 行已读取</StatusPill></div>
              <div className="validation-summary"><div><strong>3</strong><span>可导入</span></div><div><strong>1</strong><span>疑似重复</span></div><div><strong>1</strong><span>需要隔离</span></div></div>
              <div className="preview-table" role="table" aria-label="CSV 数据预览">
                <div className="preview-row preview-head" role="row"><span role="columnheader">#</span><span role="columnheader">text</span><span role="columnheader">预检结果</span></div>
                {rows.map((row, index) => <div className="preview-row" role="row" key={`${row.text}-${index}`}><span role="cell">{index + 1}</span><p role="cell" className={row.text.length > 80 ? 'is-long' : ''}>{row.text}</p><span role="cell"><StatusPill tone={row.result === '可导入' ? 'good' : row.result.includes('隐私') ? 'danger' : 'warning'}>{row.result}</StatusPill></span></div>)}
              </div>
              <div className="inline-note"><Info size={15} /><span>被隔离的行不会发送给 AI；原型不会真正保存这些模拟内容。</span></div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="confirm-stage">
              <div className="confirmation-mark"><ShieldCheck size={34} /></div><p className="kicker">READY TO IMPORT</p><h2>{blocked ? '当前授权状态禁止导入' : '3 条内容已经准备好'}</h2><p>{blocked ? '返回上一步选择可用的授权状态，或结束本次导入。' : '导入后，它们会先进入自动过滤，再出现在审核收件箱。所有生成结果仍需人工确认。'}</p>
              <dl><div><dt>来源</dt><dd>个人原创资料</dd></div><div><dt>授权</dt><dd>{license}</dd></div><div><dt>有效内容</dt><dd>{blocked ? '0 条' : '3 条'}</dd></div></dl>
            </div>
          ) : null}

          <footer className="import-footer">
            <button className="quiet-button" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}><ArrowLeft size={14} />上一步</button>
            {step < 4 ? <button className="primary-button" disabled={step === 1 && !fileSelected} onClick={() => setStep((value) => Math.min(4, value + 1))}>继续 <ArrowRight size={14} /></button> : <button className="primary-button" disabled={blocked} onClick={() => { setStep(1); setFileSelected(false); }}>模拟确认导入</button>}
          </footer>
        </section>

        <aside className="import-aside">
          <div className="panel guide-card"><span>01 / 必须知道</span><h3>公开可见，不代表可以使用。</h3><p>只有本人原创或明确获得许可的内容，才可以进入生成与导出流程。</p></div>
          <div className="panel guide-list"><h3>系统会自动检查</h3><ul><li><Check size={13} />完全重复和近似重复</li><li><Check size={13} />生日祝福和追星内容</li><li><Check size={13} />广告、联系方式与隐私</li><li><Check size={13} />疑似歌词或版权文本</li></ul></div>
          <div className="inline-warning"><AlertCircle size={15} /><span>本轮是前端原型，按钮不会解析或上传真实文件。</span></div>
        </aside>
      </div>
    </>
  );
}
