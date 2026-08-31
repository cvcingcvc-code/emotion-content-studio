import type {
  ContentCategory,
  ContentEmotion,
  ContentItem,
} from "@emotion-studio/contracts";

export type ContentAnalysis = Pick<
  ContentItem,
  "emotion" | "emotionScore" | "resonanceScore" | "category" | "tags"
>;

export interface ContentAnalyzer {
  analyze(content: string, likes: number): ContentAnalysis;
}

interface EmotionRule {
  emotion: ContentEmotion;
  keywords: string[];
}

interface CategoryRule {
  category: ContentCategory;
  keywords: string[];
}

const emotionRules: EmotionRule[] = [
  { emotion: "愤怒", keywords: ["愤怒", "生气", "委屈", "不公平"] },
  { emotion: "遗憾", keywords: ["遗憾", "错过", "没来得及", "告别", "如果"] },
  { emotion: "孤独", keywords: ["孤独", "一个人", "独处", "空房间", "夜深"] },
  { emotion: "难过", keywords: ["难过", "眼泪", "失落", "分手", "心酸"] },
  { emotion: "爱情", keywords: ["爱", "喜欢", "心动", "暗恋", "恋人"] },
  { emotion: "开心", keywords: ["开心", "快乐", "笑", "惊喜", "明亮"] },
  { emotion: "治愈", keywords: ["治愈", "温柔", "慢慢", "拥抱自己", "会好"] },
];

const categoryRules: CategoryRule[] = [
  { category: "家庭", keywords: ["家人", "父母", "妈妈", "爸爸", "家里", "团圆"] },
  { category: "友情", keywords: ["朋友", "友情", "并肩", "老友"] },
  { category: "爱情", keywords: ["爱情", "恋人", "心动", "暗恋", "分手", "喜欢", "爱"] },
  { category: "孤独", keywords: ["孤独", "一个人", "独处", "空房间", "夜深"] },
  { category: "成长", keywords: ["成长", "勇敢", "改变", "学会", "选择", "向前"] },
  { category: "生活", keywords: ["生活", "清晨", "下班", "日子", "今天", "阳光"] },
];

function countMatches(content: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => count + (content.includes(keyword) ? 1 : 0), 0);
}

function bestMatch<T extends { keywords: string[] }>(content: string, rules: T[]): T | undefined {
  return rules
    .map((rule, index) => ({ rule, index, score: countMatches(content, rule.keywords) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.rule;
}

export class MockContentAnalyzer implements ContentAnalyzer {
  analyze(content: string, likes: number): ContentAnalysis {
    const emotionRule = bestMatch(content, emotionRules);
    const categoryRule = bestMatch(content, categoryRules);
    const emotion = emotionRule?.emotion ?? "其他";
    const category = categoryRule?.category ?? "其他";
    const keywordMatches = emotionRule ? countMatches(content, emotionRule.keywords) : 0;
    const emotionScore = Math.min(96, 58 + keywordMatches * 12 + Math.min(14, content.length / 4));
    const resonanceScore = Math.min(
      98,
      44 + Math.min(22, content.length * 0.55) + Math.min(28, Math.log10(likes + 1) * 9),
    );
    const tags = Array.from(new Set([
      category,
      emotion,
      content.includes("夜") ? "夜晚心绪" : "生活片段",
      content.includes("慢慢") || content.includes("会好") ? "自我疗愈" : "情绪共鸣",
    ])).slice(0, 4);

    return {
      emotion,
      emotionScore: Math.round(emotionScore),
      resonanceScore: Math.round(resonanceScore),
      category,
      tags,
    };
  }
}
