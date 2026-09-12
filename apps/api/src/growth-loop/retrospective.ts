import { RetrospectiveAnalysisSchema, type RetrospectiveInput } from "@emotion-studio/contracts";

/** 归一化：去掉空白与标点，只用于判断一条 fact 是否真的出自用户原始输入。 */
const normalize = (value: string) => value.replace(/[\s，。、；：！？…～,.!?;:"'“”‘’「」『』（）()\[\]【】\-—_/\\|]/g, "");

const RAW_FIELDS = ["whatHappened", "myReaction", "whatBotheredMe", "whatCouldBeHandledBetter", "lessonLearned", "nextAction", "optionalNote"] as const;

/** 从用户原始记录里逐字截取事实，不添加任何推断、标签或改写。 */
export function rawFacts(input: RetrospectiveInput) {
  return RAW_FIELDS.map(key => input[key].trim()).filter(value => value.length > 0).map(value => value.slice(0, 300));
}

/**
 * Fact 只能来自用户原始输入。
 * 任何无法在原始记录中逐字追溯到的条目一律剔除，避免模型推断被写回成事实。
 */
export function traceableFacts(input: RetrospectiveInput, facts: readonly string[]) {
  const raw = normalize(RAW_FIELDS.map(key => input[key]).join("\n"));
  return facts.map(fact => fact.trim()).filter(fact => fact.length > 0 && raw.includes(normalize(fact)));
}

/** 旧表单把一次经历拆成多个分栏；新版复盘只有一个主输入框，正文自己承载全部信息。 */
const LEGACY_FIELDS = ["myReaction", "whatBotheredMe", "whatCouldBeHandledBetter", "lessonLearned", "nextAction"] as const;

/** 具体信号：有没有讲清「哪里出问题 / 我当时怎么做 / 现在怎么看」。 */
const CONFLICT_SIGNAL = /没有|问题|返工|冲突|失败|做错|麻烦|误会|临时|被打断|焦虑|犹豫|担心|浪费/;
const REACTION_SIGNAL = /当时|我的反应|我直接|我选择|我先|我本来|于是|结果我/;
const REFLECTION_SIGNAL = /回头看|回过头|下次|以后|学到|应该|其实|如果|重来|更好|总结/;
/** 抽「经验」句时优先于「回头看」句：先找明确写着学到 / 下次怎么做的句子。 */
const LESSON_SIGNAL = /学到|下次|以后|重来|总结|更好的做法|应该/;

/**
 * 单主输入框形态下，从正文本身提取「够不够具体」的信号（上限 5，与旧表单分栏数对齐）。
 * 纯规则、可重复：同样的输入永远得到同样的分数。
 */
export function detailSignals(text: string) {
  const value = text.trim();
  let signals = 0;
  if (value.length >= 60) signals += 1;
  if (value.length >= 140) signals += 1;
  if (CONFLICT_SIGNAL.test(value)) signals += 1;
  if (REACTION_SIGNAL.test(value)) signals += 1;
  if (REFLECTION_SIGNAL.test(value)) signals += 1;
  return Math.min(5, signals);
}

/**
 * 单主输入框形态下，从正文里挑出承载某个信号的「那一句」。
 * 只做逐句挑选，不改写、不新增任何内容 —— 与 facts 的可追溯原则一致。
 */
export function pickSentence(text: string, pattern: RegExp) {
  return text.split(/[。！？；\n]+/).map(value => value.trim()).find(value => value.length > 0 && pattern.test(value)) ?? "";
}

/**
 * 分析端与生成端共用：旧分栏有值就用分栏，否则从正文里逐句挑。
 * 生成稿若只用原始分栏，会在正文里写出「我当时的处理：尚未补充」——而用户其实已经写在正文里了。
 */
export function derivedRetrospectiveFields(input: RetrospectiveInput) {
  return {
    problem: input.whatBotheredMe.trim() || pickSentence(input.whatHappened, CONFLICT_SIGNAL),
    reaction: input.myReaction.trim() || pickSentence(input.whatHappened, REACTION_SIGNAL),
    lesson: input.lessonLearned.trim() || pickSentence(input.whatHappened, LESSON_SIGNAL),
  };
}

/** Offline heuristic, never a claim that these are verified psychological conclusions. */
export function analyzeRetrospective(input: RetrospectiveInput) {
  // 旧记录：分栏填得越多越具体；新记录：只有正文，就看正文里有多少具体信号。
  // 两者都不填时退化为 1 分，不会把「吃饭」这类空记录推成内容机会。
  const legacyFields = LEGACY_FIELDS.filter((key) => input[key].trim()).length;
  const detail = legacyFields > 0 ? legacyFields : detailSignals(input.whatHappened);
  const score = Math.min(10, (input.whatHappened.length >= 20 ? 3 : 1) + detail);
  const account = score < 6 ? "none" : /英语|英文|口语/.test(input.whatHappened) ? "english" : /失恋|思念|情感/.test(input.whatHappened) ? "emotion" : "growth";
  // 新版表单没有分栏，困扰 / 当时反应 / 经验要从正文里逐句挑出来；
  // 否则分析面板会对着一段写满冲突的记录说「记录里还缺少明确的冲突」，演示时自相矛盾。
  const derived = derivedRetrospectiveFields(input);
  const problem = derived.problem || "记录里还缺少明确的冲突或困扰";
  const reaction = derived.reaction;
  const lesson = derived.lesson || "先区分已经发生的事与尚未验证的判断";
  const facts = rawFacts(input);
  const interpretations = [
    `行为模式（推断）：${reaction ? `面对「${problem.slice(0, 60)}」时，记录里写的第一反应是「${reaction.slice(0, 60)}」` : "记录里缺少当时的反应，暂不推断行为模式"}`,
    `改法空间（推断）：${(input.whatCouldBeHandledBetter || "当时还存在其他可选行动，需要在下一个相似场景里验证").slice(0, 280)}`,
    `经验迁移（推断）：${lesson.slice(0, 280)}`,
    `内容价值（推断）：${score >= 6 ? "事件、困扰与处理建议较具体，适合分享；分数是离线规则评估，不预测流量" : "目前更像事件记录，建议先补充一个冲突或变化"}`,
  ].map(value => value.slice(0, 600));
  return RetrospectiveAnalysisSchema.parse({
    summary: input.whatHappened.slice(0, 180), coreProblem: problem.slice(0, 300),
    decisionPattern: reaction ? "可供核对的行为线索：" + reaction.slice(0, 160) : "尚未提供当时的反应，暂不推断行为模式",
    betterApproach: (input.whatCouldBeHandledBetter || "补充当时有哪些可选行动，再比较各自的代价").slice(0, 300),
    lesson: lesson.slice(0, 300), nextAction: (input.nextAction || "记录下一次出现相似情境时可以先做的一个具体动作").slice(0, 300),
    contentPotential: score,
    contentReason: score >= 6 ? "事件、困扰与处理建议足够具体，可尝试分享；分数是离线规则评估，不预测流量" : "目前更像事件记录，补充一个冲突、判断或变化后再生产",
    recommendedAccount: account, recommendedContentType: (input.whatCouldBeHandledBetter.trim() || derived.lesson) ? "solution" : "reflection",
    contentAngle: ("从一个真实场景解释：" + problem).slice(0, 300),
    recommendedTitleIdeas: ["这件事，下次我会换个处理方式", "一次真实经历留下的提醒", lesson.slice(0, 35)],
    facts, interpretations,
  });
}
