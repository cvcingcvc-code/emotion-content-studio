import { describe, expect, it } from "vitest";
import { GrowthLoopStateSchema } from "@emotion-studio/contracts";
import { activeStrategies, applyStrategy, deactivateStrategy, resolveActiveStrategy, strategyContext, strategyPrompt } from "./strategy.js";

const empty = () => GrowthLoopStateSchema.parse({ retrospectives: [], contents: [], metrics: [], feedback: [], strategies: [] });

describe("account strategy memory", () => {
  it("keeps only one active value per strategy key", () => {
    const first = applyStrategy(empty(), { account: "growth", key: "title_style", value: "真实事件开头", category: "works", source: "experiment" });
    const second = applyStrategy({ ...empty(), strategies: first.strategies }, { account: "growth", key: "title_style", value: "问题型标题", category: "testing", source: "experiment" });
    const active = second.strategies.filter(x => x.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].value).toBe("问题型标题");
    expect(second.change).toBe("superseded");
    expect(second.strategies.find(x => x.value === "真实事件开头")!.status).toBe("superseded");
  });

  it("raises evidence count instead of creating a duplicate when repeated", () => {
    const once = applyStrategy(empty(), { account: "growth", key: "avoid_drama", value: "过度戏剧化", category: "avoid", source: "human_edit" });
    const twice = applyStrategy({ ...empty(), strategies: once.strategies }, { account: "growth", key: "avoid_drama", value: "过度戏剧化", category: "avoid", source: "human_edit" });
    const active = activeStrategies({ ...empty(), strategies: twice.strategies }, "growth");
    expect(active).toHaveLength(1);
    expect(active[0].evidenceCount).toBe(2);
    expect(twice.change).toBe("confirmed");
  });

  it("never lowers confidence when confirming", () => {
    const once = applyStrategy(empty(), { account: "growth", key: "k", value: "v", category: "watch", source: "human_edit", confidence: "MEDIUM" });
    const twice = applyStrategy({ ...empty(), strategies: once.strategies }, { account: "growth", key: "k", value: "v", category: "watch", source: "human_edit", confidence: "LOW" });
    expect(twice.entry.confidence).toBe("MEDIUM");
  });

  it("groups active strategies by the five categories", () => {
    let state = empty();
    state = { ...state, strategies: applyStrategy(state, { account: "growth", key: "a", value: "真实事件开头表现稳定", category: "works", source: "experiment" }).strategies };
    state = { ...state, strategies: applyStrategy(state, { account: "growth", key: "b", value: "过度戏剧化", category: "avoid", source: "human_edit" }).strategies };
    state = { ...state, strategies: applyStrategy(state, { account: "growth", key: "c", value: "问题型标题", category: "testing", source: "experiment" }).strategies };
    const context = strategyContext(state, "growth");
    expect(context.works).toEqual(["真实事件开头表现稳定"]);
    expect(context.avoid).toEqual(["过度戏剧化"]);
    expect(context.testing).toEqual(["问题型标题"]);
    expect(context.watch).toEqual([]);
    expect(strategyPrompt(state, "growth")).toContain("必须避免");
  });

  it("returns an empty prompt when the account has no active strategy", () => {
    expect(strategyPrompt(empty(), "growth")).toBe("");
  });

  it("marks a strategy inactive without deleting its history", () => {
    const applied = applyStrategy(empty(), { account: "growth", key: "k", value: "v", category: "works", source: "manual" });
    const state = { ...empty(), strategies: applied.strategies };
    const next = deactivateStrategy(state, applied.entry.id);
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("inactive");
    expect(resolveActiveStrategy({ ...state, strategies: next }, "growth", "k")).toBeUndefined();
  });
});
