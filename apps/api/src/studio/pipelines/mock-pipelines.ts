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
      hook: "进入新环境时，最容易误读的不是工作量，而是沉默本身。",
      story: "把一次具体经历还原成更普遍的场景：刚进入团队时，表面节奏、临时安排和成员互动会给人不同信号。",
      problemBreakdown: "当样本还很少时，把一次观察直接当成团队结论，容易把未知当成答案。",
      solution: "先记录可重复观察的事实，再给判断加上置信度；在更多样本出现前，只保留可验证的问题。",
      endingQuestion: "你会用什么信号判断一个新环境值得继续观察？",
      body: [
        "进入新环境时，最容易误读的不是工作量，而是沉默本身。一次看似普通的记录，常常会让人开始猜测团队、关系和自己的位置。",
        "更稳妥的做法，是把已经发生的事实、当下的感受和还没有证据的判断分开。样本还少的时候，不急着替一个环境下结论，也不急着把未知理解成对自己的否定。",
        "下一次可以先记录可重复观察的信号，再给判断加上置信度；在更多信息出现前，只保留一个能被验证的问题。这样既不会忽略直觉，也不会让一次经历替你决定全部答案。",
        "你会用什么信号判断一个新环境值得继续观察？",
      ].join("\n\n"),
      hashtags: ["#成长复盘", "#停止内耗", "#行动方法"],
      visualSuggestions: [
        { kind: "real_photo", count: 1, description: "不带公司标识的通勤、桌面或笔记照片，保留真实记录感。" },
        { kind: "text_card", count: 2, description: "把‘事实 / 感受 / 判断’做成两张低饱和文字卡片。" },
      ],
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

const sleepEnglishGroups: readonly { groupName: string; phrases: readonly Phrase[] }[] = [
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

const procrastinationEnglishGroups: readonly { groupName: string; phrases: readonly Phrase[] }[] = [
  { groupName: "承认自己在拖延", phrases: [
    ["I keep putting it off.", "我一直把它往后拖。"], ["I know I need to start.", "我知道自己需要开始。"], ["I am avoiding the first step.", "我在逃避第一步。"], ["The task feels bigger than it is.", "这件事感觉比实际更难。"], ["I have been making excuses.", "我一直在找借口。"], ["I lost another hour to my phone.", "我又把一个小时耗在手机上了。"], ["I am waiting to feel ready.", "我在等自己准备好。"], ["I keep changing the plan.", "我一直在改计划。"], ["I want to stop delaying this.", "我想停止拖延这件事。"], ["I need a smaller starting point.", "我需要一个更小的开始。"],
  ] },
  { groupName: "开始一个小步骤", phrases: [
    ["I will work on it for ten minutes.", "我先做十分钟。"], ["Let me open the file first.", "我先把文件打开。"], ["I only need to do the next step.", "我只需要做下一步。"], ["I can make a rough first draft.", "我可以先写一个粗稿。"], ["I will put my phone away.", "我会把手机放到一边。"], ["I am starting before I feel motivated.", "我会在有动力之前先开始。"], ["This does not have to be perfect.", "这不必一开始就完美。"], ["I can ask for help if I get stuck.", "卡住时我可以求助。"], ["I will set a short timer.", "我会设一个短计时器。"], ["Starting is enough for now.", "现在先开始就够了。"],
  ] },
  { groupName: "解释进度和边界", phrases: [
    ["I am making slow progress.", "我进展得比较慢。"], ["I need a little more time.", "我还需要一点时间。"], ["I will send you a rough version today.", "我今天会发你一个粗稿。"], ["I am focusing on one thing at a time.", "我在一次专注一件事。"], ["Could we move the deadline slightly?", "我们可以稍微调整截止时间吗？"], ["I do not want to promise too much.", "我不想做过多承诺。"], ["I will update you after this step.", "完成这一步后我会更新你。"], ["I found the part that was blocking me.", "我找到卡住我的部分了。"], ["I am back on track now.", "我现在回到正轨了。"], ["Thanks for giving me room to finish.", "谢谢你给我完成的空间。"],
  ] },
  { groupName: "处理分心", phrases: [
    ["I need to remove a few distractions.", "我需要先移除几个干扰。"], ["I will check messages later.", "我晚点再看消息。"], ["I am closing the extra tabs.", "我要关掉多余的标签页。"], ["A short break will help me reset.", "短暂休息能帮我重新集中。"], ["I am working in a quiet place.", "我在安静的地方工作。"], ["I keep a note for random ideas.", "我会把突然的想法记下来。"], ["I do not need to answer everything now.", "我不必现在回复所有事情。"], ["I am protecting this focus time.", "我在保护这段专注时间。"], ["I will take a real break after this.", "做完这件事后我会真正休息。"], ["My attention is coming back.", "我的注意力正在回来。"],
  ] },
  { groupName: "完成之后复盘", phrases: [
    ["I finished more than I expected.", "我完成的比预想更多。"], ["The hardest part was starting.", "最难的是开始。"], ["I should have asked sooner.", "我本可以早点求助。"], ["I learned what makes me delay.", "我发现了让我拖延的原因。"], ["Next time I will start earlier.", "下次我会早点开始。"], ["A simple plan worked better.", "简单的计划效果更好。"], ["I will leave a note for tomorrow.", "我会给明天留一张便签。"], ["I am proud that I kept going.", "我很庆幸自己坚持下来了。"], ["Progress feels better than pressure.", "进展比压力更让人舒服。"], ["I can do the next small thing.", "我可以继续做下一件小事。"],
  ] },
];

const socialBatteryEnglishGroups: readonly { groupName: string; phrases: readonly Phrase[] }[] = [
  { groupName: "描述社交电量", phrases: [
    ["My social battery is running low.", "我的社交电量快没了。"], ["I need some quiet time.", "我需要一点安静时间。"], ["I have had a very social day.", "我今天社交很多。"], ["I am happy to be here, just tired.", "我很开心来这里，只是有点累。"], ["I need a moment to recharge.", "我需要一点时间充电。"], ["Small talk takes energy today.", "今天寒暄很消耗能量。"], ["I am feeling more quiet than usual.", "我今天比平时更安静。"], ["I want company without talking much.", "我想有人陪，但不太想说话。"], ["I am comfortable with a slower evening.", "我更喜欢今晚慢一点。"], ["My energy comes and goes.", "我的精力时高时低。"],
  ] },
  { groupName: "礼貌地拒绝邀约", phrases: [
    ["Can we do this another day?", "我们可以改天吗？"], ["I need a quiet night tonight.", "我今晚需要安静一点。"], ["I am going to pass this time.", "这次我就先不去了。"], ["Thank you for inviting me.", "谢谢你邀请我。"], ["I would love to join next time.", "下次我很愿意参加。"], ["I do not have the energy for a crowd.", "我没有精力应付人群。"], ["Could we keep it short?", "我们可以简单一点吗？"], ["I need to leave early today.", "我今天需要早点离开。"], ["I hope you have a great time.", "希望你们玩得开心。"], ["I will check in tomorrow.", "我明天再联系你。"],
  ] },
  { groupName: "在场但不勉强自己", phrases: [
    ["I am listening even if I am quiet.", "即使我安静，我也在听。"], ["I may not talk much tonight.", "我今晚可能不会说太多。"], ["I am glad to see you.", "我很高兴见到你。"], ["I need a short pause.", "我需要短暂休息一下。"], ["Let me take this in slowly.", "让我慢慢消化一下。"], ["I am here, just taking it easy.", "我在这里，只是想放松一点。"], ["I will join the next conversation.", "我会加入下一段聊天。"], ["I appreciate the calm moments.", "我很珍惜安静的时刻。"], ["I do not have to perform tonight.", "今晚我不必一直表现得很热络。"], ["Being present is enough.", "在场就已经足够了。"],
  ] },
  { groupName: "表达自己的需要", phrases: [
    ["I need a little personal space.", "我需要一点个人空间。"], ["Could we talk somewhere quieter?", "我们可以去安静一点的地方聊吗？"], ["I need time to think before I reply.", "我需要想一想再回复。"], ["Please do not take my silence personally.", "请不要把我的沉默当成针对你。"], ["I will tell you when I am ready.", "准备好时我会告诉你。"], ["I care about this conversation.", "我很在意这次谈话。"], ["I just need to slow down.", "我只是需要慢下来。"], ["I want to be honest about my energy.", "我想诚实说说我的精力状态。"], ["A little notice would help me prepare.", "提前告诉我会更方便准备。"], ["I can meet you halfway.", "我可以和你互相配合。"],
  ] },
  { groupName: "恢复和重新连接", phrases: [
    ["I feel more like myself now.", "我现在感觉更像自己了。"], ["A quiet morning helped a lot.", "一个安静的早晨帮了我很多。"], ["I am ready to catch up.", "我准备好叙叙旧了。"], ["Thanks for giving me time.", "谢谢你给我时间。"], ["I missed talking to you.", "我想念和你聊天。"], ["Let us keep it simple today.", "今天我们简单一点。"], ["I have more energy this afternoon.", "我今天下午精力多一些。"], ["I am glad we waited.", "我很庆幸我们等了一等。"], ["Small moments help me recharge.", "小小的时刻能帮我充电。"], ["I am happy to be connected again.", "我很开心我们又联系上了。"],
  ] },
];

const topicProfiles: readonly { match: RegExp; groups: readonly { groupName: string; phrases: readonly Phrase[] }[]; positioning: string; visual: string[] }[] = [
  { match: /拖延|拖着|启动困难/u, groups: procrastinationEnglishGroups, positioning: "用五个场景拆开拖延：识别、启动、沟通、专注和复盘。", visual: ["使用清爽的纸张、计时器和待办清单视觉", "每页突出一个可立刻开口的动作"] },
  { match: /社交电量|社恐|独处|社交疲惫/u, groups: socialBatteryEnglishGroups, positioning: "从社交电量出发，练习表达状态、边界与重新连接。", visual: ["使用低饱和室内和耳机视觉", "每页保留安静留白，突出边界表达"] },
  { match: /熬夜|睡|晚睡/u, groups: sleepEnglishGroups, positioning: "从熬夜后的真实生活场景出发，覆盖描述状态、工作交流和调整作息。", visual: ["使用低饱和蓝灰夜色", "每页突出一个生活场景"] },
  { match: /打工|上班|职场/u, groups: procrastinationEnglishGroups, positioning: "把日常工作中的表达拆成五个可复用场景。", visual: ["使用桌面、会议和通勤的真实照片", "每页突出一个工作动作"] },
  { match: /吃货|美食|月底吃土/u, groups: socialBatteryEnglishGroups, positioning: "从点餐、分享和满足感出发，练习轻松生活英语。", visual: ["使用食物细节和手写菜单视觉", "每页突出一个生活场景"] },
];

export class MockEnglish50Generator implements EnglishGenerator {
  async generate(input: Parameters<EnglishGenerator["generate"]>[0], options?: AiCallOptions) {
    assertNotAborted(options);
    const topic = input.topic.trim();
    if (!topic) throw new Error("English topic is required");
    const profile = topicProfiles.find((candidate) => candidate.match.test(topic));
    if (!profile) {
      throw new PipelineGuardError("UNSUPPORTED_MOCK_TOPIC", "演示模式支持拖延症、社交电量、熬夜、打工人和吃货主题");
    }
    const groups = profile.groups.map((group) => ({
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
      positioning: profile.positioning,
      groups,
      titles,
      recommendedTitle: titles[0],
      body: `这组表达按五个真实场景整理：${groups.map((group) => group.groupName).join("、")}。每页十句，建议先挑最符合自己状态的句子朗读，再换成自己的真实信息练习。`,
      hashtags: topic.includes("社交") ? ["#社交电量", "#生活英语", "#边界表达"] : topic.includes("拖延") ? ["#拖延症", "#生活英语", "#行动表达"] : ["#生活英语", "#英语口语", "#碎片时间学习"],
      fivePageLayout: groups.map((group, index) => ({
        pageNumber: index + 1,
        groupNumber: index + 1,
        headline: group.groupName,
        visualSuggestion: profile.visual[index % profile.visual.length] ?? "低饱和生活场景插画，配一个对应情绪表情",
      })),
      visualSuggestions: profile.visual,
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
      hook: `有些${primary.primaryEmotion}不是脆弱，而是提醒你停下来看看真正的需要。`,
      endingQuestion: "你最近有没有一种情绪，其实是在提醒你重新照顾自己？",
      body: [
        `有些${primary.primaryEmotion}并不会在热闹结束后立刻消失。它更像一种提醒：眼前的感受还没有被认真看见，内心真正需要的也尚未被说清。`,
        `与其急着把情绪压下去，不如先辨认它发生在什么场景，又牵动了怎样的心理冲突。${primary.resonanceReason}理解这一点，不是为了停留在感受里，而是为了把注意力带回自己能够选择的部分。`,
        "可以先写下一句此刻最真实的需要，再做一件足够小的照顾自己的事。等情绪不再占据全部视线，我们才更容易决定要沟通、离开，还是给关系新的边界。真正的治愈不是忘记，而是不再让同一种疼痛替自己做所有决定。",
      ].join("\n\n"),
      hashtags: ["#情绪共鸣", `#${primary.primaryEmotion}`, "#自我理解", "#成年人情绪"],
      themes,
      goldenQuotes: [
        "情绪不是答案，但它会提醒你去寻找真正的问题。",
        "先把感受放回自己身上，再决定要不要向别人解释。",
      ],
      visualSuggestions: [
        { kind: "real_photo", count: 1, description: "一张安静的窗边、夜路或手部照片，保留具体生活感。" },
        { kind: "text_card", count: 2, description: "用两张留白文字卡片承接情绪与可执行的小动作。" },
      ],
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
