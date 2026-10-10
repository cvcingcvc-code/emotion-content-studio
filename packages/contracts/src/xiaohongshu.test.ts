import { describe, expect, it } from "vitest";
import { batchContentKey, BatchGenerateInputSchema } from "./xiaohongshu.js";
describe("batch content identity", () => {
  it("normalizes case, full-width characters and whitespace while preserving source/account/format boundaries", () => {
    const item = { account: "emotion", contentType: "reflection", sourceRetrospectiveId: null, topic: " ＦＯＣＵＳ  today " };
    const key = batchContentKey(item);
    expect(batchContentKey({ ...item, topic: "focus today" })).toBe(key);
    for (const change of [{ account: "growth" }, { contentType: "story" }, { sourceRetrospectiveId: "new-source" }]) expect(batchContentKey({ ...item, ...change })).not.toBe(key);
  });
  it("bounds batches and refuses additional client fields", () => {
    const item = { account: "emotion", contentType: "reflection", sourceRetrospectiveId: null, topic: "新主题" };
    expect(BatchGenerateInputSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(BatchGenerateInputSchema.safeParse({ items: [] }).success).toBe(false);
    expect(BatchGenerateInputSchema.safeParse({ items: Array.from({ length: 11 }, () => item) }).success).toBe(false);
    expect(BatchGenerateInputSchema.safeParse({ items: [{ ...item, status: "ready" }] }).success).toBe(false);
  });
});
