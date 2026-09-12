import { randomUUID } from "node:crypto";
import { StrategyEntrySchema, type Confidence, type ContentAccount, type GrowthLoopState, type StrategyEntry } from "@emotion-studio/contracts";

const CONFIDENCE_ORDER: Confidence[] = ["LOW", "MEDIUM", "HIGH"];

/** 证据不足时只能 WATCH/LOW，不能直接升级成长期策略。 */
export function raiseConfidence(current: Confidence, next?: Confidence): Confidence {
  if (!next) return current;
  return CONFIDENCE_ORDER.indexOf(next) > CONFIDENCE_ORDER.indexOf(current) ? next : current;
}

export function activeStrategies(state: GrowthLoopState, account: ContentAccount) {
  return state.strategies.filter(x => x.status === "active" && x.account === account);
}

/** 同一个 (account, key) 只允许一个 active value。 */
export function resolveActiveStrategy(state: GrowthLoopState, account: ContentAccount, key: string) {
  return state.strategies.find(x => x.status === "active" && x.account === account && x.key === key);
}

export interface StrategyProposal {
  account: ContentAccount;
  key: string;
  value: string;
  category: StrategyEntry["category"];
  source: StrategyEntry["source"];
  confidence?: Confidence;
  at?: string;
}

export interface StrategyApplication {
  strategies: StrategyEntry[];
  entry: StrategyEntry;
  change: "created" | "confirmed" | "superseded";
}

/**
 * 写入一条策略。三种结果：
 * - 首次出现 → created，evidenceCount=1
 * - 同 key 同 value 再次出现 → confirmed，evidenceCount+1，confidence 只升不降
 * - 同 key 不同 value → 旧条目 superseded，新条目 active
 */
export function applyStrategy(state: GrowthLoopState, proposal: StrategyProposal): StrategyApplication {
  const at = proposal.at ?? new Date().toISOString();
  const existing = resolveActiveStrategy(state, proposal.account, proposal.key);
  const others = state.strategies.filter(x => x !== existing);
  if (existing && existing.value === proposal.value) {
    const category = existing.category === "works" && proposal.category === "watch" ? "works" : proposal.category;
    const entry = StrategyEntrySchema.parse({
      ...existing, category, evidenceCount: existing.evidenceCount + 1,
      confidence: raiseConfidence(existing.confidence, proposal.confidence), lastConfirmedAt: at,
    });
    return { strategies: [...others, entry], entry, change: "confirmed" };
  }
  const entry = StrategyEntrySchema.parse({
    id: randomUUID(), account: proposal.account, key: proposal.key, value: proposal.value,
    category: proposal.category, source: proposal.source, evidenceCount: 1,
    confidence: proposal.confidence ?? "LOW", status: "active", lastConfirmedAt: at, createdAt: at,
  });
  return existing
    ? { strategies: [...others, StrategyEntrySchema.parse({ ...existing, status: "superseded" }), entry], entry, change: "superseded" }
    : { strategies: [...others, entry], entry, change: "created" };
}

/** 显式停用一条策略（人工决定不再采用）。 */
export function deactivateStrategy(state: GrowthLoopState, id: string) {
  return state.strategies.map(x => x.id === id ? StrategyEntrySchema.parse({ ...x, status: "inactive" }) : x);
}

export function strategyContext(state: GrowthLoopState, account: ContentAccount) {
  const active = activeStrategies(state, account);
  const pick = (category: StrategyEntry["category"]) => active.filter(x => x.category === category).map(x => x.value);
  return { works: pick("works"), avoid: pick("avoid"), testing: pick("testing"), watch: pick("watch"), unknown: pick("unknown") };
}

/** 组装给 Generator 的策略段落。没有任何 active 策略时返回空串，不编造。 */
export function strategyPrompt(state: GrowthLoopState, account: ContentAccount) {
  const context = strategyContext(state, account);
  const lines: string[] = [];
  if (context.works.length) lines.push(`已验证有效（works）：${context.works.join("；")}`);
  if (context.avoid.length) lines.push(`必须避免（avoid）：${context.avoid.join("；")}`);
  if (context.testing.length) lines.push(`正在测试（testing）：${context.testing.join("；")}`);
  if (context.watch.length) lines.push(`仅有弱信号，不得当作结论（watch）：${context.watch.join("；")}`);
  if (!lines.length) return "";
  return `账号策略（来源：历史实验与人工反馈，优先级高于你的写作偏好）：\n${lines.join("\n")}`;
}
