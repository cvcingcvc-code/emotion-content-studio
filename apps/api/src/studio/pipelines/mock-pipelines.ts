import {
  EmotionAnalysisSchema,
  EmotionPostPackageSchema,
  English50PackageSchema,
  GrowthAnalysisSchema,
  GrowthPostPackageSchema,
  type ContentEmotion,
  type EmotionAnalysis,
} from "@emotion-studio/contracts";
import type { AiCallOptions } from "../../ai/types.js";
import { PipelineGuardError, validateGrowthAnalysis, validateGrowthPost } from "./guards.js";
import type {
  EmotionAnalyzer,
  EmotionGenerator,
  EnglishGenerator,
  GrowthAnalyzer,
  GrowthGenerator,
  PipelineRegistry,
} from "./types.js";

function assertNotAborted(options?: AiCallOptions): void {
  if (!options?.signal?.aborted) return;
  const error = new Error("AI request aborted");
  error.name = "AbortError";
  throw error;
}

const forbiddenInventions = [
  "person",
  "dialogue",
  "amount",
  "time",
  "result",
  "experience",
] as const;

export class MockGrowthAnalyzer implements GrowthAnalyzer {
  async analyze(input: Parameters<GrowthAnalyzer["analyze"]>[0], options?: AiCallOptions) {
    assertNotAborted(options);
    const firstAnchor = input.truthAnchors[0];
    if (!firstAnchor) throw new Error("Growth analysis requires at least one truth anchor");
    const action = input.truthAnchors.find((anchor) => /我(?:决定|开始|尝试|已经|先|做了|完成)/.test(anchor.quote));
    const turning = input.truthAnchors.find((anchor) => /后来|意识到|转折/.test(anchor.quote));
    const emotion = /焦虑|紧张|害怕|不安/u.test(input.content)
      ? "焦虑"
      : /难过|失落|遗憾|委屈/u.test(input.content)
        ? "失落"
        : "复杂";
    const analysis = GrowthAnalysisSchema.parse({
      kind: "growth.v1",
      truthAnchors: input.truthAnchors,
      coreEvent: { text: firstAnchor.quote, anchorIds: [firstAnchor.id] },
      coreConflict: {
        text: "眼前的现实压力与下一步选择之间存在冲突。",
        anchorIds: [firstAnchor.id],
      },
      emotions: [{ label: emotion, intensity: 68, evidenceAnchorIds: [firstAnchor.id] }],
      rootProblem: {
        text: "信息不足时，人容易把不确定性理解成对自己的否定。",
        anchorIds: [firstAnchor.id],
      },
      audiencePain: ["不知道如何拆解眼前的问题", "在不确定中容易反复自我怀疑"],
      universalResonance: "很多普通人面对选择时，都需要先区分事实、感受与尚未验证的判断。",
      turningPoint: turning ? { text: turning.quote, anchorIds: [turning.id] } : null,
      solution: action ? { text: action.quote, anchorIds: [action.id] } : null,
      actionableAdvice: [
        "接下来可以先写下已经确认的事实，再列出仍需补充的信息。",
        "把下一步缩小成一个今天能够完成的行动，并在行动后重新复盘。",
        "如果涉及重要决定，可以先向可信任的人核对盲点，而不是急着得出结论。",
      ],
      titleAngles: ["当选择没有标准答案时", "先把事实和焦虑分开", "普通人如何走出反复内耗"],
      riskFlags: [],
      forbiddenInventions,
      missingInformation: [...(!turning ? ["用户未提供明确转折点"] : []), ...(!action ? ["用户未提供已经采取的处理方式"] : []), "最终结果需本人补充确认"],
    });
    return {
      data: validateGrowthAnalysis(input, analysis),
      provider: "mock" as const,
      model: "mock-growth-analyzer-v1",
    };
  }
}

export class MockGrowthGenerator implements GrowthGenerator {
  async generate(input: Parameters<GrowthGenerator["generate"]>[0], options?: AiCallOptions) {
    assertNotAborted(options);
    const analysis = GrowthAnalysisSchema.parse(input.analysis);
    const titles = [
      analysis.titleAngles[0] ?? "把事实和焦虑分开以后",
      analysis.titleAngles[1] ?? "普通人也能用的复盘方法",
      analysis.titleAngles[2] ?? "没有标准答案时，先做这一步",
    ];
    const draft = GrowthPostPackageSchema.parse({
      kind: "growth_post.v1",
      titles,
      recommendedTitle: titles[0],
      body: [
        analysis.truthAnchors.map((fact) => fact.quote).join("\n"),
        "这段记录里，事实、情绪和对结果的担心缠在了一起。真正需要处理的，不是立刻证明自己做对了，而是先确认哪些信息已经发生，哪些只是当下的推测。",
        "普通人遇到类似问题，可以先暂停给自己下结论。把确定的事实写下来，把还不知道的部分单独列出，再选一个能够马上验证的小行动。行动之后继续记录反馈，下一次选择就会比这一次更有依据。",
        "接下来可以先核对信息，再完成一个小步骤，最后根据真实反馈调整方向。不确定的时候，允许答案暂时留白；把注意力放在能做的事情上，也是在认真地向前走。",
      ].join("\n\n"),
      hashtags: ["#成长复盘", "#停止内耗", "#行动方法"],
      usedTruthAnchorIds: analysis.truthAnchors.map((fact) => fact.id),
      factClaims: analysis.truthAnchors.map((fact) => ({ claim: fact.quote, truthAnchorIds: [fact.id] })),
    });
    return {
      data: validateGrowthPost(analysis, draft),
      provider: "mock" as const,
      model: "mock-growth-generator-v1",
    };
  }
}

type Phrase = readonly [english: string, chinese: string, usageNote?: string];

const englishGroups: readonly { groupName: string; phrases: readonly Phrase[] }[] = [
  {
    groupName: "昨晚发生了什么",
    phrases: [
      ["I stayed up way too late last night.", "我昨晚熬得太晚了。"],
      ["I barely got any sleep.", "我几乎没怎么睡。"],
      ["I couldn't fall asleep until dawn.", "我直到天快亮才睡着。"],
      ["I kept scrolling instead of sleeping.", "我一直刷手机，没有去睡觉。"],
      ["My sleep schedule is completely messed up.", "我的作息彻底乱了。"],
      ["I lost track of time last night.", "我昨晚完全忘了时间。"],
      ["I had too much on my mind.", "我脑子里想的事情太多了。"],
      ["I got hooked on a new show.", "我追一部新剧追上头了。"],
      ["I didn't realize how late it was.", "我没意识到已经那么晚了。"],
      ["My mind just wouldn't switch off.", "我的大脑就是停不下来。"],
    ],
  },
  {
    groupName: "早晨起床状态",
    phrases: [
      ["I hit the snooze button three times.", "我按了三次贪睡键。"],
      ["I woke up feeling exhausted.", "我醒来时感觉筋疲力尽。"],
      ["My eyes are still half closed.", "我的眼睛还半睁着。"],
      ["I need a few more minutes in bed.", "我还想在床上多躺几分钟。"],
      ["I'm running on very little sleep.", "我睡得很少，只能硬撑。"],
      ["I don't feel fully awake yet.", "我还没有完全清醒。"],
      ["Getting out of bed was a struggle.", "今天起床特别艰难。"],
      ["I feel like I could sleep all day.", "我感觉自己能睡上一整天。"],
      ["I need coffee before I can function.", "我得先喝咖啡才能正常运转。"],
      ["Give me a minute to wake up.", "给我一点时间清醒一下。"],
    ],
  },
  {
    groupName: "白天工作学习",
    phrases: [
      ["I'm trying to stay awake at work.", "我在上班时努力保持清醒。"],
      ["My brain is moving in slow motion today.", "我今天脑子转得特别慢。"],
      ["I can't stop yawning.", "我一直忍不住打哈欠。"],
      ["I'm having trouble focusing.", "我很难集中注意力。"],
      ["I might take a short nap at lunch.", "我午休时可能会小睡一会儿。"],
      ["I need some fresh air.", "我需要出去呼吸一下新鲜空气。"],
      ["A quick walk might wake me up.", "快速走一走可能会让我清醒。"],
      ["I'm saving my energy for later.", "我要为晚些时候保存一点精力。"],
      ["I'm a little slower than usual today.", "我今天比平时反应慢一点。"],
      ["I'll go easy on myself today.", "我今天会对自己宽容一点。"],
    ],
  },
  {
    groupName: "和别人解释",
    phrases: [
      ["Sorry, I didn't sleep well last night.", "抱歉，我昨晚没有睡好。"],
      ["I'm not ignoring you; I'm just tired.", "我不是不理你，只是太累了。"],
      ["Could we talk after I get some rest?", "可以等我休息一下再聊吗？"],
      ["I promise I'm listening.", "我保证我在听。"],
      ["I'm just low on energy today.", "我今天只是精力有点低。"],
      ["Did you stay up late too?", "你昨晚也熬夜了吗？"],
      ["You look like you need some sleep.", "你看起来需要补个觉。"],
      ["Let's keep things simple today.", "我们今天尽量简单一点吧。"],
      ["Can we take a short break?", "我们可以短暂休息一下吗？"],
      ["I need an early night tonight.", "我今晚得早点睡。"],
    ],
  },
  {
    groupName: "今晚调整作息",
    phrases: [
      ["I'm going to bed earlier tonight.", "我今晚要早点睡。"],
      ["I'll stop using my phone before bed.", "我睡前会停止玩手机。"],
      ["I need to get back into a routine.", "我需要重新恢复规律作息。"],
      ["I'm setting a bedtime reminder.", "我要设置一个睡觉提醒。"],
      ["A warm shower might help me relax.", "洗个热水澡也许能让我放松。"],
      ["I'll keep the room dark and quiet.", "我会让房间保持黑暗和安静。"],
      ["I'm cutting back on late-night coffee.", "我要少喝深夜咖啡。"],
      ["I want to wake up feeling refreshed.", "我想醒来时感觉精神饱满。"],
      ["One good night's sleep can make a difference.", "好好睡一晚真的会不一样。"],
      ["Tomorrow is a fresh start.", "明天又是一个新的开始。"],
    ],
  },
];

export class MockEnglish50Generator implements EnglishGenerator {
  async generate(input: Parameters<EnglishGenerator["generate"]>[0], options?: AiCallOptions) {
    assertNotAborted(options);
    const topic = input.topic.trim();
    if (!topic) throw new Error("English topic is required");
    if (!/熬夜|睡|晚睡/.test(topic)) {
      throw new PipelineGuardError("UNSUPPORTED_MOCK_TOPIC", "演示模式提供熬夜主题 50 句；其他主题请配置 DeepSeek 后生成");
    }
    const groups = englishGroups.map((group) => ({
      groupName: group.groupName,
      sentences: group.phrases.map(([english, chinese, usageNote]) => ({
        english,
        chinese,
        ...(usageNote ? { usageNote } : {}),
      })),
    }));
    const titles = [`${topic}｜真正用得上的英语50句`, `${topic}：5个场景一次学会`, `碎片时间学会${topic}`];
    const data = English50PackageSchema.parse({
      kind: "english_50.v1",
      topic,
      audience: input.audience?.trim() || "希望利用碎片时间学习生活英语的中文用户",
      positioning: "从熬夜后的真实生活场景出发，覆盖描述状态、工作交流和调整作息时能直接使用的表达。",
      groups,
      titles,
      recommendedTitle: titles[0],
      body: "这组表达按五个真实场景整理：昨晚发生了什么、早晨起床、白天工作学习、向别人解释，以及今晚如何调整。每页十句，建议先挑最符合自己状态的句子朗读，再换成自己的真实信息练习。",
      hashtags: ["#生活英语", "#英语口语", "#碎片时间学习"],
      fivePageLayout: groups.map((group, index) => ({
        pageNumber: index + 1,
        groupNumber: index + 1,
        headline: group.groupName,
        visualSuggestion: index === 0
          ? "深夜台灯、手机与时钟的简洁插画"
          : index === 4
            ? "暖色床头灯与放下手机的表情"
            : "低饱和生活场景插画，配一个对应情绪表情",
      })),
      visualSuggestions: ["使用低饱和蓝灰夜色", "每页突出一个生活场景", "用月亮、咖啡和困倦表情辅助记忆"],
    });
    return { data, provider: "mock" as const, model: "mock-english50-generator-v1" };
  }
}

function inferEmotion(content: string): ContentEmotion {
  if (/生气|愤怒|不公平|委屈/u.test(content)) return "愤怒";
  if (/遗憾|错过|没来得及|告别/u.test(content)) return "遗憾";
  if (/孤独|一个人|独处|夜深/u.test(content)) return "孤独";
  if (/难过|失落|眼泪|心酸/u.test(content)) return "难过";
  if (/爱|喜欢|心动|暗恋/u.test(content)) return "爱情";
  if (/开心|快乐|惊喜/u.test(content)) return "开心";
  if (/治愈|温柔|慢慢|会好/u.test(content)) return "治愈";
  return "其他";
}

export class MockEmotionAnalyzer implements EmotionAnalyzer {
  async analyze(input: Parameters<EmotionAnalyzer["analyze"]>[0], options?: AiCallOptions) {
    assertNotAborted(options);
    const content = input.content.trim();
    if (!content) throw new Error("Emotion material is required");
    const primaryEmotion = inferEmotion(content);
    const secondaryEmotion = primaryEmotion !== "治愈" && /慢慢|会好|温柔/u.test(content)
      ? "治愈"
      : null;
    const data = EmotionAnalysisSchema.parse({
      kind: "emotion.v1",
      primaryEmotion,
      secondaryEmotion,
      emotionIntensity: Math.min(92, 58 + Math.round(content.length / 8)),
      scene: /夜|凌晨/u.test(content) ? "夜晚独处" : "日常生活片段",
      relationshipType: /家人|父母|妈妈|爸爸/u.test(content)
        ? "family"
        : /朋友|友情/u.test(content)
          ? "friendship"
          : /喜欢|恋人|分手|暗恋/u.test(content)
            ? "romantic"
            : "self",
      painPoint: "感受没有被充分理解，也很难立即找到合适的表达。",
      psychologicalConflict: "一边想保护自己的真实感受，一边又担心表达后得不到回应。",
      resonanceReason: "克制表达与内心需要之间的落差，是许多人在日常关系中会遇到的体验。",
      keywords: Array.from(new Set([primaryEmotion, "情绪表达", "自我理解"])),
      reusableTheme: `${primaryEmotion}时如何看见自己的真实需要`,
      recommendedContentAngles: ["从具体场景切入", "拆解没有说出口的心理冲突", "给出温和可执行的自我照顾方式"],
      originalityRisk: {
        level: content.length > 160 ? "medium" : "low",
        similarityScore: 0,
        reasons: ["仅完成单条素材的主题分析，尚未与生成稿执行文本相似度比较"],
        requiresHumanReview: true,
      },
    });
    return { data, provider: "mock" as const, model: "mock-emotion-analyzer-v1" };
  }
}

export class MockEmotionGenerator implements EmotionGenerator {
  async generate(input: Parameters<EmotionGenerator["generate"]>[0], options?: AiCallOptions) {
    assertNotAborted(options);
    if (input.themes.length < 1 || input.themes.length > 5) {
      throw new Error("Emotion generation requires one through five analyzed themes");
    }
    const analyses = input.themes.map((theme) => EmotionAnalysisSchema.parse(theme));
    const themes = Array.from(new Set(analyses.map((analysis) => analysis.reusableTheme))).slice(0, 5);
    const primary = analyses[0]!;
    const titles = [
      `${primary.primaryEmotion}不是软弱，是感受在提醒你`,
      `那些没有说出口的${primary.primaryEmotion}`,
      "成年人也可以认真安放自己的情绪",
    ];
    const data = EmotionPostPackageSchema.parse({
      kind: "emotion_post.v1",
      titles,
      recommendedTitle: titles[0],
      body: [
        `有些${primary.primaryEmotion}并不会在热闹结束后立刻消失。它更像一种提醒：眼前的感受还没有被认真看见，内心真正需要的也尚未被说清。`,
        `与其急着把情绪压下去，不如先辨认它发生在什么场景，又牵动了怎样的心理冲突。${primary.resonanceReason}理解这一点，不是为了停留在感受里，而是为了把注意力带回自己能够选择的部分。`,
        "可以先写下一句此刻最真实的需要，再做一件足够小的照顾自己的事。等情绪不再占据全部视线，我们才更容易决定要沟通、离开，还是给关系新的边界。真正的治愈不是忘记，而是不再让同一种疼痛替自己做所有决定。",
      ].join("\n\n"),
      hashtags: ["#情绪共鸣", `#${primary.primaryEmotion}`, "#自我理解", "#成年人情绪"],
      themes,
      originalityRisk: {
        level: "medium",
        similarityScore: 20,
        reasons: ["生成器仅使用抽象主题，仍需结合源文本运行服务端相似度检查"],
        requiresHumanReview: true,
      },
    });
    return { data, provider: "mock" as const, model: "mock-emotion-generator-v1" };
  }
}

export function createMockPipelines(): PipelineRegistry {
  return {
    growthAnalyzer: new MockGrowthAnalyzer(),
    growthGenerator: new MockGrowthGenerator(),
    englishGenerator: new MockEnglish50Generator(),
    emotionAnalyzer: new MockEmotionAnalyzer(),
    emotionGenerator: new MockEmotionGenerator(),
  };
}

export function withComputedEmotionRisk(
  value: EmotionAnalysis,
  originalityRisk: EmotionAnalysis["originalityRisk"],
): EmotionAnalysis {
  return EmotionAnalysisSchema.parse({ ...value, originalityRisk });
}
