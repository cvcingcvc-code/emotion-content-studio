import { describe, expect, it } from "vitest";
import { CreateContentInputSchema, English50PackageSchema, PerformanceSchema } from "./index.js";

function englishPackage() {
  return {
    kind: "english_50.v1", topic: "结构验证主题", audience: "语言学习者", positioning: "用于校验结构",
    titles: ["标题一", "标题二", "标题三"], recommendedTitle: "标题一", body: "独立的英语学习发布包正文", hashtags: ["#英语"],
    groups: Array.from({ length: 5 }, (_, group) => ({
      groupName: "分组" + group,
      sentences: Array.from({ length: 10 }, (_, index) => ({ english: "Test sentence " + (group * 10 + index), chinese: "用于合同测试的中文解释" })),
    })),
    fivePageLayout: Array.from({ length: 5 }, (_, index) => ({ pageNumber: index + 1, groupNumber: index + 1, headline: "页面主题", visualSuggestion: "文字卡片" })),
    visualSuggestions: ["简单排版"],
  };
}
describe("three-account contracts", () => {
  it("requires five groups of ten unique sentences and five aligned pages", () => {
    expect(English50PackageSchema.safeParse(englishPackage()).success).toBe(true);
    const short = englishPackage(); short.groups[0]!.sentences.pop();
    const long = englishPackage(); long.groups[0]!.sentences.push({ english: "An extra sentence", chinese: "多余的一句" });
    const duplicate = englishPackage(); duplicate.groups[1]!.sentences[0] = duplicate.groups[0]!.sentences[0]!;
    const page = englishPackage(); page.fivePageLayout[1]!.groupNumber = 1;
    const title = englishPackage(); title.recommendedTitle = "不在候选中的标题";
    for (const invalid of [short, long, duplicate, page, title]) expect(English50PackageSchema.safeParse(invalid).success).toBe(false);
  });
  it("validates source and lane against account without transforming the original text", () => {
    const payload = { accountId: "personal_growth", sourceType: "daily_review", contentLane: "growth_review", content: "  真实记录  ", licenseStatus: "original" };
    expect(CreateContentInputSchema.parse(payload).content).toBe("  真实记录  ");
    expect(CreateContentInputSchema.safeParse({ ...payload, accountId: "fun_english" }).success).toBe(false);
    expect(CreateContentInputSchema.safeParse({ ...payload, sourceAuthor: "未确认署名" }).success).toBe(false);
  });
  it("distinguishes missing measurements from zero and requires capture time", () => {
    const empty = { views: null, likes: null, favorites: null, comments: null, shares: null, follows: null, metricsCapturedAt: null };
    expect(PerformanceSchema.safeParse(empty).success).toBe(true);
    expect(PerformanceSchema.safeParse({ ...empty, views: 0 }).success).toBe(false);
    expect(PerformanceSchema.safeParse({ ...empty, views: 0, metricsCapturedAt: "2026-09-09T10:00:00.000Z" }).success).toBe(true);
  });
});
