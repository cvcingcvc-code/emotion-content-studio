# DEMO V1 演示指南 · Emotion Content Studio / Growth Loop

> 这份文档是演示前**唯一需要读**的东西：怎么起、按什么顺序点、8 个亮点是什么、
> 「下一轮真的读了上一轮的反馈」去哪证明、有哪些已知限制、出问题怎么恢复。
>
> 状态：**DEMO V1 已封板**。分支 `feature/content-growth-loop`，未 commit / 未 push。

---

## 0. 30 秒介绍

**Emotion Content Studio** 是一个内容增长闭环工作台。它不做两件事：不自动发布、不抓取平台数据；
它做的一件事是——**把「发出去之后发生了什么」变成「下一篇怎么写」**。

30 秒口播：

> 很多人做内容卡在同一件事上：发完就过去了，下一篇还是凭感觉。
> 这个系统把流程固定成一条闭环：**记录真实经历 → 找到内容机会 → 生成 → 人工审核 → 手动发布 →
> 手动录指标 → 得到 KEEP / CHANGE / NEXT_EXPERIMENT 结论 → 这条结论作为「学习」进入下一篇的生成上下文**。
> 关键不是生成了什么，而是**下一篇生成时，真的读到了上一篇的结论**——这一点在页面上、在数据里都能查。
> 而且它很克制：证据不足时它会说「样本不够，不判定」，而不是编一个赢家出来。

---

## 1. 启动

```bash
export PATH="/c/Users/lin/.workbuddy/binaries/node/versions/22.22.2-3:/usr/bin:/bin:/mingw64/bin:$PATH"
cd "C:/Users/lin/Documents/ChatGPT/情绪灵感库/emotion-content-studio"
npm run dev
```

- Web：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:8787>

默认就是**完全离线**的演示配置：

| 变量 | 默认 | 含义 |
|---|---|---|
| `AI_PROVIDER` | `mock` | 不调用任何外部模型，全部是确定性离线规则 |
| `CONTENT_REPOSITORY` | `memory` | 内存仓储：**重启 API 后增长闭环记录会清空**（英语工作流原有的本地文件仍保留） |

> ⚠️ 内存模式是演示特性不是缺陷：演示前重启一次 API，就能拿到干净的起始状态。
> 需要持久化时再配 `DATABASE_URL`，并显式执行 `packages/database/migrations/` 下的迁移（应用不会自动改表）。

---

## 2. Demo Flow（按这个顺序点）

| # | 页面 | 动作 | 观众应该看到 |
|---|---|---|---|
| 1 | `/` | 点**「加载7篇离线演示数据」** | 3 成长 + 3 英语 + 1 情感；`NEXT 3 POSTS`、`账号策略`面板。**重复点击不会重复加入，也不调用模型** |
| 2 | `/retrospectives` | 写一段真实经历 → **保存复盘** → **分析复盘** | 「事实 · 来自你的原始记录」与「推断 · 待验证，不是事实」严格分区；`内容潜力 8/10`；出现**「已发现内容机会 → 创建内容」** |
| 3 | `/create` | 选账号 / 类型 / 主题 → **生成内容 →** | **「内容创建成功！」**，可「立即进入内容审核 →」 |
| 4 | `/growth-content/:id` | 点**「生成内容」** | 页面顶部出现**「上一轮的学习 → 本轮生成的输入（N 条）」**（这就是闭环的证据，见 §4） |
| 5 | 同上 | 改标题 / 正文 → **通过审核 →** → 填发布时间 → **标记为已发布** | 状态流转 review → ready → published；发布是**手动记录时间**，系统不自动发布 |
| 6 | 同上 | 录 views/likes/favorites/comments/followersGained → **保存流量** → **Analyze Performance** | `KEEP / CHANGE / NEXT EXPERIMENT` + 「结论 / 置信度」+ 相对同窗口中位数 + 发布后小时数 |
| 7 | — | 再发 3–5 篇同类内容，建立同账号同窗口基线 | 前 3 篇结论是 `INSUFFICIENT_EVIDENCE`——**这是设计**，样本 <3 不判定 |
| 8 | — | 做 1 篇明显高于中位数、1 篇明显低于中位数 | 分别得到 `KEEP` / `CHANGE`（含相对表现 +500% / −90% 这类数字） |
| 9 | `/` → 进入下一篇生产 → 生成 | | 顶部面板列出上一轮的 `KEEP / CHANGE`——**闭环合上** |
| 10 | `/performance`、`/history` | 浏览 | 反馈历史、指标历史、内容历史 |
| ★ | `/growth-content/:id`（审核阶段） | **预览发布效果 →** → **导出当前页** | 3:4 卡片预览 + 导出 **900 × 1200 PNG**（服务端渲染，离线可用） |

**关于「结束本轮实验」**：在已发布内容的反馈区可以对本轮唯一实验做收口——
`升级为长期策略`（样本达标才行）、`证据不足，继续测试`、`否决该取值，不再自动提议`。
选「继续测试」后实验**保持开放**、可以继续累积样本（不会一次就锁死）。
审核区还有**「拒绝理由」+「标记为已拒绝」**：拒绝本身就是学习信号，被拒内容不进任何指标口径。

---

## 3. 八个核心亮点

1. **事实 / 推断分离 + 可追溯守卫**
   `facts` 必须逐字出现在用户原始输入里，模型推断被写回成事实会被**代码剔除**。
   「今天没发生什么」不会被强行解读成内容机会。（`retrospective.ts` · `facts.test.ts` 5 例）
2. **内容潜力必须先达标**
   规则评分 < 6 时，系统**明确拒绝生产**并说明原因，而不是硬生成一篇空内容。
   新版复盘只有一个正文框，评分与「困扰 / 反应 / 经验」句子的抽取都直接看正文（§Post-Demo 第 5 条）。
3. **账号策略记忆（Strategy Memory）**
   同一 `(account, key)` **只能有一个 active**；一次修改或一条数据只算弱信号，
   不会直接升级成长期策略。（`strategy.ts` · `strategy.test.ts` 6 例）
4. **唯一变量实验（Experiment）**
   结构化的 `hypothesis / variable / variant / baseline / targetMetric / requiredSamples`；
   `question → statement` 这类改写是**代码确定性执行**的，**与用哪个模型无关**——
   否则「实验影响生成」就只存在于 prompt 文本里。（`provider.ts` · `provider.test.ts` 9 例）
5. **Generation Context v3：真正读取上一轮反馈**
   生成上下文新增 `learnings` 分区，prompt 版本号 `growth-loop.v3`，并把实际用到的反馈
   写进 `GenerationDebug.feedbackUsed[]` 持久化。（`learning.ts` · `generation-context.ts`）
6. **证据分级，拒绝编造赢家**
   结论只有 `KEEP / WATCH / CHANGE / NEXT_EXPERIMENT / INSUFFICIENT_EVIDENCE` 五种；
   基线用**中位数**（不是平均值），并按**同账号 + 同时间窗口（24h/72h）+ 同性质**取样；
   样本 <3 直接标 `comparable=false`，不给结论。因果措辞被拆开：
   `observation` 是事实、`hypothesis` 前缀「假设，尚未验证」、`evidence` 结尾「相关不等于因果」。
7. **人工修改与拒绝也是学习信号**
   审核时改写标题/正文会检测出偏好信号（`preferenceSignal`）；
   「事实错误」的拒绝会写成 `avoid` + **HIGH** 的强负面策略，影响后续生成。
8. **卡片可预览、可导出**
   服务端渲染 3:4 卡片，导出 900 × 1200 PNG。全程离线，不依赖外网。

---

## 4. 「Generation #2 真的读了上一轮反馈」——去哪证明

这是整个演示最该被验证的一句话。**四个层次都可以查**：

**① 页面上（给观众看）**
`/growth-content/:id` 顶部面板：**「上一轮的学习 → 本轮生成的输入（N 条）」**，
逐条列出 `verdict（置信度）· 反馈原文`，并写明筛选规则。

**② 数据里（给质疑的人看）**

```bash
curl -s http://127.0.0.1:8787/api/v1/growth-loop \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log(JSON.stringify(d.contents.filter(c=>c.debug).map(c=>({title:c.title,v:c.debug.promptVersion,learnings:c.debug.feedbackUsed.map(f=>f.verdict)})),null,1))})"
```

`PublishedContent.debug.feedbackUsed[]` 每项含
`feedbackId / contentId / source:"feedback" / verdict / confidence / createdAt / experimentId / text`。

**③ 版本与快照**

- `debug.promptVersion === "growth-loop.v3"` —— v2 及以前**不读** `ContentFeedback`
- `debug.finalGenerationContext` 是单行快照，内含 `learnings=N`
- `debug.experimentUsed` 显示本轮唯一变量（如 `hook=scene_first`）

**④ 规则与自动化证据**（`apps/api/src/growth-loop/learning.ts`）

只取「**已发布 + 同账号 + 同性质（真实/演示不混用）**」+ **30 天**内；
同一篇只保留**最新**一条；**直接上游排最前**；截断到 **3 条**；
**只有 KEEP / CHANGE 会被写成结论**，`WATCH / INSUFFICIENT_EVIDENCE` 原文不进 prompt。
回归保护：`learning.test.ts` **8 例**（含「被拒内容不产生正向学习」「演示证据不污染真实生成」「超 30 天淘汰」）。

---

## 5. 已知限制 → Post-Demo Engineering Work

> 以下都是**明确已知**的边界，不是 bug。演示时如果被问到，照实说即可。

1. **DeepSeek 真实路径未验证**（没有 API Key）。本轮所有验证都在 `AI_PROVIDER=mock`；
   provider 的行为差异由 `provider.test.ts` 锁定「与 provider 无关」的确定性部分。
2. **`packages/database/migrations/0005_strategy_memory.sql` 从未在任何数据库执行过**，
   因此 14 个需要数据库的用例处于 skipped（不是失败）。应用不会自动建表。
3. **`STRATEGY_FILTERS` 只有 1 条**（戏剧 / 夸张类，由代码真实清洗文本）。
   `title_preference` / `tone_intensity` / `perspective` 三类目前**只进 prompt**，没有确定性约束。
4. `deactivateStrategy` 没有生产调用方；`testing` / `unknown` 两个策略分类没有生产者。
5. **离线规则生成器写不出「备选做法」**：新版复盘只有一个正文框时，
   分析里的「可以更好的做法 / 下一步动作」会用中性提示文案
   （正文里的**困扰、当时的反应、经验**已经能被正确抽取并显示）。
   接真实模型后这部分由模型补全。
6. **内存仓储**：重启 API 后增长闭环记录清空（英语工作流原有本地文件仍在）。
7. `apps/api/src/growth-loop/smoke.ts` 是**旧版 6 栏表单**写法的脚本，尚未同步到新 UI；
   不影响产品，当前浏览器回归用的是 `.tmp-check/walk.ts`（见 §6）。

---

## 6. 恢复 / 排障

**演示前要干净状态**：重启 API 即可（内存仓储）。

```bash
# 触发 tsx watch 重启，或直接 Ctrl+C 后重跑 npm run dev
touch apps/api/src/growth-loop/service.ts
```

**页面报 500 且日志出现 `ZodError: Unrecognized key ...`**
→ 改了 `packages/contracts/src/**` 但没构建。运行时读的是 `dist`，`typecheck` 读的是 `src`：

```bash
npm run build -w @emotion-studio/contracts
```

**跑一遍完整浏览器回归**（约 40 秒，走完 §2 的第 1–10 步，含 PNG 导出）
——需先 `npm run dev`：

```bash
npx tsx .tmp-check/walk.ts
```

> `.tmp-check/` 是**未纳入版本管理**的临时目录：`walk.ts` 是浏览器回归脚本，`shots/` 是它的截图。
> 它不进 git，也不影响演示；删掉只是丢掉这个脚本，产品不受影响。

它会断言：`KEEP / CHANGE / NEXT_EXPERIMENT` 都出现在下一轮的 `feedbackUsed`、
直接上游排第一、`promptVersion` 是 v3、页面面板显示学习结果、**演示数据不泄漏到真实生成**。

**工程门禁**（全绿才算封板）：

```bash
npm run typecheck   # EXIT=0
npm test            # EXIT=0
npm run build       # EXIT=0
npm run check       # typecheck && test && build
git diff --check    # EXIT=0
```

**三条禁令**：不要 `git checkout .` / `git restore .`（工作区改动就是全部成果）；
不要动仓库里那个**别人的 stash**（来自 `codex/persistence-ai-foundation`）；
不要删 `*.bat` / `*-workspace.css` / `DEMO_STATUS.md`。

---

## 7. 关键源码位置

| 想了解什么 | 读哪里 |
|---|---|
| 生成上下文的唯一组装入口 | `apps/api/src/growth-loop/generation-context.ts` |
| 反馈 → 学习的选择规则 | `apps/api/src/growth-loop/learning.ts` |
| 完成度 / 指标 / 结论判定 | `apps/api/src/growth-loop/feedback.ts`、`metrics.ts` |
| 复盘分析与事实守卫 | `apps/api/src/growth-loop/retrospective.ts` |
| 实验与策略的确定性落地 | `apps/api/src/growth-loop/provider.ts` |
| 全部契约的唯一来源 | `packages/contracts/src/growth-loop.ts` |
| 为什么会有这些改造（审计） | `docs/growth-loop-audit.md` |
| 断点交接 | `WORKBUDDY_HANDOFF.md` |
