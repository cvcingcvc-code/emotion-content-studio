import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  ContentItemQuerySchema,
  ContentItemSchema,
  ConfirmDraftInputSchema,
  CreateVideoProjectInputSchema,
  GenerateContentInputSchema,
  GeneratedContentSchema,
  MaterialSchema,
  ReviewMaterialInputSchema,
  SimulateExportInputSchema,
} from "./index.js";

describe("public contracts", () => {
  it("accepts a web-safe material DTO", () => {
    const result = MaterialSchema.safeParse({
      id: "material-01",
      text: "我把今天的安静，留给明天慢慢理解。",
      sourceType: "original_note",
      sourceUrl: null,
      licenseStatus: "original",
      reviewStatus: "approved",
      filterFlags: [],
      riskLevel: "low",
      theme: "自我理解",
      scenario: "夜晚独处",
      importedAt: "2026-08-20T08:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("requires a reason for a non-approved review", () => {
    expect(
      ReviewMaterialInputSchema.safeParse({ decision: "rejected" }).success,
    ).toBe(false);
  });

  it("requires explicit human confirmation", () => {
    expect(ConfirmDraftInputSchema.safeParse({ humanConfirmed: false }).success).toBe(false);
  });

  it("defaults a new mock project to the fixed minimal template", () => {
    expect(CreateVideoProjectInputSchema.parse({}).templateKey).toBe("blank_subtitle");
  });

  it("accepts only fixed-template preview settings for simulated exports", () => {
    expect(SimulateExportInputSchema.safeParse({
      acknowledgedRights: true,
      templateKey: "night_mood",
      config: { alignment: "left", palette: "deep_ink", pace: "slow" },
    }).success).toBe(true);
  });

  it("keeps errors free of server implementation details", () => {
    const parsed = ApiErrorSchema.parse({
      ok: false,
      error: { code: "NOT_FOUND", message: "未找到请求的内容" },
      requestId: "request-01",
    });

    expect(parsed).not.toHaveProperty("stack");
    expect(parsed.error).not.toHaveProperty("storageKey");
  });

  it("validates the public demo content DTO and explicit query booleans", () => {
    expect(ContentItemSchema.safeParse({
      id: "content-01",
      originalContent: "  今天也值得被认真对待。  ",
      content: "今天也值得被认真对待。",
      author: null,
      likes: 12,
      source: "演示素材",
      sourceUrl: null,
      licenseStatus: "original",
      emotion: "治愈",
      emotionScore: 88,
      resonanceScore: 82,
      category: "生活",
      tags: ["慢生活", "自我照顾"],
      isFavorite: false,
      importedAt: "2026-08-31T08:00:00.000Z",
    }).success).toBe(true);

    expect(ContentItemQuerySchema.parse({ highResonance: "false" }).highResonance).toBe(false);
  });

  it("limits generation to one through five unique source items", () => {
    expect(GenerateContentInputSchema.safeParse({ contentIds: [] }).success).toBe(false);
    expect(GenerateContentInputSchema.safeParse({ contentIds: ["1", "2", "3", "4", "5", "6"] }).success).toBe(false);
    expect(GenerateContentInputSchema.safeParse({ contentIds: ["1", "1"] }).success).toBe(false);
    expect(GeneratedContentSchema.safeParse({
      id: "generated-01",
      title: "把心里的天气慢慢说清楚",
      body: "这是一段用于验证长度规则的短文本。",
      hashtags: ["#情绪"],
      status: "draft",
      generatorLabel: "DEMO AI 生成结果",
      contentIds: ["1"],
      createdAt: "2026-08-31T08:00:00.000Z",
    }).success).toBe(false);
  });
});
