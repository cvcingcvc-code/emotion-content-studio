import type { StudioAnalysis } from '@emotion-studio/contracts';
import { relationshipLabels } from '../lib/accounts';

export function AnalysisDetails({ analysis }: { analysis: StudioAnalysis }) {
  if (analysis.kind === 'growth.v1') return <div className="analysis-details">
    <h3>事实锚点</h3>
    {analysis.truthAnchors.map((anchor) => <blockquote key={anchor.id}><small>{anchor.id} · {anchor.kind}</small><p>{anchor.quote}</p></blockquote>)}
    <dl>{[
      ['核心事件', analysis.coreEvent?.text ?? '信息不足'], ['核心矛盾', analysis.coreConflict.text],
      ['情绪', analysis.emotions.map((item) => `${item.label} ${item.intensity}`).join('、')],
      ['根本问题', analysis.rootProblem.text], ['受众痛点', analysis.audiencePain.join('；')],
      ['普适共鸣', analysis.universalResonance], ['转折', analysis.turningPoint?.text ?? '尚未提供'],
      ['真实处理方式', analysis.solution?.text ?? '尚未提供'], ['行动建议', analysis.actionableAdvice.join('；')],
      ['标题角度', analysis.titleAngles.join('；')], ['风险提醒', analysis.riskFlags.join('；') || '仍需人工核对'],
      ['缺少信息', analysis.missingInformation.join('；') || '无额外提示'],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </div>;
  return <div className="analysis-details"><dl>{[
    ['主要情绪', `${analysis.primaryEmotion} · ${analysis.emotionIntensity}`], ['次要情绪', analysis.secondaryEmotion ?? '无'],
    ['场景', analysis.scene], ['关系', relationshipLabels[analysis.relationshipType]], ['痛点', analysis.painPoint],
    ['心理冲突', analysis.psychologicalConflict], ['共鸣原因', analysis.resonanceReason],
    ['可复用主题', analysis.reusableTheme], ['创作角度', analysis.recommendedContentAngles.join('；')],
    ['关键词', analysis.keywords.join('、')], ['原创风险', `${analysis.originalityRisk.level} · ${analysis.originalityRisk.reasons.join('；')}`],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}
