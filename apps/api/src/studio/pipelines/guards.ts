import {
  GrowthAnalysisSchema,
  GrowthPostPackageSchema,
  OriginalityRiskSchema,
  TruthAnchorSchema,
  type GrowthAnalysis,
  type GrowthPostPackage,
  type OriginalityRisk,
  type TruthAnchor,
  type TruthAnchorKind,
} from "@emotion-studio/contracts";
import type { GrowthAnalyzeInput } from "./types.js";

export class PipelineGuardError extends Error {
  constructor(
    readonly code:
      | "EMPTY_PIPELINE_INPUT"
      | "INPUT_TOO_LONG"
      | "UNSUPPORTED_MOCK_TOPIC"
      | "TRUTH_ANCHOR_MISMATCH"
      | "UNSUPPORTED_FACT_CLAIM",
    message: string,
  ) {
    super(message);
    this.name = "PipelineGuardError";
  }
}

const MAX_ANCHORS = 12;
const MAX_ANCHOR_LENGTH = 500;

function splitLongSegment(segment: string): string[] {
  const characters = Array.from(segment);
  const chunks: string[] = [];
  for (let offset = 0; offset < characters.length; offset += MAX_ANCHOR_LENGTH) {
    chunks.push(characters.slice(offset, offset + MAX_ANCHOR_LENGTH).join(""));
  }
  return chunks;
}

function classifyAnchor(quote: string): TruthAnchorKind {
  if (/[“”「」『』"']/.test(quote)) return "dialogue";
  if (/(?:[¥￥$]\s*)?\d+(?:[.,]\d+)?(?:元|块|万|千|万元)/u.test(quote)) return "amount";
  if (/\d{1,4}(?:年|月|日|号|点|时|分钟|小时)|昨天|今天|明天|上周|下周|去年|今年/u.test(quote)) {
    return "time";
  }
  if (/结果|最终|后来|终于|拿到|通过|失败|成功/u.test(quote)) return "result";
  if (/焦虑|害怕|难过|开心|遗憾|委屈|愤怒|孤独|紧张|不安/u.test(quote)) return "emotion";
  if (/妈妈|爸爸|父母|家人|朋友|同事|老板|面试官|老师|同学|他|她/u.test(quote)) {
    return "person";
  }
  if (/决定|选择|开始|停止|拒绝|接受|尝试|完成|离开|留下|行动/u.test(quote)) return "action";
  return "event";
}

export function createTruthAnchors(content: string): TruthAnchor[] {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new PipelineGuardError("EMPTY_PIPELINE_INPUT", "成长复盘内容不能为空");
  }

  const segments = trimmed.match(/[^\n。！？!?；;]+(?:[。！？!?；;]+|$)/gu) ?? [trimmed];
  const quotes = segments
    .flatMap((segment) => splitLongSegment(segment.trim()))
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (quotes.length > MAX_ANCHORS) {
    throw new PipelineGuardError("INPUT_TOO_LONG", "原文已保存；请将经历拆成不超过十二个事实片段再分析");
  }

  return quotes.map((quote, index) => TruthAnchorSchema.parse({
    id: `anchor-${index + 1}`,
    kind: classifyAnchor(quote),
    quote,
  }));
}

function sameAnchor(left: TruthAnchor, right: TruthAnchor): boolean {
  return left.id === right.id && left.kind === right.kind && left.quote === right.quote;
}

export function validateGrowthAnalysis(
  input: GrowthAnalyzeInput,
  result: unknown,
): GrowthAnalysis {
  const parsed = GrowthAnalysisSchema.parse(result);
  const expectedAnchors = input.truthAnchors.map((anchor) => TruthAnchorSchema.parse(anchor));

  if (
    parsed.truthAnchors.length !== expectedAnchors.length ||
    parsed.truthAnchors.some((anchor, index) => !sameAnchor(anchor, expectedAnchors[index]!)) ||
    expectedAnchors.some((anchor) => !input.content.includes(anchor.quote))
  ) {
    throw new PipelineGuardError(
      "TRUTH_ANCHOR_MISMATCH",
      "成长分析修改或引用了用户原文之外的事实锚点",
    );
  }

  // Events, a reported turning point and an action already taken are facts;
  // inferred conflicts and future advice are kept in separate fields.
  const factualFields = [parsed.coreEvent, parsed.turningPoint, parsed.solution];
  if (factualFields.some((field) => field !== null && !referencedQuoteContainsClaim(
    field.text, field.anchorIds, parsed.truthAnchors,
  ))) {
    throw new PipelineGuardError("UNSUPPORTED_FACT_CLAIM", "成长分析包含原文未提供的事件、转折或处理方式");
  }

  return parsed;
}

function normalizeComparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]/gu, "");
}

function referencedQuoteContainsClaim(
  claim: string,
  anchorIds: readonly string[],
  anchors: readonly TruthAnchor[],
): boolean {
  const normalizedClaim = normalizeComparable(claim);
  return anchorIds.some((id) => {
    const quote = anchors.find((anchor) => anchor.id === id)?.quote;
    return quote ? normalizeComparable(quote).includes(normalizedClaim) : false;
  });
}

/** A conservative factual-claim check, not a semantic truth detector. Human review remains required. */
export function findGrowthGroundingIssues(analysis: GrowthAnalysis, body: string): string[] {
  const anchors = GrowthAnalysisSchema.parse(analysis).truthAnchors;
  const source = normalizeComparable(anchors.map((anchor) => anchor.quote).join("\n"));
  const issues = new Set<string>();
  // Remove verbatim facts before inspecting new prose. This also permits exact user dialogue.
  let ungrounded = body;
  for (const anchor of [...anchors].sort((left, right) => right.quote.length - left.quote.length)) {
    ungrounded = ungrounded.split(anchor.quote).join(" ");
  }
  const sentences = ungrounded.split(/[。！？!?；;\n]+/u).map((value) => value.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const comparable = normalizeComparable(sentence);
    if (source.includes(comparable)) continue;
    const advice = /^(?:接下来|下一步|建议|可以|不妨|试着|如果|例如|假设|普通人|我们可以|你可以)/u.test(sentence);
    if (!advice && /我(?!们)/u.test(sentence)) {
      issues.add("新增第一人称陈述需要逐句由原始事实支持");
    }
    const checks: readonly [RegExp, string][] = [
      [/[“「『]([^”」』]+)[”」』]|"([^"\n]+)"/gu, "新增对话或引语缺少事实锚点"],
      [/(?:[¥￥$]\s*)?\d+(?:[.,]\d+)?(?:元|块|万|千|万元)|[一二三四五六七八九十百千万]+(?:元|块钱|万元)/gu, "新增金额缺少事实锚点"],
      [/\d{1,4}(?:年|月|日|号|点|时|分钟|小时)|昨天|前天|上周|上个月|去年|昨晚/gu, "新增时间缺少事实锚点"],
      [/妈妈|爸爸|父母|家人|朋友|同事|老板|面试官|老师|同学|丈夫|妻子|男友|女友|儿子|女儿|客户|经理/gu, "新增人物缺少事实锚点"],
      [/拿到(?:了)?(?:offer|录用|奖金)|成功(?:了|入职|升职)|升职|涨薪|录用了|赚到|赢得|考上|治好了/giu, "新增结果缺少事实锚点"],
    ];
    if (advice) continue;
    for (const [pattern, message] of checks) {
      for (const match of sentence.matchAll(pattern)) {
        if (!source.includes(normalizeComparable(match[0]))) issues.add(message);
      }
    }
  }
  return [...issues];
}

export function validateGrowthPost(
  analysis: GrowthAnalysis,
  result: unknown,
): GrowthPostPackage {
  const parsedAnalysis = GrowthAnalysisSchema.parse(analysis);
  const parsed = GrowthPostPackageSchema.parse(result);
  const anchorIds = new Set(parsedAnalysis.truthAnchors.map((anchor) => anchor.id));

  const unknownId = [
    ...parsed.usedTruthAnchorIds,
    ...parsed.factClaims.flatMap((claim) => claim.truthAnchorIds),
  ].find((id) => !anchorIds.has(id));
  if (unknownId) {
    throw new PipelineGuardError(
      "TRUTH_ANCHOR_MISMATCH",
      "成长文案引用了不存在的事实锚点",
    );
  }

  const unsupportedClaim = parsed.factClaims.find(
    (claim) => !referencedQuoteContainsClaim(
      claim.claim,
      claim.truthAnchorIds,
      parsedAnalysis.truthAnchors,
    ),
  );
  if (unsupportedClaim) {
    throw new PipelineGuardError(
      "UNSUPPORTED_FACT_CLAIM",
      "成长文案包含无法由用户原文精确支持的第一人称事实",
    );
  }

  if (findGrowthGroundingIssues(parsedAnalysis, [parsed.recommendedTitle, parsed.body].join("\n")).length > 0) {
    throw new PipelineGuardError("UNSUPPORTED_FACT_CLAIM", "成长文案包含未经事实锚点支持的陈述");
  }

  return parsed;
}

function ngrams(value: string, size: number): Set<string> {
  const characters = Array.from(value);
  const result = new Set<string>();
  if (characters.length < size) {
    if (characters.length > 0) result.add(characters.join(""));
    return result;
  }
  for (let index = 0; index <= characters.length - size; index += 1) {
    result.add(characters.slice(index, index + size).join(""));
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((value) => {
    if (right.has(value)) intersection += 1;
  });
  return intersection / (left.size + right.size - intersection);
}

interface SuffixState { length: number; link: number; transitions: Map<string, number> }

// A suffix automaton scans complete input in linear time and space, including
// material beyond the old 2,500-character window.
function buildSubstringMatcher(value: string): (other: string) => number {
  const states: SuffixState[] = [{ length: 0, link: -1, transitions: new Map() }];
  let last = 0;
  for (const character of value) {
    const current = states.length;
    states.push({ length: states[last]!.length + 1, link: 0, transitions: new Map() });
    let previous = last;
    while (previous >= 0 && !states[previous]!.transitions.has(character)) {
      states[previous]!.transitions.set(character, current);
      previous = states[previous]!.link;
    }
    if (previous >= 0) {
      const next = states[previous]!.transitions.get(character)!;
      if (states[previous]!.length + 1 === states[next]!.length) {
        states[current]!.link = next;
      } else {
        const clone = states.length;
        states.push({ length: states[previous]!.length + 1, link: states[next]!.link,
          transitions: new Map(states[next]!.transitions) });
        while (previous >= 0 && states[previous]!.transitions.get(character) === next) {
          states[previous]!.transitions.set(character, clone);
          previous = states[previous]!.link;
        }
        states[next]!.link = clone;
        states[current]!.link = clone;
      }
    }
    last = current;
  }
  return (other) => {
    let current = 0;
    let length = 0;
    let longest = 0;
    for (const character of other) {
      while (current !== 0 && !states[current]!.transitions.has(character)) {
        current = states[current]!.link;
        length = states[current]!.length;
      }
      const next = states[current]!.transitions.get(character);
      if (next === undefined) { current = 0; length = 0; }
      else { current = next; length += 1; longest = Math.max(longest, length); }
    }
    return longest;
  };
}

export function assessSimilarity(body: string, sources: readonly string[]): OriginalityRisk {
  const normalizedBody = normalizeComparable(body);
  if (!normalizedBody) {
    return OriginalityRiskSchema.parse({
      level: "high",
      similarityScore: 100,
      reasons: ["生成文本为空，无法完成原创性检查"],
      requiresHumanReview: true,
    });
  }

  const usableSources = sources
    .map((source) => normalizeComparable(source))
    .filter(Boolean);
  if (usableSources.length === 0) {
    return OriginalityRiskSchema.parse({
      level: "low",
      similarityScore: 0,
      reasons: ["未提供可比较的源文本，发布前仍需人工复核"],
      requiresHumanReview: true,
    });
  }

  const bodyNgrams = ngrams(normalizedBody, 4);
  const longestCommonSubstringLength = buildSubstringMatcher(normalizedBody);
  let highestScore = 0;
  let longestSpan = 0;
  usableSources.forEach((source) => {
    const overlapScore = Math.round(jaccard(bodyNgrams, ngrams(source, 4)) * 100);
    const sharedSpan = longestCommonSubstringLength(source);
    const spanScore = Math.round((sharedSpan / Math.min(normalizedBody.length, source.length)) * 100);
    highestScore = Math.max(highestScore, overlapScore, spanScore);
    longestSpan = Math.max(longestSpan, sharedSpan);
  });

  const level = longestSpan >= 20 || highestScore >= 45
    ? "high"
    : longestSpan >= 10 || highestScore >= 20
      ? "medium"
      : "low";
  const reason = level === "high"
    ? `与参考素材存在较长连续重合片段（最长 ${longestSpan} 字）`
    : level === "medium"
      ? `与参考素材存在局部表达重合（最长 ${longestSpan} 字）`
      : "未发现明显的连续文本重合，但仍需人工复核";

  return OriginalityRiskSchema.parse({
    level,
    similarityScore: Math.min(100, highestScore),
    reasons: [reason],
    requiresHumanReview: true,
  });
}
