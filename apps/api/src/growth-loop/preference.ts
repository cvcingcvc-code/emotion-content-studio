import { type Confidence, type PreferenceSignal, type PublishedContent, type RejectReason, type StrategyEntry } from "@emotion-studio/contracts";

type LoopWriting = NonNullable<PublishedContent["writing"]>;

const DRAMA = ["震惊", "必看", "全网", "绝对", "100%", "必须点开", "不看后悔", "炸裂", "逆天", "颠覆"];
const INTENSE = ["崩溃", "绝望", "痛苦", "折磨", "毁灭", "太惨", "废了", "完蛋"];
const PREACHY = ["你要相信", "请记住", "一定要", "人生就是", "永远不要", "每个人都会"];
const PERSPECTIVE = ["我觉得", "我认为", "我自己的判断", "对我来说", "我当时"];

const normalize = (value: string) => value.replace(/\s+/g, "");
const sentences = (value: string) => value.split(/[。！？!?\n]/).map(x => x.trim()).filter(x => x.length >= 2);
const hits = (text: string, lexicon: string[]) => lexicon.filter(word => text.includes(word));

/**
 * 对比 AI 草稿与人工修改稿，产出最小可用的偏好信号。
 * 这里不做语义理解，只做"人真的改了什么"的可核对记录。
 */
export function detectPreferenceSignal(draft: LoopWriting | null, edited: LoopWriting): PreferenceSignal {
  const base = draft ?? edited;
  const before = `${base.title}\n${base.body}\n${base.solution}`;
  const after = `${edited.title}\n${edited.body}\n${edited.solution}`;
  const beforeSentences = sentences(before), afterSentences = sentences(after);
  const removedSentences = beforeSentences.filter(text => !afterSentences.some(other => normalize(other) === normalize(text)));
  const addedSentences = afterSentences.filter(text => !beforeSentences.some(other => normalize(other) === normalize(text)));
  const removedDramaWords = hits(before, DRAMA).filter(word => !after.includes(word));
  const removedIntense = [...hits(before, INTENSE), ...hits(before, PREACHY)].filter(word => !after.includes(word));
  const addedPerspective = PERSPECTIVE.filter(word => after.includes(word) && !before.includes(word));
  const compact = (values: string[]) => values.map(x => x.slice(0, 60)).slice(0, 20);
  const titleRewritten = normalize(base.title) !== normalize(edited.title);
  const lowerIntensity = removedIntense.length > 0 || (before.match(/[！!]/g)?.length ?? 0) > (after.match(/[！!]/g)?.length ?? 0);
  const removedDrama = removedDramaWords.length > 0;
  const perspectiveShift = addedPerspective.length > 0;
  const parts = [
    titleRewritten ? "重写了标题" : "", removedDrama ? `删除了夸张表达（${removedDramaWords.slice(0, 5).join("、")}）` : "",
    lowerIntensity ? "降低了情绪强度" : "", perspectiveShift ? "调整为第一人称视角" : "",
    removedSentences.length ? `删掉 ${removedSentences.length} 句原稿` : "", addedSentences.length ? `补写 ${addedSentences.length} 句` : "",
  ].filter(Boolean);
  const summary = (parts.length ? `人工修改信号：${parts.join("；")}。` : "人工修改信号：本次未检测到明确改写。").slice(0, 400);
  return {
    titleRewritten, removedPhrases: compact(removedSentences), addedPhrases: compact(addedSentences),
    lowerIntensity, removedDrama, perspectiveShift, summary,
  };
}

/** 把偏好信号映射成策略提案。一次修改只算弱信号。 */
export function preferenceProposals(signal: PreferenceSignal) {
  const proposals: Array<{ key: string; value: string }> = [];
  if (signal.removedDrama) proposals.push({ key: "avoid_drama", value: "避免夸张表达与感叹号堆叠" });
  if (signal.titleRewritten) proposals.push({ key: "title_preference", value: "标题更接近自己会写的说法" });
  if (signal.lowerIntensity) proposals.push({ key: "tone_intensity", value: "降低情绪强度" });
  if (signal.perspectiveShift) proposals.push({ key: "perspective", value: "使用第一人称视角叙述" });
  return proposals;
}

export interface RejectStrategyProposal {
  key: string;
  value: string;
  category: StrategyEntry["category"];
  confidence: Confidence;
}

/**
 * 拒绝理由 → 策略提案。
 * `factually_wrong` 属于必须阻断的强负面信号（avoid + HIGH）；其余按证据强度给 MEDIUM，`other` 只给 LOW。
 */
export function rejectStrategyProposal(reason: RejectReason): RejectStrategyProposal {
  const table: Record<RejectReason, RejectStrategyProposal> = {
    not_me: { key: "voice_fit", value: "更贴近本人真实语气，避免模板腔", category: "avoid", confidence: "MEDIUM" },
    too_dramatic: { key: "avoid_drama", value: "避免夸张表达与感叹号堆叠", category: "avoid", confidence: "MEDIUM" },
    too_preachy: { key: "avoid_preachy", value: "少说教，用第一人称讲自己的经历", category: "avoid", confidence: "MEDIUM" },
    factually_wrong: { key: "facts_only", value: "只写可逐字追溯的真实事实，禁止补造细节", category: "avoid", confidence: "HIGH" },
    bad_title: { key: "title_preference", value: "标题更接近自己会写的说法", category: "avoid", confidence: "MEDIUM" },
    no_value: { key: "value_density", value: "每篇必须给出一个可执行的收获", category: "avoid", confidence: "MEDIUM" },
    private_topic: { key: "topic_boundary", value: "不写涉及隐私或他人的话题", category: "avoid", confidence: "MEDIUM" },
    other: { key: "manual_reject", value: "人工否决过，需人工确认后再采用", category: "avoid", confidence: "LOW" },
  };
  return table[reason];
}
