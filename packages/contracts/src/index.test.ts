import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  ConfirmDraftInputSchema,
  CreateVideoProjectInputSchema,
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
});
