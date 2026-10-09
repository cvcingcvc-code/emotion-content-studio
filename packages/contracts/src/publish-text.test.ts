import { describe, expect, it } from "vitest";
import { growthPublishText, normalizePublishText } from "./publish-text.js";

describe("publishable plain text", () => {
  it("cleans formatting inside tables as well as indented headings, quotes and escapes", () => {
    const result = normalizePublishText([
      "  ### 一次复盘", "", "| 事项 | 行动 |", "| :--- | ---: |",
      "| 核对范围 | **先问清楚**，再准备材料 |", "", "  > **保留这句提醒。**",
      "- 用 `清单` 记录 2\\~3 个问题", "___", "预算是 300 元，A | B 都可以。",
    ].join("\n"));
    expect(result).toContain("· 核对范围：先问清楚，再准备材料");
    expect(result).toContain("保留这句提醒。");
    expect(result).toContain("· 用 清单 记录 2~3 个问题");
    expect(result).toContain("预算是 300 元，A | B 都可以。");
    expect(result).not.toMatch(/\*\*|#{2,}|---|^\s*>|\\~/m);
    expect(normalizePublishText(result)).toBe(result);
  });

  it("preserves names, numbers, hashtags, URLs and meaningful punctuation", () => {
    const text = "user_name 的记录：-3 与 2 * 3，#成长\n---预算没有增加\nhttps://example.test/a_b\n";
    expect(normalizePublishText(text)).toBe(text.trim());
    expect(normalizePublishText("[查看清单](https://example.test/check)")).toBe("查看清单 (https://example.test/check)");
  });

  it("keeps multiplication operators while removing actual italic emphasis", () => {
    const expression = "核对结果：2 * 3 * 4 = 24；2*3*4 = 24。";
    expect(normalizePublishText(expression)).toBe(expression);
    expect(normalizePublishText("先*核对页数*，再发出材料。")).toBe("先核对页数，再发出材料。");
  });

  it("copies one ending question and each tag, excluding auxiliary review fields", () => {
    const writing = { title: "标题", body: "**先核对范围。**\n\n你会先问什么？\n#成长", endingQuestion: "你会先问什么？", corePoint: "仅供审核的观点", solution: "仅供审核的步骤", tags: ["#成长", "#复盘"] };
    const copied = growthPublishText({ writing, english: null });
    expect(copied).toBe("先核对范围。\n\n你会先问什么？\n#成长\n\n#复盘");
    expect(copied).not.toContain("仅供审核");
    expect(growthPublishText({ writing: { ...writing, body: "新正文" }, english: null })).toBe("新正文\n\n你会先问什么？\n\n#成长 #复盘");
  });

  it("deduplicates whole tags rather than confusing a tag with a longer tag", () => {
    const writing = { title: "标题", body: "记录。\n#成长记录", endingQuestion: "", corePoint: "", solution: "", tags: ["#成长", "#成长记录", "#成长", " "] };
    expect(growthPublishText({ writing, english: null })).toBe("记录。\n#成长记录\n\n#成长");
  });
});
