import { EnglishWritingSchema, type EnglishWorkflowInput } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";

// Newly authored MVP samples, not recycled from the old account library.
// Explicit offline demo data: never label these as live model responses.
const examples: Record<string, { groups: string[]; intro: string; lines: string }> = {
  "尴尬时刻英语50句": {
    groups: ["认错人了", "嘴比脑子快", "小失误现场", "聊天突然冷场", "轻松翻篇"],
    intro: "认错人、叫错名字、笑点没跟上，尴尬现场也能用一句简单英语接住。",
    lines: `Sorry, I thought you were someone else.|不好意思，我认错人了。
Have we met before?|我们以前见过吗？
You look really familiar.|你看着好眼熟。
Oh, wrong person!|啊，认错人了！
I was waving at my friend.|我刚才是在跟朋友招手。
I forgot your name. Sorry!|抱歉，我忘记你的名字了！
Could you remind me of your name?|能再告诉我一下你的名字吗？
I mixed up your names.|我把你们的名字搞混了。
I didn't recognize you at first.|我一开始没认出你。
Let's start over. I'm Alex.|重新认识一下吧，我叫Alex。
That came out wrong.|我刚才没表达好。
That's not what I meant.|我不是那个意思。
Let me try that again.|让我重新说一遍。
I spoke too soon.|我话说早了。
Did I just say that out loud?|我刚才把心里话说出来了？
Sorry, I lost my train of thought.|不好意思，我突然忘记说到哪儿了。
I can't find the right word.|我一下子想不到该用什么词。
My brain isn't working today.|我今天脑子不太在线。
I meant Tuesday, not Thursday.|我说的是周二，不是周四。
Can we pretend I didn't say that?|能当我刚才没说过吗？
Oops, that was me.|哎呀，是我弄的。
I pushed instead of pulled.|我把拉门当成推门了。
Is this seat taken?|这个座位有人吗？
I think I'm in the wrong room.|我好像走错房间了。
Sorry, my phone wasn't on silent.|抱歉，我手机没调静音。
I spilled a little water.|我不小心洒了点水。
Do you have a tissue?|你有纸巾吗？
There's something on my face, isn't there?|我脸上是不是沾东西了？
My camera was on the whole time?|我的摄像头一直开着？
I forgot to unmute myself.|我忘了开麦。
Sorry, I missed the joke.|不好意思，我没听懂那个笑话。
Was that a joke?|你刚才是在开玩笑吗？
I laughed at the wrong moment.|我笑得有点不是时候。
Well, this is awkward.|嗯，这就有点尴尬了。
I wasn't sure how to respond.|我刚才不知道怎么接话。
What were we talking about?|我们刚才聊到哪儿了？
Did you say something?|你刚才说话了吗？
Sorry, go ahead.|不好意思，你先说。
We both started talking at once.|我们俩同时开口了。
So, how's your day going?|对了，你今天过得怎么样？
No worries. It happens.|没事，谁都会遇到。
I've done that too.|我也干过这事。
Let's just move on.|咱们翻篇吧。
Nobody noticed. You're fine.|没人注意到，没事的。
That could have been worse.|还好，没尴尬到最坏的地步。
I'll laugh about this later.|过阵子想起来我肯定会笑。
Thanks for being cool about it.|谢谢你没放在心上。
At least we have a funny story now.|至少现在有个好笑的故事了。
Let's keep this between us.|这事就咱们知道就好。
Okay, take two!|好，重来一遍！`,
  },
  "拒绝别人英语50句": {
    groups: ["婉拒邀请", "守住时间", "不接额外任务", "表达个人边界", "拒绝后也友好"],
    intro: "不想去的聚会、排满的周末、不方便帮的忙，都可以好好说不。",
    lines: `Thanks, but I'll pass.|谢谢，不过这次我就不参加了。
I can't make it tonight.|我今晚去不了了。
I'm staying in this weekend.|这周末我想待在家。
That sounds fun, but I'm busy.|听着挺有意思，但我没空。
Not this time, sorry.|抱歉，这次不行。
I'd rather have a quiet night.|我更想安静地过个晚上。
I'm not up for a party today.|我今天不太想参加聚会。
Thanks for thinking of me.|谢谢你还想着我。
I'll sit this one out.|这次我就不凑热闹了。
Maybe another time.|换个时间吧。
I don't have time right now.|我现在没有时间。
My schedule is full this week.|我这周已经排满了。
I need to leave by six.|我六点前得走。
I can't stay any longer.|我不能再待了。
Today doesn't work for me.|今天对我来说不太方便。
I'm taking a break from calls.|我想暂时歇一歇，不接电话。
I need some time to myself.|我需要一点自己的时间。
I won't be available tomorrow.|我明天没空。
Can we keep this short?|我们能简单聊一下吗？
I have other plans.|我另有安排。
I can't take on anything else.|我没法再接别的事了。
That's more than I can handle.|这超出我能处理的范围了。
I can't promise that deadline.|我没法保证那个截止时间。
I'm already working on something urgent.|我已经在忙一件急事了。
I won't be able to help today.|我今天帮不了忙。
You'll need to ask someone else.|你得问问其他人了。
I don't have the skills for that.|这方面我还不会。
I can help for ten minutes only.|我只能帮十分钟。
That isn't part of my role.|那不属于我的工作范围。
I need to finish my own work first.|我得先做完自己的工作。
I'm not comfortable with that.|那样做我不太舒服。
I'd rather not talk about it.|这件事我不太想聊。
That's a bit too personal.|这个问题有点太私人了。
Please don't share my photo.|请不要分享我的照片。
I don't lend out my laptop.|我的笔记本电脑不外借。
I'd like to decide for myself.|我想自己做决定。
I'm not ready to say yes.|我还没准备好答应。
No, that doesn't work for me.|不行，那不适合我。
I don't want to explain further.|我不想再多解释了。
Please respect my decision.|请尊重我的决定。
I hope you understand.|希望你能理解。
It's nothing personal.|不是针对你。
I'm glad you asked, though.|不过，还是很高兴你问了我。
I hope it goes well.|希望事情顺利。
Let's find another way.|我们想想别的办法吧。
Coffee next week instead?|要不下周一起喝咖啡？
I can send you a useful link.|我可以发你一个有用的链接。
Thanks for understanding.|谢谢你的理解。
Let me know how it turns out.|到时候告诉我结果怎么样。
I'll catch up with you soon.|过几天再找你聊。`,
  },
  "夸人英语50句": {
    groups: ["夸穿搭和品味", "肯定认真付出", "夸能力和想法", "看见温柔细节", "接住对方的进步"],
    intro: "夸人不用只会 good。看到对方具体做了什么，一句简单英语就很真诚。",
    lines: `That color looks great on you.|这个颜色很衬你。
I love your jacket.|我好喜欢你的外套。
You've got great taste.|你眼光真好。
Your outfit works so well together.|你这身搭得真好看。
Those shoes are really cool.|那双鞋真酷。
Your haircut suits you.|这个发型很适合你。
You make it look so easy.|你穿起来感觉毫不费力。
Where did you find that bag?|这么好看的包你在哪儿买的？
That's such a nice photo.|这张照片拍得真好。
Your room feels really cozy.|你的房间让人觉得好舒服。
You worked really hard on this.|看得出来你在这上面下了功夫。
I can see how much you care.|我能看出来你有多用心。
Thanks for paying attention to the details.|谢谢你连细节都考虑到了。
You didn't give up. That's impressive.|你没有放弃，真的很棒。
You put a lot of thought into it.|你为这件事想得很周到。
I appreciate the effort you made.|我很感谢你的付出。
You handled that really well.|你把那件事处理得很好。
That must have taken a lot of patience.|那一定需要很大的耐心。
You showed up when it mattered.|关键时刻你在，真好。
Your hard work really shows.|你的努力大家都看得到。
That's a smart idea.|这个想法真不错。
You're good at explaining things.|你很会把事情讲明白。
I never thought of it that way.|我以前没从这个角度想过。
You ask really good questions.|你提的问题很到位。
You picked that up quickly.|你学得好快。
Your timing was perfect.|你把时机拿捏得刚刚好。
You've got a good eye for detail.|你很善于发现细节。
That was a creative solution.|这个解决办法很有创意。
You make the team better.|有你在，团队变得更好了。
I'd love to learn that from you.|这方面我真想向你学学。
You're a really good listener.|你真的很会倾听。
That was kind of you.|你这样做真贴心。
You made me feel welcome.|你让我觉得很自在。
You always remember the little things.|你总能记住那些小细节。
I feel comfortable around you.|跟你相处我很放松。
You know how to cheer people up.|你很会让人开心起来。
Thanks for checking on me.|谢谢你关心我的情况。
You have a great sense of humor.|你真的很有幽默感。
That message made my day.|你那条消息让我开心了一整天。
You're easy to talk to.|跟你聊天很轻松。
You've come a long way.|你已经进步很多了。
You're getting better at this.|这件事你做得越来越好了。
That took courage.|这需要勇气，你做到了。
You should be proud of yourself.|你可以为自己感到骄傲。
I noticed the progress you made.|我有看到你的进步。
You sound more confident now.|你现在说话自信多了。
That was a big step.|这是很重要的一步。
You did better than you think.|你比自己以为的做得更好。
I'm happy for you.|我真为你高兴。
Keep going. It's working.|继续吧，你的努力在见效。`,
  },
};

export function demoEnglishWriting(input: EnglishWorkflowInput) {
  const sample = examples[input.topic];
  if (!sample) throw new AppError(409, "REAL_AI_REQUIRED", "离线 Demo 仅提供三个新主题；任意主题请配置服务端真实 AI。");
  const subject = input.topic.replace(/英语50句$/, "");
  const titles = [`${subject}时能直接用的50句英语`, `每天学10句｜${subject}英语合集`, `不只会说 good｜${subject}的简单表达`, `收藏慢慢学：${subject}英语50句`, `五个生活场景，学会用英语聊${subject}`];
  if (subject !== "夸人") titles[2] = `一句就能接住场面｜${subject}英语`;
  return EnglishWritingSchema.parse({
    ...input, analysis: `${sample.intro} 按五个生活场景分组，短句为主，适合 A2–B1 学习者。离线样稿不随语气选项改写。`,
    groupNames: sample.groups,
    sentences: sample.lines.split("\n").map((line, index) => {
      const [english, chinese] = line.split("|");
      return { number: index + 1, english, chinese };
    }),
    titles, title: titles[0],
    body: `${sample.intro}\n\n这次整理了50句${subject}时用得上的英语，分成5页，每天挑10句读一读。中文用日常说话的方式理解，不用逐字背。\n\n你最想先用哪一句？`,
    tags: ["#英语学习", "#实用英语", "#英语口语", "#碎片化学习", "#每天学英语", "#生活英语"],
  });
}
