import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { ApiErrorSchema, AiUsageSchema } from "@emotion-studio/contracts";
import { OpenAiCompatibleJsonClient, type CompatibleClientOptions } from "./openai-compatible-client.js";
import { createConfiguredContentAnalyzer } from "./provider-factory.js";
import { createConfiguredPipelines } from "../studio/pipelines/factory.js";
import { createGrowthLoopAgent } from "../growth-loop/provider.js";
import { readServerConfig } from "../config.js";
import { jsonlUsageRecorder, readAiUsage, type AiUsage } from "./usage.js";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "../english/provider.js";
import { demoEnglishWriting } from "../english/demo-content.js";

const schema = z.object({ text: z.string() }).strict();
const response = (content: unknown = { text: "safe result" }, usage: unknown = { prompt_tokens: 100, completion_tokens: 25 }, finish = "stop") => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }], usage }));
const configuration = (extra: Partial<CompatibleClientOptions> = {}): CompatibleClientOptions => ({ apiKey: "synthetic-test-key", model: "synthetic-json-model", provider: "openai-compatible", baseUrl: "https://provider.example.test/v1/", allowCalls: true, timeoutMs: 1000, maxAttempts: 3, sleep: async () => undefined, ...extra });
const env = (extra: NodeJS.ProcessEnv = {}) => readServerConfig({ AI_PROVIDER: "openai-compatible", AI_API_KEY: "synthetic-test-key", AI_MODEL: "synthetic-json-model", AI_BASE_URL: "https://provider.example.test/v1", AI_ALLOW_PAID_CALLS: "true", AI_MAX_ATTEMPTS: "1", ...extra });
const messages = [{ role: "user" as const, content: "synthetic private prompt" }];

describe("OpenAI compatible provider with simulated transport only", () => {
  it("sends the configured endpoint and records tokens and user-supplied cost without secrets", async () => {
    const ledger: AiUsage[] = [];
    const transport = vi.fn<typeof fetch>(async () => response());
    const result = await new OpenAiCompatibleJsonClient(configuration({ fetchImpl: transport, recordUsage: entry => ledger.push(entry), inputPricePerMillion: 2, outputPricePerMillion: 4 })).completeJson(schema, messages, { maxTokens: 99 });
    expect(result.text).toBe("safe result");
    expect(transport.mock.calls[0]?.[0]).toBe("https://provider.example.test/v1/chat/completions");
    const options = transport.mock.calls[0]?.[1];
    expect(options?.headers).toMatchObject({ authorization: "Bearer synthetic-test-key" });
    expect(JSON.parse(String(options?.body))).toMatchObject({ model: "synthetic-json-model", max_tokens: 99, response_format: { type: "json_object" }, stream: false });
    expect(String(options?.body)).not.toContain("thinking");
    expect(ledger).toHaveLength(1);
    expect(AiUsageSchema.parse(ledger[0])).toMatchObject({ outcome: "success", attempts: 1, inputTokens: 100, outputTokens: 25, estimatedCost: 0.0003 });
    expect(JSON.stringify(ledger)).not.toMatch(/synthetic-test-key|synthetic private prompt|provider\.example/);
  });
  it("defaults to closed paid-call gate even if credentials exist", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response()); const entries: AiUsage[] = [];
    const analyzer = createConfiguredContentAnalyzer(env({ AI_ALLOW_PAID_CALLS: "false" }), { fetchImpl, recordUsage: entry => entries.push(entry) });
    await expect(analyzer.analyze({ content: "一个人慢慢生活", likes: 2 })).rejects.toMatchObject({ code: "AI_CALLS_DISABLED", attempts: 0 });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(entries[0]).toMatchObject({ outcome: "blocked", attempts: 0, estimatedCost: null });
    expect(readServerConfig({}).AI_ALLOW_PAID_CALLS).toBe(false);
  });
  it("bounds retries for 429, 5xx and network failures and records their count", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("private upstream", { status: 429 })).mockResolvedValueOnce(new Response("private upstream", { status: 503 })).mockResolvedValueOnce(response());
    const entries: AiUsage[] = []; const sleep = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(async () => undefined);
    await new OpenAiCompatibleJsonClient(configuration({ fetchImpl: transport, sleep, recordUsage: entry => entries.push(entry) })).completeJson(schema, messages);
    expect(transport).toHaveBeenCalledTimes(3); expect(sleep.mock.calls.map(x => x[0])).toEqual([250, 500]); expect(entries[0]?.attempts).toBe(3);
    const failed = vi.fn<typeof fetch>(async () => { throw new Error("synthetic-test-key"); });
    await expect(new OpenAiCompatibleJsonClient(configuration({ fetchImpl: failed })).completeJson(schema, messages)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", attempts: 3 });
    expect(failed).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 400])("does not retry or disclose upstream bodies for status %s", async status => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("synthetic-test-key private body", { status }));
    try { await new OpenAiCompatibleJsonClient(configuration({ fetchImpl })).completeJson(schema, messages); throw new Error("expected failure"); }
    catch (error) { expect(error).toMatchObject({ code: status === 400 ? "AI_UNAVAILABLE" : "AI_AUTH_ERROR", attempts: 1 }); expect(String(error)).not.toContain("synthetic-test-key"); }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("times out and retries a transport that respects abort signals", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, options) => new Promise<Response>((_resolve, reject) => { options?.signal?.addEventListener("abort", () => reject(new Error("private timeout details")), { once: true }); }));
    await expect(new OpenAiCompatibleJsonClient(configuration({ fetchImpl, timeoutMs: 20, maxAttempts: 2 })).completeJson(schema, messages)).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("honors cancellation before transport and during retries without fallback", async () => {
    const controller = new AbortController(); controller.abort(); const fetchImpl = vi.fn<typeof fetch>(async () => response());
    await expect(new OpenAiCompatibleJsonClient(configuration({ fetchImpl })).completeJson(schema, messages, { signal: controller.signal })).rejects.toMatchObject({ code: "AI_ABORTED", attempts: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    const retryController = new AbortController();
    const retryFetch = vi.fn<typeof fetch>(async () => { retryController.abort(); throw new Error("network"); });
    await expect(new OpenAiCompatibleJsonClient(configuration({ fetchImpl: retryFetch })).completeJson(schema, messages, { signal: retryController.signal })).rejects.toMatchObject({ code: "AI_ABORTED", attempts: 1 });
    expect(retryFetch).toHaveBeenCalledTimes(1);
  });
  it.each(["invalid-envelope", "invalid-content", "length", "wrong-schema"])("rejects %s without retries and preserves known billing tokens", async kind => {
    const fetchImpl = vi.fn<typeof fetch>(async () => kind === "invalid-envelope" ? new Response("not json") : kind === "invalid-content" ? new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "not json" } }], usage: { prompt_tokens: 100, completion_tokens: 25 } })) : response(kind === "wrong-schema" ? { text: 12 } : { text: "okay" }, undefined, kind === "length" ? "length" : "stop"));
    const entries: AiUsage[] = [];
    await expect(new OpenAiCompatibleJsonClient(configuration({ fetchImpl, recordUsage: entry => entries.push(entry) })).completeJson(schema, messages)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(entries[0]?.outcome).toBe("failure");
    if (kind !== "invalid-envelope") expect(entries[0]?.inputTokens).toBe(100);
  });
  it("keeps unknown token usage or unconfigured cost null", async () => {
    const entries: AiUsage[] = [];
    await new OpenAiCompatibleJsonClient(configuration({ fetchImpl: async () => response({}, null), recordUsage: entry => entries.push(entry), inputPricePerMillion: 1, outputPricePerMillion: 1 })).completeJson(z.object({}), messages);
    expect(entries[0]).toMatchObject({ inputTokens: null, outputTokens: null, estimatedCost: null });
    await new OpenAiCompatibleJsonClient(configuration({ fetchImpl: async () => response(), recordUsage: entry => entries.push(entry) })).completeJson(schema, messages);
    expect(entries[1]?.estimatedCost).toBeNull();
  });
  it("uses truthful Mock fallback for analyzers, pipelines and retrospective analysis", async () => {
    const dependencies = { fetchImpl: vi.fn<typeof fetch>(async () => new Response("private", { status: 503 })), recordUsage: () => undefined };
    expect((await createConfiguredContentAnalyzer(env(), dependencies).analyze({ content: "生活慢慢变好", likes: 0 })).provider).toBe("mock");
    expect((await createConfiguredPipelines(env(), dependencies).emotionAnalyzer.analyze({ content: "生活慢慢变好" })).provider).toBe("mock");
    const result = await createGrowthLoopAgent(env(), dependencies).analyzeRetrospectiveResult({ date: "2026-10-09", whatHappened: "今天先确认了交付标准，避免反复返工。", myReaction: "确认范围", whatBotheredMe: "返工", whatCouldBeHandledBetter: "先确认", lessonLearned: "确认范围", nextAction: "下次确认", optionalNote: "" });
    expect(result.provider).toBe("mock");
    await expect(createConfiguredContentAnalyzer(env({ AI_FALLBACK: "none" }), dependencies).analyze({ content: "生活", likes: 0 })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    const auth = { ...dependencies, fetchImpl: vi.fn<typeof fetch>(async () => new Response("private", { status: 401 })) };
    await expect(createConfiguredContentAnalyzer(env(), auth).analyze({ content: "生活", likes: 0 })).rejects.toMatchObject({ code: "AI_AUTH_ERROR" });
  });
  it("keeps English demo offline and its real path gated, with configured compatible fallback", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("private", { status: 503 })); const input = { topic: "尴尬时刻英语50句", tone: "日常" as const };
    expect((await createEnglishWriter({}, fetchImpl).generate(input)).provider).toBe("demo"); expect(fetchImpl).not.toHaveBeenCalled();
    const config = { ENGLISH_AI_MODE: "real", AI_PROVIDER: "openai-compatible", AI_API_KEY: "synthetic-test-key", AI_MODEL: "synthetic-model", AI_MAX_ATTEMPTS: "1" };
    await expect(createEnglishWriter(config, fetchImpl, { recordUsage: () => undefined }).generate(input)).rejects.toMatchObject({ code: "AI_CALLS_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await createEnglishWriter({ ...config, AI_ALLOW_PAID_CALLS: "true" }, fetchImpl, { recordUsage: () => undefined }).generate(input)).provider).toBe("demo");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each(["deepseek", "openai-compatible"])("routes English %s only with its own key and model", async provider => {
    const input = { topic: "尴尬时刻英语50句", tone: "日常" as const };
    const fetchImpl = vi.fn<typeof fetch>(async () => response(demoEnglishWriting(input)));
    const writer = createEnglishWriter({ ENGLISH_AI_MODE: "real", AI_PROVIDER: provider, AI_ALLOW_PAID_CALLS: "true", AI_API_KEY: "synthetic-compatible-key", AI_MODEL: "compatible-model", AI_BASE_URL: "https://compatible.example.test/v1", DEEPSEEK_API_KEY: "synthetic-deepseek-key", DEEPSEEK_MODEL: "deepseek-model" }, fetchImpl, { recordUsage: () => undefined });
    expect((await writer.generate(input)).provider).toBe(provider);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(provider === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://compatible.example.test/v1/chat/completions");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer " + (provider === "deepseek" ? "synthetic-deepseek-key" : "synthetic-compatible-key") });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).model).toBe(provider === "deepseek" ? "deepseek-model" : "compatible-model");
  });
  it.each(["deepseek", "openai-compatible"])("refuses to borrow credentials when English %s is selected explicitly", async provider => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    const credentials = provider === "deepseek" ? { AI_API_KEY: "synthetic-other-key", AI_MODEL: "other-model" } : { DEEPSEEK_API_KEY: "synthetic-other-key", DEEPSEEK_MODEL: "other-model" };
    await expect(createEnglishWriter({ ENGLISH_AI_MODE: "real", AI_PROVIDER: provider, AI_ALLOW_PAID_CALLS: "true", ...credentials }, fetchImpl, { recordUsage: () => undefined }).generate({ topic: "尴尬时刻英语50句", tone: "日常" })).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fails closed if usage recording fails", async () => {
    const analyzer = createConfiguredContentAnalyzer(env(), { fetchImpl: async () => new Response("private", { status: 503 }), recordUsage: () => { throw new Error("private disk error"); } });
    await expect(analyzer.analyze({ content: "生活", likes: 0 })).rejects.toMatchObject({ code: "AI_USAGE_STORAGE_ERROR" });
  });
  it("persists the minimal ledger across app restarts and wraps corrupted ledger errors", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "emotion-provider-test-")), "usage.jsonl");
    await new OpenAiCompatibleJsonClient(configuration({ fetchImpl: async () => response(), recordUsage: jsonlUsageRecorder(path) })).completeJson(schema, messages);
    expect(readFileSync(path, "utf8")).not.toMatch(/synthetic-test-key|synthetic private prompt/);
    expect(readAiUsage(path)).toHaveLength(1);
    const first = await buildApp({ aiUsagePath: path }); expect((await first.inject("/api/v1/ai/usage")).json().data).toEqual(readAiUsage(path)); await first.close();
    const second = await buildApp({ aiUsagePath: path });
    try { expect((await second.inject("/api/v1/ai/usage")).json().data).toHaveLength(1); writeFileSync(path, "private malformed ledger"); const res = await second.inject("/api/v1/ai/usage"); expect(res.statusCode).toBe(503); expect(ApiErrorSchema.parse(res.json()).error.code).toBe("AI_USAGE_STORAGE_ERROR"); expect(res.body).not.toContain("private malformed"); }
    finally { await second.close(); }
  });
  it("rejects insecure and credential-bearing endpoints", () => {
    for (const baseUrl of ["http://external.example/v1", "https://key@provider.example/v1", "https://provider.example/v1?key=x", "https://provider.example/v1#x"]) expect(() => new OpenAiCompatibleJsonClient(configuration({ baseUrl }))).toThrow();
    expect(() => new OpenAiCompatibleJsonClient(configuration({ baseUrl: "http://127.0.0.1:1234/v1" }))).not.toThrow();
  });
});
