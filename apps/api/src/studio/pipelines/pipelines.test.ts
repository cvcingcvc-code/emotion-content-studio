import { describe, expect, it, vi } from "vitest";
import { DeepSeekJsonClient } from "../../ai/deepseek-client.js";
import {
  createMockPipelines, createTruthAnchors, assessSimilarity, validateGrowthAnalysis, validateGrowthPost,
  DeepSeekGrowthAnalyzer, DeepSeekGrowthGenerator, DeepSeekEnglish50Generator,
  DeepSeekEmotionAnalyzer, DeepSeekEmotionGenerator, findGrowthGroundingIssues,
} from "./index.js";

function fakeClient(data: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  return { client: new DeepSeekJsonClient({ apiKey: "unit-test-placeholder", model: "test-model", timeoutMs: 1000, maxAttempts: 1, fetchImpl }), fetchImpl };
}
const content = "今天我准备面试时感到焦虑。我决定先整理项目经历。";
const growthInput = { content, truthAnchors: createTruthAnchors(content) };

describe("independent account pipelines", () => {
  it("grounds all personal facts and rejects invented quotes, money and results", async () => {
    const mock = createMockPipelines();
    const analysis = (await mock.growthAnalyzer.analyze(growthInput)).data;
    expect(analysis.solution?.text).toBe(growthInput.truthAnchors[1]?.quote);
    const draft = (await mock.growthGenerator.generate({ analysis })).data;
    expect(draft.usedTruthAnchorIds).toEqual(analysis.truthAnchors.map((anchor) => anchor.id));
    expect(() => validateGrowthAnalysis(growthInput, { ...analysis, solution: { text: "我已经成功入职。", anchorIds: ["anchor-1"] } })).toThrow();
    expect(() => validateGrowthPost(analysis, { ...draft, body: draft.body + "\n我赚到了3000元。" })).toThrow();
    expect(findGrowthGroundingIssues(analysis, '昨天老板对我说“你被录用了”。')).not.toEqual([]);
    expect(() => createTruthAnchors("一条记录。".repeat(13))).toThrow();
  });
  it("honors cancellation in every mock adapter", async () => {
    const mock = createMockPipelines();
    const analysis = (await mock.growthAnalyzer.analyze(growthInput)).data;
    const emotion = (await mock.emotionAnalyzer.analyze({ content: "夜里独处时感到孤独。" })).data;
    const options = { signal: AbortSignal.abort() };
    for (const promise of [
      mock.growthAnalyzer.analyze(growthInput, options), mock.growthGenerator.generate({ analysis }, options),
      mock.englishGenerator.generate({ topic: "熬夜人的英语50句" }, options),
      mock.emotionAnalyzer.analyze({ content: "独处" }, options), mock.emotionGenerator.generate({ themes: [emotion] }, options),
    ]) await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
  it("detects source copying anywhere in long bodies", () => {
    const source = "为测试原创转换新写的完整句子，不能被直接拼接进发布正文。";
    expect(assessSimilarity("无关前缀".repeat(800) + source, ["其他内容".repeat(800) + source]).level).toBe("high");
    expect(assessSimilarity(source, [source]).similarityScore).toBe(100);
    expect(assessSimilarity("生活里可以为新的选择留下一点空间。", ["窗外的树梢托住落日最后一束光。"]).level).toBe("low");
  });
  it("validates all five independent DeepSeek adapters with their own JSON schemas", async () => {
    const mock = createMockPipelines();
    const growth = (await mock.growthAnalyzer.analyze(growthInput)).data;
    const growthPost = (await mock.growthGenerator.generate({ analysis: growth })).data;
    const english = (await mock.englishGenerator.generate({ topic: "熬夜人的英语50句" })).data;
    const emotion = (await mock.emotionAnalyzer.analyze({ content: "独处时一盏小灯陪我整理思绪。" })).data;
    const emotionPost = (await mock.emotionGenerator.generate({ themes: [emotion] })).data;
    const responses = [growth, growthPost, english, emotion, emotionPost];
    const clients = responses.map(fakeClient);
    const results = [
      await new DeepSeekGrowthAnalyzer(clients[0]!.client).analyze(growthInput),
      await new DeepSeekGrowthGenerator(clients[1]!.client).generate({ analysis: growth }),
      await new DeepSeekEnglish50Generator(clients[2]!.client).generate({ topic: "熬夜人的英语50句" }),
      await new DeepSeekEmotionAnalyzer(clients[3]!.client).analyze({ content: "已脱敏的素材" }),
      await new DeepSeekEmotionGenerator(clients[4]!.client).generate({ themes: [emotion] }),
    ];
    results.forEach((result, index) => expect(result).toEqual({ data: responses[index], provider: "deepseek", model: "test-model" }));
    const prompts = clients.map(({ fetchImpl }) => JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as { messages: { role: string; content: string }[] });
    expect(new Set(prompts.map((request) => request.messages[0]?.content)).size).toBe(5);
    prompts.forEach((request) => expect(request.messages[0]?.content).toContain("JSON Schema"));
    expect(JSON.stringify(prompts[4])).not.toContain("sourceAuthor");
    expect(JSON.stringify(prompts[4])).not.toContain("sourceUrl");
    expect(JSON.stringify(prompts[4])).not.toContain("独处时一盏小灯陪我整理思绪");
  });
  it("rejects an incomplete English package rather than padding it", async () => {
    const mock = createMockPipelines();
    const data = structuredClone((await mock.englishGenerator.generate({ topic: "熬夜英语50句" })).data);
    data.groups[0]!.sentences.pop();
    const { client } = fakeClient(data);
    await expect(new DeepSeekEnglish50Generator(client).generate({ topic: "熬夜英语50句" }))
      .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    await expect(mock.englishGenerator.generate({ topic: "旅游英语" })).rejects.toMatchObject({ code: "UNSUPPORTED_MOCK_TOPIC" });
  });
});
