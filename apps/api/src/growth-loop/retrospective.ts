import { RetrospectiveAnalysisSchema, type RetrospectiveInput } from "@emotion-studio/contracts";

/** Offline heuristic, never a claim that these are verified psychological conclusions. */
export function analyzeRetrospective(input: RetrospectiveInput) {
  const fields = [input.myReaction, input.whatBotheredMe, input.whatCouldBeHandledBetter, input.lessonLearned, input.nextAction];
  const score = Math.min(10, (input.whatHappened.length >= 20 ? 3 : 1) + fields.filter((value) => value.trim()).length);
  const account = score < 6 ? "none" : /英语|英文|口语/.test(input.whatHappened) ? "english" : /失恋|思念|情感/.test(input.whatHappened) ? "emotion" : "growth";
  const problem = input.whatBotheredMe || "记录里还缺少明确的冲突或困扰";
  const lesson = input.lessonLearned || "先区分已经发生的事与尚未验证的判断";
  return RetrospectiveAnalysisSchema.parse({
    summary: input.whatHappened.slice(0, 180), coreProblem: problem.slice(0, 300),
    decisionPattern: input.myReaction ? "可供核对的行为线索：" + input.myReaction.slice(0, 160) : "尚未提供当时的反应，暂不推断行为模式",
    betterApproach: (input.whatCouldBeHandledBetter || "补充当时有哪些可选行动，再比较各自的代价").slice(0, 300),
    lesson: lesson.slice(0, 300), nextAction: (input.nextAction || "记录下一次出现相似情境时可以先做的一个具体动作").slice(0, 300),
    contentPotential: score,
    contentReason: score >= 6 ? "事件、困扰与处理建议足够具体，可尝试分享；分数是离线规则评估，不预测流量" : "目前更像事件记录，补充一个冲突、判断或变化后再生产",
    recommendedAccount: account, recommendedContentType: input.whatCouldBeHandledBetter ? "solution" : "reflection",
    contentAngle: ("从一个真实场景解释：" + problem).slice(0, 300),
    recommendedTitleIdeas: ["这件事，下次我会换个处理方式", "一次真实经历留下的提醒", lesson.slice(0, 35)],
  });
}
