import { describe, expect, it } from "vitest";
import { RetrospectiveInputSchema } from "@emotion-studio/contracts";
import { analyzeRetrospective, rawFacts, traceableFacts } from "./retrospective.js";

const strong = RetrospectiveInputSchema.parse({
  date: "2026-09-10",
  whatHappened: "今天工作中没有确认交付范围，花了一下午反复修改材料。",
  myReaction: "直接开始做", whatBotheredMe: "反复返工",
  whatCouldBeHandledBetter: "先写清交付标准", lessonLearned: "先确认再行动",
  nextAction: "开始前确认三项标准",
});

describe("fact and interpretation separation", () => {
  it("says nothing happened rather than forcing an opportunity", () => {
    const quiet = RetrospectiveInputSchema.parse({ date: "2026-09-10", whatHappened: "今天没发生什么。" });
    const analysis = analyzeRetrospective(quiet);
    expect(analysis.contentPotential).toBeLessThan(6);
    expect(analysis.recommendedAccount).toBe("none");
    expect(analysis.contentReason).toContain("更像事件记录");
  });

  it("keeps facts verbatim from the raw input", () => {
    const analysis = analyzeRetrospective(strong);
    expect(analysis.facts).toContain(strong.whatHappened);
    expect(rawFacts(strong)).toContain(strong.myReaction);
    expect(rawFacts(strong).every(fact => strong.whatHappened.includes(fact) || [strong.myReaction, strong.whatBotheredMe, strong.whatCouldBeHandledBetter, strong.lessonLearned, strong.nextAction].includes(fact))).toBe(true);
  });

  it("drops an interpretation that was written back as a fact", () => {
    const invented = "用户昨天已经向公司提出了辞职";
    const kept = traceableFacts(strong, [strong.whatHappened, invented]);
    expect(kept).toEqual([strong.whatHappened]);
  });

  it("does not add any fact the user never wrote", () => {
    const analysis = analyzeRetrospective(strong);
    const allowed = [strong.whatHappened, strong.myReaction, strong.whatBotheredMe, strong.whatCouldBeHandledBetter, strong.lessonLearned, strong.nextAction, strong.optionalNote];
    expect(analysis.facts.length).toBeGreaterThan(0);
    expect(analysis.facts.every(fact => allowed.includes(fact))).toBe(true);
  });

  it("labels every interpretation as an inference", () => {
    const analysis = analyzeRetrospective(strong);
    expect(analysis.interpretations.length).toBeGreaterThan(0);
    expect(analysis.interpretations.every(value => value.includes("推断"))).toBe(true);
  });
});
