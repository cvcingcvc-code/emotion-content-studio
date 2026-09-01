import {
  ContentAnalysisSchema,
  GeneratedDraftSchema,
} from "@emotion-studio/contracts";
import { describe, expect, it, vi } from "vitest";
import { DeepSeekContentAnalyzer } from "./deepseek-analyzer.js";
import { DeepSeekJsonClient } from "./deepseek-client.js";
import { DeepSeekContentGenerator } from "./deepseek-generator.js";
import { AiProviderError } from "./errors.js";

const validAnalysis = {
  emotion: "孤独",
  emotionScore: 86,
  resonanceScore: 91,
  category: "孤独",
  tags: ["夜晚心绪", "情绪共鸣"],
};
const validDraft = {
  title: "把夜晚留给真正的自己",
  body: "有些夜晚并不需要立刻找到答案。我们可以先承认疲惫，允许一段安静存在，也把注意力从别人的期待收回到自己的呼吸。那些尚未说清的感受，不代表生活停在原地，它们只是需要一点时间被认真看见。试着完成一件小事，吃一顿热饭，关掉让心绪更乱的消息，再为明天保留一个温柔的计划。成长不是从此不再敏感，而是在敏感之后知道怎样照顾自己。愿你不必用热闹证明充实，也不必用忙碌掩盖孤独；当脚步慢下来，仍能相信每一次真实选择都在带你靠近更清晰的方向。此刻没有结论也没关系，先把今天过成一个可以安稳呼吸的日子。",
  hashtags: ["#情绪", "#孤独", "#成长"],
};

function successResponse(value: unknown, finishReason = "stop"): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: finishReason,
      message: { content: JSON.stringify(value) },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function createClient(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof DeepSeekJsonClient>[0]> = {},
) {
  return new DeepSeekJsonClient({
    apiKey: "unit-test-key",
    model: "deepseek-test-model",
    timeoutMs: 1_000,
    maxAttempts: 3,
    sleep: async () => undefined,
    fetchImpl,
    endpoint: "https://example.test/chat/completions",
    ...overrides,
  });
}

describe("DeepSeek adapters", () => {
  it("validates analysis and sends only the required analyzer fields", async () => {
    const fetchMock = vi.fn(async () => successResponse(validAnalysis));
    const analyzer = new DeepSeekContentAnalyzer(
      createClient(fetchMock as unknown as typeof fetch),
    );
    const result = await analyzer.analyze({ content: "夜深时，我学会照顾自己。", likes: 42 });

    expect(result).toEqual({
      data: validAnalysis,
      provider: "deepseek",
      model: "deepseek-test-model",
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const request = JSON.parse(String(init.body));
    expect(request).toMatchObject({
      model: "deepseek-test-model",
      stream: false,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
    });
    const serialized = JSON.stringify(request.messages);
    expect(serialized).toContain("夜深时，我学会照顾自己。");
    expect(serialized).not.toContain("author");
    expect(serialized).not.toContain("sourceUrl");
  });

  it("validates a generated draft without sending ids or source metadata", async () => {
    const fetchMock = vi.fn(async () => successResponse(validDraft));
    const generator = new DeepSeekContentGenerator(
      createClient(fetchMock as unknown as typeof fetch),
    );
    const result = await generator.generate({
      items: [{
        id: "internal-content-id",
        content: "一个人也可以认真生活。",
        emotion: "孤独",
        category: "成长",
        tags: ["自我照顾"],
      }],
    });

    expect(result.data).toEqual(validDraft);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const serialized = String(init.body);
    expect(serialized).not.toContain("internal-content-id");
    expect(serialized).not.toContain("author");
    expect(serialized).not.toContain("sourceUrl");
  });

  it("does not retry authentication failures or expose provider details", async () => {
    const fetchMock = vi.fn(async () => new Response("private provider response", { status: 401 }));
    const client = createClient(fetchMock as unknown as typeof fetch);

    await expect(client.completeJson(ContentAnalysisSchema, [])).rejects.toMatchObject({
      code: "AI_AUTH_ERROR",
      statusCode: 503,
      attempts: 1,
      upstreamStatus: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    try {
      await client.completeJson(ContentAnalysisSchema, []);
    } catch (error) {
      expect(String(error)).not.toContain("unit-test-key");
      expect(String(error)).not.toContain("private provider response");
    }
  });

  it("retries 429 and retryable 5xx responses within the configured bound", async () => {
    const rateLimited = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "0" },
      }))
      .mockResolvedValueOnce(successResponse(validAnalysis));
    const rateResult = await createClient(rateLimited as unknown as typeof fetch)
      .completeJson(ContentAnalysisSchema, []);
    expect(rateResult).toEqual(validAnalysis);
    expect(rateLimited).toHaveBeenCalledTimes(2);

    const unavailable = vi.fn(async () => new Response("unavailable", { status: 503 }));
    await expect(
      createClient(unavailable as unknown as typeof fetch)
        .completeJson(ContentAnalysisSchema, []),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      statusCode: 503,
      attempts: 3,
      upstreamStatus: 503,
    });
    expect(unavailable).toHaveBeenCalledTimes(3);
  });

  it("retries a temporary network error but not malformed provider data", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("temporary network failure"))
      .mockResolvedValueOnce(successResponse(validAnalysis));
    await expect(
      createClient(fetchMock as unknown as typeof fetch)
        .completeJson(ContentAnalysisSchema, []),
    ).resolves.toEqual(validAnalysis);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const invalidEnvelope = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      createClient(invalidEnvelope as unknown as typeof fetch)
        .completeJson(ContentAnalysisSchema, []),
    ).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", statusCode: 502 });
    expect(invalidEnvelope).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid HTTP JSON", new Response("not-json", { status: 200 })],
    ["empty model content", new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "   " } }],
    }), { status: 200 })],
    ["truncated model output", successResponse(validAnalysis, "length")],
    ["invalid model JSON", new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "not-json" } }],
    }), { status: 200 })],
    ["schema mismatch", successResponse({ ...validAnalysis, emotionScore: 120 })],
  ])("rejects %s without retrying", async (_label, response) => {
    const fetchMock = vi.fn(async () => response.clone());
    await expect(
      createClient(fetchMock as unknown as typeof fetch)
        .completeJson(ContentAnalysisSchema, []),
    ).rejects.toBeInstanceOf(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps overall timeout and caller cancellation without retrying", async () => {
    const pendingFetch: typeof fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })) as typeof fetch;
    const timeoutClient = createClient(pendingFetch, { timeoutMs: 10 });
    await expect(timeoutClient.completeJson(GeneratedDraftSchema, []))
      .rejects.toMatchObject({ code: "AI_TIMEOUT", statusCode: 504, attempts: 1 });

    const controller = new AbortController();
    const cancelled = createClient(pendingFetch, { timeoutMs: 1_000 });
    const promise = cancelled.completeJson(GeneratedDraftSchema, [], { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "AI_ABORTED", statusCode: 499 });
  });
});
