import type { DemoLicenseStatus } from "@emotion-studio/contracts";
import type { ContentAnalyzer } from "./analyzer.js";
import { legacyContentFields, type NewContentItem } from "./repository.js";

interface DemoSeed {
  content: string;
  likes: number;
  licenseStatus?: DemoLicenseStatus;
}

const demoSeeds: DemoSeed[] = [
  { content: "我把没说出口的喜欢，收进了那天傍晚的风里。", likes: 936 },
  { content: "分手以后才明白，想念和适合原来是两件事。", likes: 1520 },
  { content: "暗恋像一盏只照向自己的小灯，明亮，也安静。", likes: 874 },
  { content: "遗憾不是故事没有结尾，而是我们都曾提前离场。", likes: 2100 },
  { content: "那句没来得及说的谢谢，被我记了很多年。", likes: 648 },
  { content: "错过一班车可以等，错过坦诚有时要绕很远。", likes: 1180 },
  { content: "我不再追问告别的理由，只把答案留给时间。", likes: 755 },
  { content: "如果当时更勇敢，也许现在会是另一种天气。", likes: 1660 },
  { content: "夜深以后，空房间把每个细小声音都放大了。", likes: 1320 },
  { content: "一个人吃晚饭并不可怕，可怕的是忘了照顾自己。", likes: 980 },
  { content: "孤独并不总是灰色，它也给思绪留出了座位。", likes: 1880 },
  { content: "独处的周末，我终于听清了心里真正的需要。", likes: 620 },
  { content: "回家的灯亮着，今天的疲惫就有了可以放下的地方。", likes: 1440 },
  { content: "妈妈没问我赢没赢，只问路上有没有好好吃饭。", likes: 2350 },
  { content: "长大后才懂，家人的惦记常常藏在普通问题里。", likes: 1720 },
  { content: "团圆不是坐得多整齐，而是彼此都愿意慢一点。", likes: 860 },
  { content: "真正的朋友不会替你决定，却会陪你走完犹豫。", likes: 1260 },
  { content: "老友见面没有开场白，沉默也知道该放在哪里。", likes: 1940 },
  { content: "友情最可靠的部分，是各自忙碌后仍能认真回应。", likes: 740 },
  { content: "我们并肩走过低谷，所以不必用热闹证明亲近。", likes: 1100 },
  { content: "成长是学会承认害怕，然后仍然做出选择。", likes: 2250 },
  { content: "改变不需要隆重宣布，今天比昨天向前一步就好。", likes: 1370 },
  { content: "我开始允许计划落空，也允许自己重新出发。", likes: 1680 },
  { content: "勇敢不是没有眼泪，而是擦干以后还愿意相信。", likes: 2440 },
  { content: "生活偶尔会打乱顺序，但不会拿走重新整理的能力。", likes: 920 },
  { content: "清晨把窗帘拉开，阳光先替我完成了一次深呼吸。", likes: 1010 },
  { content: "下班路上的晚风很轻，提醒我今天已经足够努力。", likes: 1540 },
  { content: "日子不必每天精彩，稳定地过好也值得庆祝。", likes: 1310 },
  { content: "难过的时候先别责怪自己，心也需要休息。", likes: 2020 },
  { content: "眼泪不是退步，它只是替情绪找到一个出口。", likes: 1760 },
  { content: "失落停在胸口时，我去楼下走了一小圈。", likes: 690 },
  { content: "有些心酸无需解释，被自己看见就已经轻了一半。", likes: 1160 },
  { content: "慢慢来不是拖延，是给脆弱留出恢复的时间。", likes: 2480 },
  { content: "愿今天的温柔，先从不为难自己开始。", likes: 2700 },
  { content: "一顿热饭、一场好觉，也能成为生活的治愈。", likes: 1850 },
  { content: "会好的不只是一件事，还有重新相信明天的你。", likes: 2210 },
  { content: "被误解时当然会生气，但我不再用愤怒惩罚自己。", likes: 830 },
  { content: "委屈不是软弱，它在提醒我边界曾被忽略。", likes: 1470 },
  { content: "面对不公平，我可以坚定，也可以保持清醒。", likes: 990 },
  { content: "快乐有时很小，只是一杯刚好温热的茶。", likes: 1250 },
];

export async function createDemoContentItems(
  analyzer: ContentAnalyzer,
  importedAt = new Date().toISOString(),
): Promise<NewContentItem[]> {
  return Promise.all(demoSeeds.map(async (seed) => {
    const analysis = await analyzer.analyze({ content: seed.content, likes: seed.likes });
    return {
      ...legacyContentFields,
      originalContent: seed.content,
      content: seed.content,
      author: null,
      likes: seed.likes,
      source: "内置演示数据",
      sourceUrl: null,
      licenseStatus: seed.licenseStatus ?? "original",
      ...analysis.data,
      isFavorite: false,
      importedAt,
    };
  }));
}
