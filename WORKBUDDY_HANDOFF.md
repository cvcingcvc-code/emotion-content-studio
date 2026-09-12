# WORKBUDDY 交接文件

生成时间：2026-09-11（会话中断前最后一刻）
生成原因：上一模型上下文接近上限，主动停止开发并交接

> 本文件是**唯一可信**的交接文档。旧聊天记录不再可靠，请以本文件 + 磁盘代码 + Git 状态为准。
> 本次交接**只做记录，没有做任何修复**。所有已知问题原样保留在代码里。

---

## 0.0 ⚠️ 恢复轮更新（第二会话，2026-09-11 22:55 起）

> 本会话从断点恢复：读本文件 + `git status/diff` + 实跑 typecheck/test 后动手，
> **修复了 §6 阻塞 A、B，并补完 PHASE G 接线**。
> 下方 §0–§13 是原始记录，保留作历史证据；**凡与本节冲突处，一律以本节为准**。

### A. 已修复（已实跑验证）

| 原编号 | 问题 | 落点 |
|---|---|---|
| §6.1 / §7.5 #2 | `GrowthLoopPage.tsx:515` 引用已改名的 `.metric` → typecheck/build 双红 | 改为 `.targetMetric` |
| §6.2 / §7.5 #1 | `RelativePerformanceSchema` 复用带 `.nonnegative()` 的 `rate`，**相对值为负必抛 ZodError**（演示数据完全加载不了） | 新增 `const relativeRate = z.number().finite().nullable()`；四个 `relative*` 改用它，`median*` 仍用 `rate` |
| §8.4 #2 | `feedback.test.ts` 断言仍是 average 时代的 200 | `recent3.avgViews` 改为 **100**（`median(100,100,400)=100`） |
| §8.4 #5 | `repository.test.ts` 期望对象缺 `hoursSincePublish` | 期望值补 `hoursSincePublish: null` |
| **原文未识别** | `feedback.test.ts` 的 `sample()` 夹具漏了 PHASE C 新增的 `state.strategies`（其余测试文件都写了 `strategies: []`）→ 2 个用例崩在 `strategy.ts:13` 的 `state.strategies.filter` | `sample()` 补 `strategies: []`。这是**夹具缺口**，不是过时断言 |
| §6.3 / §7.5 #3 #4 | PHASE G 零接线、`preference.ts` 死代码 | 见 B |

### B. PHASE G 已接线（契约 → API → Web）

1. `service.generate()` 写入 `aiDraft = value.writing`（AI 原稿留档，review 才有可比基准）
2. `service.review()` 调 `detectPreferenceSignal(existing.aiDraft, input.writing)` → 写入 `preferenceSignal`
3. 同一步把 `preferenceProposals()` 以 `category:"watch"` + `confidence:"LOW"` + `source:"human_edit"` 写入 Strategy Memory（**一次修改不得升级**）
4. 新增 `POST /api/v1/growth-loop/contents/:id/reject`（`{ revision, reason }`）→ `status:"rejected"` + `rejectedAt` + `rejectReason`
5. 新增 `rejectStrategyProposal(reason)`：`factually_wrong` → `avoid` + **HIGH**（强负面信号）；其余 `avoid` + MEDIUM；`other` 为 LOW
6. Reject 内容不进入指标 —— 由仓储 `addMetrics`（要求 `published`）天然保证，**并已用测试锁定**
7. 前端最小入口：`GrowthContentReview` 增加「拒绝理由」下拉 + 「标记为已拒绝」按钮（有未保存修改时禁用），并支持展示 `rejected` 状态

> ✅ 正向副作用：`generation-context.ts` 的 `userPreferences()` 现在**真的会有值**（此前恒空）——§10.5「管道通但上游无水」已解决。

### C. 本轮新增文件

- `apps/api/src/growth-loop/preference.test.ts`（**5 例**）：偏好信号单元测试 + `aiDraft`/人工修改/reject 的端到端接线测试

### D. 本轮实跑结果（非预测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ **EXIT=0**（此前 1 error） |
| `npm test` | ✅ **EXIT=0**；API `15 passed / 1 skipped (16)`、`96 passed / 14 skipped (110)` |
| `npm run build` | ✅ **EXIT=0**，`vite build ✓ built in 16.02s`（此前卡在 web 的 tsc） |
| `npm run check` | ✅ **EXIT=0** —— **本仓库首次跑完整条链**（§8.7 #1 已消除） |
| `git diff --check` | ⚠️ 仍 EXIT=2，48 处 trailing whitespace（`GrowthLoopPage.tsx` 45 + `DashboardPage.tsx` 3），**非阻塞，未处理** |

### E. 仍未完成（更新后的真实清单）

1. 🔴 **§7.5 #6 / PHASE A BROKEN ① 仍未修**：`ContentFeedback`（KEEP/CHANGE/NEXT_EXPERIMENT）**依然没有生成侧读取方**。已打通的仍然只是「Strategy Memory → 生成」
2. 🔴 `deepseek` 真实路径**仍未验证**（无 API Key），全部 provider 验证都在 mock
3. 🔴 `packages/database/migrations/0005_strategy_memory.sql` **从未在任何数据库执行**
4. 🟡 `STRATEGY_FILTERS` 仍只有 1 条；`title_preference` / `tone_intensity` / `perspective` 三类**只进 prompt、无确定性约束**
5. 🟡 `deactivateStrategy` 仍无生产调用方；`testing` / `unknown` 两个 category 仍无生产者
6. 🟡 `service.decideExperiment` 选 `continue_testing` 仍把实验标成 `completed`（语义瑕疵，本轮**未改**）
7. ⚪ 48 处 trailing whitespace 未清理
8. 🟡 PHASE I：23 节 15 项测试重点仍未覆盖完，浏览器端到端/人工走查未做
9. ⚪ 未提交、未 push —— 工作区改动是本轮全部成果

### F. 本轮禁令遵守情况

未执行 `commit` / `push` / `merge` / `rebase` / `reset` / `clean` / `checkout --`；
未动 §2.7 的**别人的 stash**；未删任何 `.bat` / `*-workspace.css` / `DEMO_STATUS.md`。

---

## 0.1 ⚠️ 第三会话更新（PHASE A BROKEN ① 已修）

> 本节晚于 §0.0。**凡与 §0.0 / §0–§13 冲突处，一律以本节为准。**
> 目标：让 `ContentFeedback`（KEEP / CHANGE / NEXT_EXPERIMENT）真正进入下一轮 Generation。
> 范围严格限定在「Feedback → 生成」，**未开新 PHASE**，未 commit / push / merge / reset。

### G.1 修了什么（BEFORE → AFTER）

| | 之前（BROKEN ①） | 现在 |
|---|---|---|
| `state.feedback` 的读取方 | demo / routes / page / repository 共 4 处，**生成侧为 0** | 新增 `learning.ts`，**生成侧真正读取** |
| 上一轮结论的去向 | 写进库后没人看 | 经筛选后进入 Generation Context（`learnings`）与 provider prompt（`learningText`） |
| 可观测性 | 无 | `GenerationDebug.feedbackUsed[]` 随内容快照持久化 |
| prompt 版本 | `growth-loop.v2` | `growth-loop.v3` |

### G.2 改动文件（8 个）

后端 / 契约（7）：

1. `packages/contracts/src/growth-loop.ts` — 新增 `FeedbackUsedSchema` + `FeedbackUsed` 类型；`GenerationDebugSchema` 新增 `feedbackUsed: z.array(FeedbackUsedSchema).max(10).default([])`
2. `apps/api/src/growth-loop/learning.ts`（**新增**）— `selectLearnings` / `learningLine(s)` / `learningPrompt`；`MAX_LEARNINGS = 3`、`LEARNING_WINDOW_DAYS = 30`
3. `apps/api/src/growth-loop/generation-context.ts` — `GROWTH_PROMPT_VERSION` v2 → **v3**；`GrowthGenerationContext` 新增 `learnings` / `learningText`；`buildGenerationContext()` 新增 `sourceContentId` / `isDemo` / `now` 入参；`generationRules` 增 2 条；`contextSnapshot` 加 `learnings=`；`buildDebug` 加 `feedbackUsed`
4. `apps/api/src/growth-loop/provider.ts` — `instructions` 注入 `context.learningText`；user payload 增加 `learnings`
5. `apps/api/src/growth-loop/service.ts` — `generate()` 把 `existing.sourceContentId` / `existing.isDemo` 传给 `buildGenerationContext()`（**这两项决定「上一轮」是谁**）
6. `apps/api/src/growth-loop/learning.test.ts`（**新增**）— 8 例：6 例选择规则单测 + 2 例 e2e（Case 1/2/3/5 合并、Case 4）
7. `apps/api/src/growth-loop/provider.test.ts` — 断言 v2 → v3；新增「无历史时 `feedbackUsed` 恒为 `[]`」；`finalGenerationContext` 含 `learnings=0`

清洁度（非功能，1 类 2 文件）：

8. `apps/web/src/pages/GrowthLoopPage.tsx`（45 行）、`apps/web/src/pages/DashboardPage.tsx`（3 行）— **仅删行尾空白**，无任何逻辑改动

### G.3 Feedback → 下一轮生成的判定规则（`selectLearnings`）

1. 只取「**已发布** + **同账号** + **同性质（真实 / 演示）**」内容的 feedback → 演示证据不污染真实生成，也不跨账号串味
2. 只取 `LEARNING_WINDOW_DAYS = 30` 天内的记录 → 不把陈旧结论当现状
3. 同一篇内容**只保留最新一条** feedback（按 `contentId` 去重）
4. **直接上游**（`sourceContentId` 指向的上一篇）排最前，其余按 `createdAt` 倒序
5. 截断到 `MAX_LEARNINGS = 3` → 不把历史 feedback 全量塞给模型
6. **只有 KEEP / CHANGE 写成结论**；`WATCH` / `INSUFFICIENT_EVIDENCE` 只保留「不得当作结论」的元信息，原文不进 prompt
7. 被拒（`rejected`）内容天然没有 feedback（录指标要求 `published`）→ **不会进入正向 KEEP**

### G.4 新增测试（8 例，全绿）

| 用例 | 验证点 |
|---|---|
| Case 1 KEEP | 上一轮 KEEP 进入下一轮 `debug.feedbackUsed`，且 provider 收到的 prompt 含该结论 |
| Case 2 CHANGE | 上一轮 CHANGE 同样进入下一轮上下文 |
| Case 3 NEXT_EXPERIMENT | `experimentId` 随 learning 传递，且与 `experimentUsed` 一致 |
| Case 4 reject | 被拒 + `factually_wrong` 的内容**不产生任何正向 learning**；负面 `avoid/HIGH` 策略仍作用于生成 |
| Case 5 多条 | 多轮 feedback → 去重 / 限流 / 上游优先，结果稳定 |
| + 3 例 | 超 30 天被淘汰；演示与真实不混；空历史 → `learningPrompt` 返回空串 |

### G.5 本轮实跑结果（非预测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ **EXIT=0** |
| 定向 `npx vitest run src/growth-loop` | ✅ **EXIT=0**；**10 files / 43 passed \| 2 skipped (45)** |
| `npm test` | ✅ **EXIT=0**；API 16 files / **104 passed \| 14 skipped (118)**；web 3/24；worker 1/1；contracts 2/12；database 1+1 skip / 4 passed \| 2 skipped (6) |
| `npm run build` | ✅ **EXIT=0**；`vite build ✓ built in 9.36s` |
| `npm run check` | ✅ **EXIT=0**（清理空白前后各跑一次，均绿） |
| `git diff --check` | ✅ **EXIT=0**（原 EXIT=2 / 48 处 trailing whitespace，已清理归零） |

### G.6 ⚠️ 本轮踩到的坑（**必读**）

**`@emotion-studio/contracts` 在运行时解析到 `dist`，不是 `src`。**
`typecheck` 读 `src`（所以改完 `packages/contracts/src/growth-loop.ts` 后 typecheck 立刻通过），
但 **vitest / API 运行时读 `dist`**。若改了 contracts 源码却不 `npm run build`，
运行时会抛 `ZodError: Unrecognized key "feedbackUsed"` → `POST /contents/:id/generate` 直接 500。
→ **凡是动了 `packages/contracts/src/**`，跑测试 / 起服务前必须先 `npm run build`。**

### G.7 仍未完成（更新后的清单，接替 §0.0 E）

1. 🔴 `deepseek` 真实路径仍未验证（无 API Key），全部 provider 验证在 mock
2. 🔴 `packages/database/migrations/0005_strategy_memory.sql` 从未在任何数据库执行 → 14 个 DB 用例仍 skipped
3. 🟡 **`service.decideExperiment` 选 `continue_testing` 仍把实验标成 `completed`** —— 不只是语义瑕疵：`completed` 后 `service.ts:149` 会抛 `EXPERIMENT_COMPLETED`，**该实验再也无法被决策，等于「继续测试」这个选项不可用**
4. 🟡 `STRATEGY_FILTERS` 仍只有 1 条；`title_preference` / `tone_intensity` / `perspective` 只进 prompt、无确定性约束
5. 🟡 `deactivateStrategy` 无生产调用方；`testing` / `unknown` 两个 category 无生产者
6. 🟡 PHASE I：23 节 15 项测试重点约覆盖 6 项；浏览器端到端 / 人工走查未做
7. ⚪ 未提交、未 push —— 工作区改动是本轮全部成果

### G.8 本轮禁令遵守情况

未执行 `commit` / `push` / `merge` / `rebase` / `reset` / `clean` / `checkout --`；
未动 §2.7 的**别人的 stash**；未删任何 `.bat` / `*-workspace.css` / `DEMO_STATUS.md`；
未开新分支；未删任何测试、未降低任何测试标准。

---

## 0.2 ⚠️ 第四会话更新 —— FINAL POLISH + **DEMO V1 封板**

> 本节最新，**凡与 §0.1 / §0.0 / §0–§13 冲突处，一律以本节为准**。
> 本轮只做「让它稳定 / 可理解 / 可演示 / 可重复运行」，**未开新 PHASE**，未新增页面、未做设计系统重写。
> 未 commit / push / merge / rebase / reset。

### H.1 修了什么

| # | 问题 | 性质 | 落点 |
|---|---|---|---|
| 1 | `decideExperiment` 选 `continue_testing` 会写 `status:"completed"`，配合 `EXPERIMENT_COMPLETED` 守卫让「继续测试」**永久不可用** | 🟠 功能缺陷 | `service.ts` 的 `decideExperiment`；新增 `experiment-decision.test.ts` |
| 2 | **内容潜力永远到不了 6 分**：`analyzeRetrospective` 只数 5 个分栏，而新版复盘 UI 只有 1 个正文框 → 分数上限 3 → `createContent` **永久 409（MORE_DETAIL_REQUIRED）**，整条闭环走不下去 | 🔴 **演示阻塞** | `retrospective.ts`：分栏为空时改用正文信号计分（`detailSignals`） |
| 3 | **「内容创建成功！」永远看不到**：`act()` 成功后 `refresh+1`，`useRemote` 把 `data` 置空 → `{state ? …}` 整块卸载重挂，`CreateContent` 的 `contentCreated` 被重置（用户点完生成**像是没反应**） | 🔴 **演示阻塞** | `GrowthLoopPage.tsx`：把「已创建 id」提升到不卸载的父层 + `key` 去掉 `refresh` |
| 4 | 分析面板直接渲染契约英文键（`summary` / `recommendedAccount`…）与原始枚举（`growth` / `reflection`） | 🟡 观感 | `GrowthLoopPage.tsx`：新增 `analysisLabels` / `accountValueLabels` / `analysisValue`，未登记字段回落显示原键 |
| 5 | 新版单正文框下，「核心问题 / 当时的反应 / 经验」全部回落成占位文案（面板对着写满冲突的记录说「缺少明确的冲突」）；生成稿写出「我当时的处理：尚未补充」 | 🟡 观感 / 自相矛盾 | `retrospective.ts` 新增 `pickSentence` + `derivedRetrospectiveFields`（逐句挑选，**不改写、不新增**）；`provider.ts` 复用 |
| 6 | 下一轮学习面板是一段密排文字，看不出「反馈如何影响本轮」 | 🟡 信息层级 | `GrowthLoopPage.tsx`：标题改为「上一轮的学习 → 本轮生成的输入（N 条）」+ 写明筛选规则 |

> 全部只改**文案 / 信息层级 / 布局 / 空态**，无新功能、无新页面、无 CSS 重写。

### H.2 本轮改动/新增文件

改动（4）：`apps/api/src/growth-loop/retrospective.ts`、`apps/api/src/growth-loop/provider.ts`、
`apps/web/src/pages/GrowthLoopPage.tsx`、`apps/api/src/growth-loop/domain.test.ts`
（`service.ts` 的 `continue_testing` 修复在 §0.1 之后的上一轮已完成，本轮补测试）

新增（3）：`apps/api/src/growth-loop/experiment-decision.test.ts`、`docs/DEMO_V1_GUIDE.md`、`.tmp-check/walk.ts`（浏览器回归脚本，临时目录）

### H.3 本轮实跑结果（非预测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ **EXIT=0**（api / web / worker / contracts / database 全部） |
| 定向 `npx vitest run src/growth-loop` | ✅ **EXIT=0**；**11 files / 46 passed \| 2 skipped (48)** |
| `npm test` | ✅ **EXIT=0**；API **107 passed \| 14 skipped (121)**（17 files passed / 1 skipped）；web 24；worker 1；contracts 12；database 4 \| 2 skipped |
| `npm run build` | ✅ **EXIT=0**；`vite build ✓ built in 15.11s` |
| `npm run check` | ✅ **EXIT=0** |
| `git diff --check` | ✅ **EXIT=0** |
| **浏览器完整走查（真实 UI，2 次）** | ✅ **PASS**；`PAGE_ERRORS []`、`CONSOLE_ERRORS []`；PNG 导出成功（`growth-page-1.png`） |

浏览器走查关键断言（两次均全 true）：

```
CHECKS { keep:true, change:true, nextExperiment:true, upstreamFirst:true,
         promptV3:true, panelShowsLearnings:true, noDemoLeak:true }
Generation #2 读取到的 learnings：["NEXT_EXPERIMENT","CHANGE","KEEP"]
```

即：**上一轮 ContentFeedback 真正进入了下一轮 Generation Context**（原 BROKEN ① 的端到端证明）。

### H.4 仍未完成（接替 §0.1 G.7）

1. 🔴 `deepseek` 真实路径未验证（无 API Key），全部验证在 `AI_PROVIDER=mock`
2. 🔴 `0005_strategy_memory.sql` 从未在任何数据库执行 → 14 个 DB 用例仍 skipped
3. 🟡 `STRATEGY_FILTERS` 仍只有 1 条；`title_preference` / `tone_intensity` / `perspective` 只进 prompt
4. 🟡 `deactivateStrategy` 无生产调用方；`testing` / `unknown` 无生产者
5. 🟡 离线规则生成器写不出「备选做法」：单正文框时 `可以更好的做法 / 下一步动作` 用中性提示（详见 `docs/DEMO_V1_GUIDE.md` §5）
6. 🟡 `apps/api/src/growth-loop/smoke.ts` 仍是**旧版 6 栏表单**写法，未同步新 UI（不影响产品）
7. ⚪ 未提交、未 push —— 工作区改动是全部成果

### H.5 本轮禁令遵守情况

未执行 `commit` / `push` / `merge` / `rebase` / `reset` / `clean` / `checkout --`；
未动 §2.7 的**别人的 stash**；未删任何 `.bat` / `*-workspace.css` / `DEMO_STATUS.md`；
未开新分支、未开新 PHASE、未新增页面；未删任何测试、未降低任何测试标准。

---

## 0. 一句话现状

**实现层已走完 PHASE A2 → PHASE H 的大部分；但项目当前处于「编译失败 + 5 个测试失败」的中间状态。**
不是灾难性损坏（改动都在一个功能域内、无数据丢失、Git 干净），但**必须先做第 6 节的 3 项修复才能继续。**

### 0.1 新 Agent 请按这个顺序读

| 顺序 | 读什么 | 为什么 |
|---|---|---|
| 1 | **本文件 §0 → §2 → §6 → §7** | 现状 / Git 真相 / 3 个阻塞 / 六向状态。**读完就该知道要不要动手** |
| 2 | 本文件 §8 | 测试红在哪、「还没执行」的有哪些 |
| 3 | 本文件 §10 | PHASE E 逐项核对（Generation Context 的实际形状） |
| 4 | 本文件文末 `## NEXT EXACT ACTION` | 前 5 个动作 |
| 5 | `docs/growth-loop-audit.md` | 为什么会有这些改造（PHASE A 审计） |
| 6 | `apps/api/src/growth-loop/generation-context.ts` | PHASE E 的唯一组装入口，**最该先读的源码** |
| 7 | `packages/contracts/src/growth-loop.ts` | 所有契约的唯一来源 |

### 0.2 开工前必须实跑的三条命令

```bash
export PATH="/c/Users/lin/.workbuddy/binaries/node/versions/22.22.2-3:/usr/bin:/bin:/mingw64/bin:$PATH"
cd "C:/Users/lin/Documents/ChatGPT/情绪灵感库/emotion-content-studio"
git branch --show-current   # 必须是 feature/content-growth-loop
git status --short          # 工作区改动必须还在（20 改 + 若干 untracked）
```
然后再跑 `npm run typecheck`，确认**只有 1 个错**（§6.1）。若错误数变了，说明状态已漂移，先别改。

---

## 1. 项目根目录确认

```bash
pwd
# /c/Users/lin/Documents/ChatGPT/情绪灵感库/emotion-content-studio

git rev-parse --show-toplevel
# C:/Users/lin/Documents/ChatGPT/情绪灵感库/emotion-content-studio

git branch --show-current
# feature/content-growth-loop
```

- 项目定位：**Emotion Content Studio / Growth Loop Demo**
- 与 `origin/feature/content-growth-loop` 同步，**无本地提交**
- ✅ 没有改错项目。本项目内**不存在** compass / 罗盘 相关代码（全项目 grep 无命中），所以"半成品罗盘"不在这里，无需也不要去找。

> ⚠️ 环境注意：本机 Git Bash 里 `ls` / `dirname` 会 command not found。跑命令前必须设置：
> `export PATH="/c/Users/lin/.workbuddy/binaries/node/versions/22.22.2-3:/usr/bin:/bin:/mingw64/bin:$PATH"`
> 项目 `engines` 写 `node >=24`，但实际只有 managed Node 22.22.2 可用，可正常运行（只是提示）。

---

## 2. Git 状态（真实输出）

```
On branch feature/content-growth-loop
Your branch is up to date with 'origin/feature/content-growth-loop'.
```

**没有本地 commit，没有 push，没有 merge，没有 rebase，没有 reset。工作区改动全部保留。**

### 2.1 本会话修改的已跟踪文件 · 第一部分（后端 / 契约 / 测试，12 个）

> 前端那 3 个见 §2.2；上一会话遗留的 5 个见 §2.5。**12 + 3 + 5 = 20 = `git diff --stat` 的文件总数。**

| 文件 | 本会话改了什么 |
|---|---|
| `packages/contracts/src/growth-loop.ts` | 契约总入口：新增 Strategy/Experiment/GenerationDebug/Preference 等 schema |
| `packages/database/src/schema.ts` | 新增 `strategyMemory` 表定义 |
| `apps/api/src/growth-loop/repository.ts` | 接口 + 内存仓储：新增 `strategies` 与 `saveStrategies` |
| `apps/api/src/growth-loop/database-repository.ts` | 数据库仓储：读写 `strategy_memory` |
| `apps/api/src/growth-loop/service.ts` | 新增 `recordMetrics` / `decideExperiment`；generate 接 GenerationContext |
| `apps/api/src/growth-loop/routes.ts` | metrics 改走 service；新增 `POST /contents/:id/experiment` |
| `apps/api/src/growth-loop/provider.ts` | experiment/strategy 确定性落地；返回 `{writing, debug}` |
| `apps/api/src/growth-loop/feedback.ts` | 结构化 experiment + verdict/confidence/relative |
| `apps/api/src/growth-loop/metrics.ts` | median / 时间窗口 / relativePerformance |
| `apps/api/src/growth-loop/retrospective.ts` | facts/interpretations + 可追溯守卫 |
| `apps/api/src/growth-loop/demo.ts` | 演示指标补 `hoursSincePublish` |
| `apps/web/src/App.test.tsx` | 断言 `总览` → `内容总览`（中文化同步） |

### 2.2 本会话新修改的「上位机」文件（3 个，之前已有改动，我又叠加了）

| 文件 | 说明 |
|---|---|
| `apps/web/src/pages/GrowthLoopPage.tsx` | 修 4 处冗余 `}`；补标签表；复盘事实/推断分区；策略面板；实验展示 |
| `apps/web/src/pages/GrowthContentReview.tsx` | 仅改 `sourceRetro?: Retrospective \| undefined` |
| `apps/web/src/pages/GrowthContentReview.test.tsx` | 补 `MemoryRouter` 包裹 |

### 2.3 本会话新建文件（9 个，全部 untracked）

| 文件 | 作用 | 状态 |
|---|---|---|
| `apps/api/src/growth-loop/strategy.ts` | Strategy Memory 存储规则 + prompt 组装 | ✅ 已接线 |
| `apps/api/src/growth-loop/experiment.ts` | 采样计数 / 已否决取值 / 状态推进 | ✅ 已接线 |
| `apps/api/src/growth-loop/generation-context.ts` | Generation Context 组装 + debug 快照 | ✅ 已接线 |
| `apps/api/src/growth-loop/preference.ts` | 偏好信号检测（AI 稿 vs 人工稿） | ❌ **零调用方（死代码）** |
| `apps/api/src/growth-loop/strategy.test.ts` | 策略记忆测试（6 例） | ✅ 通过 |
| `apps/api/src/growth-loop/facts.test.ts` | Fact/Interpretation 测试（5 例） | ✅ 通过 |
| `apps/api/src/growth-loop/provider.test.ts` | 实验落地 + 策略约束测试（9 例） | ✅ 通过 |
| `packages/database/migrations/0005_strategy_memory.sql` | strategy_memory 建表 + **部分唯一索引** | ⚠️ **未在任何数据库执行过** |
| `docs/growth-loop-audit.md` | PHASE A 审计报告 | 交付物 |

### 2.4 不是本会话产生的 untracked 文件（**上一会话留下的，不要误删**）

一批 Windows 批处理脚本与样式：`3MINUTE-DEMO.bat`、`COMPLETE-VERIFICATION.bat`、`DEMO_STATUS.md`、`check-ui.bat`、`demo-status.bat`、`final-verification.bat`、`run-*.bat`、`start-*.bat`、`test-*.bat`、`verify-project.bat`，以及
`apps/web/src/pages/{content-creation-workspace,dashboard-workspace,growth-loop-success,retrospective-workspace,review-workspace}.css`

### 2.5 不是本会话修改的文件（**上一会话已有改动，我完全没碰**）

`apps/web/src/components/AppShell.tsx`、`apps/web/src/lib/accounts.ts`、`apps/web/src/pages/DashboardPage.tsx`、`apps/web/src/pages/ImportPage.tsx`、`data/english-topic-history.json`

### 2.6 git diff --stat（真实输出，汇总）

```
20 files changed, 1237 insertions(+), 159 deletions(-)
```

| 文件 | 变更量 |
|---|---|
| `apps/web/src/pages/GrowthLoopPage.tsx` | +490 / -26（**改动最大**） |
| `apps/web/src/components/AppShell.tsx` | 44（上一会话） |
| `apps/web/src/pages/DashboardPage.tsx` | 136（上一会话） |
| `apps/web/src/pages/GrowthContentReview.tsx` | 103 |
| `apps/web/src/pages/GrowthContentReview.test.tsx` | 13 |
| `apps/web/src/pages/ImportPage.tsx` | 10（上一会话） |
| `apps/web/src/App.test.tsx` | 2 |
| `apps/web/src/lib/accounts.ts` | 4（上一会话） |
| `packages/contracts/src/growth-loop.ts` | +114 / -7 |
| `packages/database/src/schema.ts` | +6 / -1 |
| `apps/api/src/growth-loop/provider.ts` | 118 |
| `apps/api/src/growth-loop/feedback.ts` | 107 |
| `apps/api/src/growth-loop/service.ts` | 72 |
| `apps/api/src/growth-loop/metrics.ts` | 68 |
| `apps/api/src/growth-loop/retrospective.ts` | 27 |
| `apps/api/src/growth-loop/database-repository.ts` | 17 |
| `apps/api/src/growth-loop/repository.ts` | 11 |
| `apps/api/src/growth-loop/routes.ts` | 11 |
| `apps/api/src/growth-loop/demo.ts` | 2 |
| `data/english-topic-history.json` | +7（上一会话） |

- `git diff --cached --stat` → **空**（没有任何 staged 改动）
- `git rev-list --left-right --count HEAD...@{u}` → `0  0`（与远端完全同步，**本地无提交**）

### 2.7 ⚠️ 仓库里存在一个**别人的 stash**，不要动

```
stash@{0}: On codex/persistence-ai-foundation: WIP Phase 5 preserved before English Account MVP
```

**这不是本次会话产生的**，来自另一个分支 `codex/persistence-ai-foundation`。
→ **严禁** `git stash drop` / `git stash pop` / `git stash clear`。保留原样。

### 2.8 git diff --check（精确）

`git diff --check` → **EXIT=2**，共 **48 处**提示，**全部是 trailing whitespace**，
无冲突标记（`<<<<<<<`）、无空格/制表符混用、无坏行：

| 文件 | 处数 |
|---|---|
| `apps/web/src/pages/GrowthLoopPage.tsx` | **45** |
| `apps/web/src/pages/DashboardPage.tsx` | 3 |

成因：上一会话 / 本会话手工写的 JSX，行尾（尤其是多行标签结尾的 `/>`、`>` 之前）带了空格。
**与编译无关**（`typecheck` 报的错不是它），纯清洁度问题，可在最后统一 `git diff --check` 前用格式化收尾。

---

## 3. 开发进度总结

### 3.1 PHASE 0 — 代码健康 ✅ **已完成**

| 指标 | 会话开始时 | 现在 |
|---|---|---|
| `npm run typecheck` | 4 处 TS1128 语法错 | **1 处类型错**（见 §6.1） |
| 被语法错误掩盖的类型错 | 15 处 | 已修完 |
| `npm test` | 2 个用例失败 | **5 个用例失败**（见 §8，性质完全不同） |

**真实语法病根（已修）**：不是 ContentList/History/Feedback/MetricsEditor 各自出错，而是**全部集中在 `GrowthLoopPage.tsx` 一个文件** —— `CreateContent`(402)、`Feedback`(509)、`ContentList`(526)、`History`(561) 四个组件各自正常收尾后**多出一行孤立 `}`**，共 4 处。

**顺带修掉的真实 bug（已修）**
1. `MetricsEditor` 把 `likes` 初始化读成了 `metric?.views`（点赞数被浏览量污染）
2. 账号/内容类型下拉框用了**错枚举**的标签表（`AccountId`/`ContentLane` vs `ContentAccount`/`ContentType`），且 `<option>` **漏写 `value`** → 选中即 `parse()` 抛错
3. `sourceRetro?: Retrospective` 在 `exactOptionalPropertyTypes` 下不接受显式 `undefined`

**空想字段处理**：上一会话的工作区版本引用了 5 个契约层不存在的字段（`tags`/`emotion`/`eventType`/`record.history`/`analysis.contentOpportunities`）。前 3 个以 `.optional()` 加入契约（向后兼容，JSONB 存储**无需迁移**）；后 2 个改用真实数据。

**测试修改说明**：改了 2 处断言，原因都是**中文化后测试未同步**（`总览`→`内容总览`；`GrowthContentReview` 新增 `<Link>` 需 `MemoryRouter` 包裹），**不是测试在保护错误逻辑**。

### 3.2 PHASE A — System Audit ✅ **已完成**

产出：`docs/growth-loop-audit.md`（含 16 项问答 + 真实数据链 + BROKEN 标记）

**核心结论：系统原本是 Generation System + Analytics Dashboard，不是 Learning System。** 三处断裂：
1. `state.feedback` 写入后无人读回（KEEP/CHANGE/NEXT_EXPERIMENT 是死数据）
2. Dashboard 的 `NEXT_3_POSTS[].experiment` 进 `createContent` 被丢弃
   - ⚠️ **事后更正**：复查发现 `createContent` 会重新调用 `recommendNextExperiment()`，而该函数是**确定性纯函数**，输入相同时输出相同 → 实际不丢数据。此项严重程度**远低于** 1 和 3，属健壮性问题而非断裂。
3. `provider.ts` deepseek 模式**提前 return**，导致真正应用 experiment 的代码**永不执行**（只有 mock 模式生效）→ **demo 通过、接真实模型反而失效**

### 3.3 PHASE A2 — experiment 落地与 Provider 无关 ✅ **已完成并测试**

原实现：`if (this.client) return ...completeJson(...)` 提前返回，后面的确定性改写是死代码。
现实现：两条路径汇集后再应用实验。

- `apps/api/src/growth-loop/provider.ts`
  - `applyExperiment(writing, retro, experiment)` — 导出、纯函数、按 `variant` 分支
  - `applyStrategyConstraints(writing, context)` — avoid 类策略由**代码真实改写文本**
- 测试：`provider.test.ts` 9 例全绿（question→疑问句标题、无实验不伪造、hook 只加一次、three_steps、约束真实改文本、debug 轨迹）

### 3.4 PHASE B — Fact / Interpretation 分离 ✅ **已完成并测试**

- `RetrospectiveAnalysisSchema` 新增 `facts[]`（≥1，≤8）、`interpretations[]`（≥1，≤8）
- `retrospective.ts`：`rawFacts()` 逐字截取自用户原始输入；`traceableFacts()` 是**可追溯守卫**，凡无法在原始记录中逐字追溯到的条目一律剔除
- `provider.ts`：deepseek 输出经守卫过滤，全部不可追溯时回落到代码派生事实
- 离线分析器的 `interpretations` 每条都带「推断」字样
- UI：`GrowthLoopPage.tsx` 分成「事实 · 来自你的原始记录」与「推断 · 待验证，不是事实」两块
- 测试：`facts.test.ts` 5 例全绿（含"今天没发生什么"→ 不强行生成机会、注入式伪造事实被剔除）

### 3.5 PHASE C — Account Strategy Memory ✅ **已完成并测试**

- 契约：`StrategyEntrySchema { id, account, key, value, category(works/avoid/testing/watch/unknown), source, evidenceCount, confidence, status, lastConfirmedAt, createdAt }`
- `GrowthLoopStateSchema` 新增 `strategies[]`
- `strategy.ts`：`applyStrategy()` 三种结果 `created`/`confirmed`/`superseded`，**同一 (account,key) 只允许一个 active**
- `repository.ts` / `database-repository.ts` / `schema.ts` / `0005_strategy_memory.sql`
  - DB 侧有**部分唯一索引** `WHERE status='active'` 在数据库层面兜底
- Dashboard 有「账号策略 · 会进入下一轮生成」面板
- 测试：`strategy.test.ts` 6 例全绿

### 3.6 PHASE D — 结构化 Experiment ✅ **已完成（旧测试未同步）**

- 契约：`ExperimentSchema { id, hypothesis, variable, variant, baseline, targetMetric, requiredSamples, currentSamples, status, createdAt, completedAt, result, confidence, instruction, keepConstant }`
- `variable` 改为 `title_style | hook | actionSteps | sampleSize`；`variant` 为机器可读取值 `question | statement | scene_first | three_steps | fixed_window`
- 状态机 `proposed → running → evaluating → completed`；`completed` 后 `promote_to_strategy | continue_testing | reject`
- `recordMetrics()` 推进 `currentSamples`；`decideExperiment()` 收口并写入策略
- 已否决的取值不再被自动提议（`experiment.ts:isRejected`）
- ❌ **未验证**：`continue_testing` 目前也会把实验标记为 `completed`（语义上有瑕疵，见 §9）

### 3.7 PHASE E — Generation Context 真正读取 Strategy + Experiment 🟡 **代码已接线，端到端未验证**

- 新增 `generation-context.ts`：组装 `FACTS + ACCOUNT STRATEGY + USER PREFERENCES + CURRENT EXPERIMENT + GENERATION RULES + promptVersion`
- `provider.generateContentOpportunity(context)` 消费该上下文；返回 `{ writing, debug }`
- `service.generate()` 组装上下文并写入 `PublishedContent.debug`（`GenerationDebug`）
- **确定性强制**（不依赖模型听话）：`variant=question` → 标题必定是疑问句；`avoid_drama` → 必定清洗夸张词与感叹号
- 观测字段：`factsUsed / interpretationsUsed / strategyUsed / experimentUsed / userPreferenceUsed / constraintsApplied / promptVersion / provider / model / finalGenerationContext`
- ⚠️ **缺口**：`ContentFeedback`（KEEP/CHANGE/NEXT_EXPERIMENT）**仍然没有任何生成侧读取方**。真正接上的是「Strategy Memory → 生成」，不是「Feedback → 生成」。

### 3.8 PHASE F — Evidence / Confidence / WATCH 🟡 **逻辑已写，被 §6.2 的 bug 阻塞**

- 契约：`FeedbackVerdictSchema = KEEP | WATCH | CHANGE | NEXT_EXPERIMENT | INSUFFICIENT_EVIDENCE`
- `ContentFeedback` 新增 `observation / hypothesis / evidence / confidence / verdict / hoursSincePublish / relative`
- `KEEP` 与 `CHANGE` 从 `min(1)` 放宽为 `max(3)`（**允许为空 = 允许不下结论**）
- `KEEP` 只在 verdict===KEEP 时才有内容；否则为空 —— 不再强行输出 KEEP
- 因果措辞已改：`hypothesis` 前缀"假设，尚未验证"，`evidence` 结尾"相关不等于因果"

### 3.9 PHASE G — Human Edit / Reject Learning Signal ❌ **仅契约 + 死代码，未接线**

### 3.10 PHASE H — Relative Metrics + Time Window 🟡 **逻辑已写，被 §6.2 的 bug 阻塞**

- `metrics.ts`：`median()`、`hoursSincePublish()`、`windowBucket()`（24h/72h/later/unknown）、`relativePerformance()`
- 比较**改用 median**（原为 average）；`historicalComparison` 的 `recent3/recent7/sameAccount/sameContentType` 全部改 median
- 基线限定「同账号 + 同窗口 + 同性质（真实/演示）」，最近 10 篇
- `relativeViews / relativeLikes / relativeSaves / relativeComments`
- 样本 <3 → `comparable=false`，verdict 走 `INSUFFICIENT_EVIDENCE`
- ❌ **未验证**：跨窗口对比的边界（1h vs 72h）没有专门测试

### 3.11 PHASE I — 回归 / 端到端 🟡 **部分完成**

- 已完成：`docs/growth-loop-audit.md`
- 未完成：23 节要求的 15 项测试重点只覆盖了约 6 项（1、2、3、5 及 strategy 冲突、事实/推断分离）

---

## 4. 本次改动文件清单

见 §2。这里按"责任"再列一次分区，便于接手定位：

### 4.0 全量总表（★ = 本会话改/建；· = 上一会话遗留，非本次产物）

| # | 文件 | ★/· | 类 |
|---|---|---|---|
| 1 | `apps/api/src/growth-loop/routes.ts` | ★ | M |
| 2 | `apps/api/src/growth-loop/service.ts` | ★ | M |
| 3 | `apps/api/src/growth-loop/provider.ts` | ★ | M |
| 4 | `apps/api/src/growth-loop/feedback.ts` | ★ | M |
| 5 | `apps/api/src/growth-loop/metrics.ts` | ★ | M |
| 6 | `apps/api/src/growth-loop/retrospective.ts` | ★ | M |
| 7 | `apps/api/src/growth-loop/repository.ts` | ★ | M |
| 8 | `apps/api/src/growth-loop/database-repository.ts` | ★ | M |
| 9 | `apps/api/src/growth-loop/demo.ts` | ★ | M |
| 10 | `packages/contracts/src/growth-loop.ts` | ★ | M |
| 11 | `packages/database/src/schema.ts` | ★ | M |
| 12 | `apps/web/src/App.test.tsx` | ★ | M |
| 13 | `apps/web/src/pages/GrowthContentReview.tsx` | ★ | M |
| 14 | `apps/web/src/pages/GrowthContentReview.test.tsx` | ★ | M |
| 15 | `apps/web/src/pages/GrowthLoopPage.tsx` | ★ | M |
| 16 | `apps/api/src/growth-loop/generation-context.ts` | ★ | **新增** |
| 17 | `apps/api/src/growth-loop/strategy.ts` | ★ | **新增** |
| 18 | `apps/api/src/growth-loop/experiment.ts` | ★ | **新增** |
| 19 | `apps/api/src/growth-loop/preference.ts` | ★ | **新增（死代码）** |
| 20 | `apps/api/src/growth-loop/provider.test.ts` | ★ | **新增测试** |
| 21 | `apps/api/src/growth-loop/strategy.test.ts` | ★ | **新增测试** |
| 22 | `apps/api/src/growth-loop/facts.test.ts` | ★ | **新增测试** |
| 23 | `packages/database/migrations/0005_strategy_memory.sql` | ★ | **新增（未执行）** |
| 24 | `docs/growth-loop-audit.md` | ★ | **新增交付物** |
| 25 | `WORKBUDDY_HANDOFF.md` | ★ | **本文件** |
| 26 | `apps/web/src/pages/DashboardPage.tsx` | · | M |
| 27 | `apps/web/src/components/AppShell.tsx` | · | M |
| 28 | `apps/web/src/lib/accounts.ts` | · | M |
| 29 | `apps/web/src/pages/ImportPage.tsx` | · | M |
| 30 | `data/english-topic-history.json` | · | M |
| 31 | 5 个 `*-workspace.css` + 一批 `*.bat` / `DEMO_STATUS.md` | · | untracked |

> ⚠️ 第 26–31 行**不是本次会话产物**。特别是第 31 行的 `.bat` 与 CSS：**不要当成临时垃圾删除**，上一会话的 UI 工作依赖它们。

### 数据模型（契约层）
- `packages/contracts/src/growth-loop.ts` — **所有 Growth Loop 契约的唯一来源**
- `packages/database/src/schema.ts` — Drizzle 表定义
- `packages/database/migrations/0005_strategy_memory.sql` — 新表迁移

### 后端（`apps/api/src/growth-loop/`）
| 文件 | 责任 |
|---|---|
| `repository.ts` | 仓储接口 + 内存实现（含 strategies） |
| `database-repository.ts` | PostgreSQL 实现（JSONB payload） |
| `service.ts` | 用例编排：复盘 / 内容 / 生成 / 审核 / 发布 / 指标 / 实验决策 |
| `provider.ts` | `GrowthLoopAgent`（mock + deepseek）+ 实验与策略确定性落地 |
| `retrospective.ts` | 离线复盘分析 + facts/interpretations + 可追溯守卫 |
| `metrics.ts` | median / 时间窗口 / 相对表现 / 历史比较 |
| `feedback.ts` | `recommendNextExperiment` / `analyzePerformance` / `recommendEffortDirection` |
| `strategy.ts` | Strategy Memory 写入规则 + prompt 组装 |
| `experiment.ts` | 采样计数 / 已否决取值 / 状态推进 |
| `generation-context.ts` | Generation Context 组装 + debug 快照 |
| `preference.ts` | 偏好信号检测 —— **未接线** |
| `dashboard.ts` | 今日重点（未改动） |
| `demo.ts` | 离线演示数据 |
| `routes.ts` | HTTP 路由 |

### 前端
- `apps/web/src/pages/GrowthLoopPage.tsx` — 复盘工作台 / 内容创作 / 指标录入 / 反馈展示 / 历史（含 4 个内联组件 Dashboard / RetrospectiveEditor / CreateContent / MetricsEditor / Feedback / ContentList / History）
- `apps/web/src/pages/GrowthContentReview.tsx` — 内容审核

---

## 5. 各阶段完成度（速查表）

| 阶段 | 代码 | 接线 | 测试 |
|---|---|---|---|
| PHASE 0 代码健康 | ✅ | ✅ | ✅ |
| PHASE A 审计 | ✅ | — | — |
| PHASE A2 实验落地 | ✅ | ✅ | ✅ |
| PHASE B Fact/Interpretation | ✅ | ✅ | ✅ |
| PHASE C Strategy Memory | ✅ | ✅ | ✅ |
| PHASE D 结构化 Experiment | ✅ | ✅ | ❌ 旧测试未同步 |
| PHASE E Generation Context | ✅ | ✅ | 🟡 单元 ✅ / 端到端 ❌ |
| PHASE F Evidence/WATCH | ✅ | ✅ | ❌ 被 bug 阻塞 |
| PHASE G Human/Reject | 🟡 契约+死代码 | ❌ | ❌ |
| PHASE H Relative/Window | ✅ | ✅ | ❌ 被 bug 阻塞 |
| PHASE I 回归 | 🟡 | — | 🟡 6/15 |

---

## 6. 最重要的 3 个阻塞问题

### 6.1 阻塞 A — Web 端 1 处类型错误 → `typecheck` / `build` 直接失败

- 文件：`apps/web/src/pages/GrowthLoopPage.tsx` **第 515 行**
- 现状：`<p>观察指标：{value.NEXT_EXPERIMENT.metric}</p>`
- 原因：PHASE D 把 `ExperimentSchema.metric` 重命名为 `targetMetric`
- 精确修法：`value.NEXT_EXPERIMENT.metric` → `value.NEXT_EXPERIMENT.targetMetric`
- 影响：`npm run typecheck` 返回 2，`npm run build` 返回 2（web 的 `tsc --noEmit` 先失败）
- 提示：同一组件第 512-515 行只展示了 variable/instruction/keepConstant；建议顺带补 `variant / hypothesis / status / currentSamples / requiredSamples / confidence`（新字段已就绪，UI 还没用）

### 6.2 阻塞 B — `RelativePerformanceSchema` 不允许负值 → **运行时崩溃**

- 文件：`packages/contracts/src/growth-loop.ts` 第 **155 / 164 行**
- 现状：
  ```ts
  const rate = z.number().finite().nonnegative().nullable();   // ← 155
  export const RelativePerformanceSchema = z.object({
    ...
    relativeViews: rate, relativeLikes: rate, relativeSaves: rate, relativeComments: rate,  // ← 164
  ```
- 原因：`relativeViews = (当前 - 基线) / 基线`，**当前低于基线时必定为负**，但 `rate` 带 `.nonnegative()`
- 实测后果（`demo.test.ts`）：
  ```
  ZodError: path: ["relative","relativeViews"], message: "Too small: expected number to be >=0"
  ❯ analyzePerformance src/growth-loop/feedback.ts:82
  ❯ seedGrowthLoopDemo src/growth-loop/demo.ts:39
  ```
  → **离线演示数据完全无法加载**；任何"低于基线"的内容分析都会抛错
- 精确修法：为相对值单开一个允许负数的基础类型，例如
  ```ts
  const relative = z.number().finite().nullable();
  ```
  然后 164 行的四个 `relative*` 字段改用它（`medianViews` 等四个中位数字段继续用 `rate`，它们确实非负）
- ⚠️ 这是**唯一一个会真正打断运行时**的问题，优先级最高

### 6.3 阻塞 C — PHASE G 只落了契约，没有任何写入方

已声明但**无人写入**的字段/状态：
| 项 | 位置 | 现状 |
|---|---|---|
| `aiDraft` | `PublishedContent` | `service.generate()` 未写入 → review 时无原稿可比 |
| `preferenceSignal` | `PublishedContent` | 无写入方 |
| `rejectReason` / `rejectedAt` | `PublishedContent` | 无写入方 |
| `status: "rejected"` | `PublishedContent` | 无路由能到达 |
| `detectPreferenceSignal` / `preferenceProposals` | `preference.ts` | **零调用方（死代码）** |

缺失的环节（按依赖顺序）：
1. `service.generate()` 写入 `aiDraft: writing`
2. `service.review()` 调 `detectPreferenceSignal(existing.aiDraft, input.writing)` → 写入 `preferenceSignal`
3. 同一步把 `preferenceProposals()` 的结果以 `category: "watch"` + `confidence: "LOW"` 写入 Strategy Memory（**一次修改不得升级**）
4. 新增 `POST /contents/:id/reject`（`{ revision, reason }`）→ 置 `status:"rejected"`、`rejectedAt`、`rejectReason`
5. `factually_wrong` 要写**强负面信号**（建议 `category:"avoid"` + `confidence:"HIGH"`）
6. Reject 内容不得进入指标：**已被现有逻辑天然保证**（`repository.addMetrics` 要求 `status==="published"`，且 `relativePerformance` / `historicalComparison` 都过滤 `published`）
7. 前端需要最小 Reject 入口（复用现有 Review UI）

---

## 7. 状态六向区分（交接核心）

> 这一节是接手时的**第一判断依据**。同一个东西可能「已完成但未验证」，请勿混为一谈。

### 7.1 已完成（代码已落盘）

| 项 | 位置 |
|---|---|
| PHASE 0 语法/类型修复（4 处孤立 `}`、3 个真实 bug、5 个空想字段） | `GrowthLoopPage.tsx` / `growth-loop.ts` |
| PHASE A 审计报告 | `docs/growth-loop-audit.md` |
| PHASE A2 实验落地与 provider 解耦 | `provider.ts` |
| PHASE B Fact / Interpretation 分离 + 可追溯守卫 | `retrospective.ts`、契约 |
| PHASE C Strategy Memory（含 DB 表 + 部分唯一索引 + 迁移文件） | `strategy.ts`、`schema.ts`、`0005_*.sql` |
| PHASE D 结构化 Experiment + 状态机 + samples 推进 | `experiment.ts`、`service.ts` |
| PHASE E Generation Context / FACTS / STRATEGY / EXPERIMENT / RULES / observability | `generation-context.ts` |
| PHASE F verdict / confidence / WATCH / INSUFFICIENT_EVIDENCE | `feedback.ts`、契约 |
| PHASE H median + 时间窗口 + relativePerformance | `metrics.ts` |
| PHASE G **契约层**（`aiDraft`/`preferenceSignal`/`reject*`/`rejected`）+ `preference.ts` 实现 | 契约、`preference.ts` |

### 7.2 已验证（有实跑 / 单测证据）

- `provider.test.ts` **9 例全绿** —— 实验应用与 provider 无关
- `strategy.test.ts` **6 例全绿** —— 同 key 单 active、证据累加不降置信度、5 类分组、停用不删历史
- `facts.test.ts` **5 例全绿** —— 逐字事实、剔除被写成事实的推断
- `npm run typecheck` 在 PHASE 0 结束时曾为 **0 错**（**现已回退为 1 错，见 §6.1**）
- `git diff --check` 已实跑：EXIT=2，仅 48 处 trailing whitespace（§2.8）

### 7.3 正在执行

- **本次交接**（写本文件）。用户明确要求：完成交接文件后**停止**，不再扩大修改范围。→ 已停止开发。

### 7.4 尚未完成（明确未做）

1. **修 §6.1**（`GrowthLoopPage.tsx:515` 的 `.metric` → `.targetMetric`，1 行）
2. **修 §6.2**（`growth-loop.ts:155` 的 `rate` 拆出允许负数的 `relative`）
3. 同步 **4 个**过时测试断言（§8.4）
4. **PHASE G 接线**（§6.3 的 7 个步骤，含 `POST /contents/:id/reject` 与最小 UI 入口）
5. UI 补齐：`Feedback` 组件展示 `observation/hypothesis/evidence/confidence/verdict/WATCH/relative`；`decideExperiment` **无任何 UI 入口**
6. PHASE I：23 节 15 项测试重点只覆盖约 6 项，剩 9 项未做
7. `0005_strategy_memory.sql` **从未在任何数据库执行**
8. `STRATEGY_FILTERS` 只有 1 条规则；`title_preference` / `tone_intensity` / `perspective` 三类 avoid 策略**只进 prompt、无确定性约束**
9. `deactivateStrategy` 无生产调用方；`testing` / `unknown` 两个 category **无任何生产者**
10. `deepseek` 真实 provider 路径**完全未验证**

### 7.5 已发现但未修复（**必须知道，否则会踩坑**）

| # | 问题 | 严重度 | 位置 |
|---|---|---|---|
| 1 | `relative*` 复用了带 `.nonnegative()` 的 `rate`，相对值为负时 **抛 ZodError** → 演示数据完全无法加载 | 🔴 **运行时崩溃** | `growth-loop.ts:155/164` |
| 2 | `GrowthLoopPage.tsx:515` 引用了已改名的 `.metric` → `typecheck`/`build` 双红 | 🔴 阻塞编译 | `GrowthLoopPage.tsx:515` |
| 3 | PHASE G 只有契约与死代码，`aiDraft`/`preferenceSignal`/`rejectReason`/`rejectedAt`/`status:"rejected"` **全无写入方** | 🟠 功能缺口 | 见 §6.3 |
| 4 | `preference.ts` **零调用方**（死代码） | 🟠 | `preference.ts` |
| 5 | `select continue_testing` 仍把实验标成 `completed` —— 语义瑕疵 | 🟡 | `service.ts:decideExperiment` |
| 6 | `ContentFeedback`（KEEP/CHANGE/NEXT_EXPERIMENT）**仍无生成侧读取方** —— 原 BROKEN ① 未修 | 🟠 | 全局 |
| 7 | 4 个测试断言在保护已被主动替换掉的旧行为 | 🟡 过时 | `feedback.test.ts`×3、`repository.test.ts`×1 |
| 8 | 48 处 trailing whitespace | ⚪ 清洁度 | `GrowthLoopPage.tsx`、`DashboardPage.tsx` |

### 7.6 下一步应该做什么

见文末 **`## NEXT EXACT ACTION`**（5 个动作，严格按序）。一句话：**先把 §7.5 的 #1、#2 修掉让工程回到绿灯，再谈新功能。**

---

## 8. 测试状态（**本次会话实跑**，2026-09-11 21:47–21:49）

跑命令前先设 PATH（本机 Git Bash 无 `ls`/`dirname`）：

```bash
export PATH="/c/Users/lin/.workbuddy/binaries/node/versions/22.22.2-3:/usr/bin:/bin:/mingw64/bin:$PATH"
```
运行时：**managed Node v22.22.2**（根 `package.json` 的 `engines.node` 写 `>=24`，会提示不满足，但实际可跑）。

### 8.1 五项总览

| 项 | 命令 | 真实结果 | 通过 / 失败 |
|---|---|---|---|
| **typecheck** | `npm run typecheck` | **EXIT=2**，1 条 `error TS2339` | ❌ **失败** |
| **单元测试** | `npm test` | **EXIT=1**；105 例 → **5 失败 / 86 通过 / 14 跳过** | ❌ **失败** |
| **API tests** | 含在 `npm test` 内：`routes.test.ts` + `app.test.ts` | `routes.test.ts` ✓ 2/2；`app.test.ts` ✓ **19/19** | ✅ **通过** |
| **build** | `npm run build` | **EXIT=2**，卡在 `apps/web` 的 `tsc -p tsconfig.json --noEmit` | ❌ **失败** |
| **git diff --check** | `git diff --check` | **EXIT=2**，48 处 trailing whitespace（无冲突标记） | ⚠️ 非阻塞 |

> 根 `package.json` 的 `check` = `typecheck && test && build`。**因为前两步就红，`npm run check` 从未跑到 build。**

### 8.2 typecheck 唯一错误（原文逐字）

```
src/pages/GrowthLoopPage.tsx(515,38): error TS2339: Property 'metric' does not exist on type
'{ id: string; hypothesis: string; variable: "title_style" | "hook" | "actionSteps" | "sampleSize";
   variant: "question" | "statement" | "scene_first" | "three_steps" | "fixed_window"; ... 10 more ...; keepConstant: string; }'.
```

→ 修法见 §6.1。**这是 typecheck 失败的唯一原因。**

### 8.3 build 失败点（原文）

```
src/pages/GrowthLoopPage.tsx(515,38): error TS2339: ...（同上）
npm error code 2
npm error workspace @emotion-studio/web@0.1.0
npm error command C:\WINDOWS\system32\cmd.exe /d /s /c tsc -p tsconfig.json --noEmit && vite build
```

→ 即 **web workspace 的 tsc 先挂**，`vite build` 根本没执行。改对那一行即可恢复 `build`。

### 8.4 五个失败用例（文件:行 级）

| # | 文件:行 | 用例名 | 断言原文 | 性质 |
|---|---|---|---|---|
| 1 | `apps/api/src/growth-loop/demo.test.ts:9:5` | offline growth loop demo > loads 3 growth, 3 English and 1 emotion with feedback, idempotently | `ZodError … "message": "Too small: expected number to be >=0"` ×3 | 🔴 **真实 bug**（§6.2） |
| 2 | `apps/api/src/growth-loop/feedback.test.ts:26:75` | compares prior 3/7 without current or demo contamination and uses latest historical metric | `AssertionError: expected 100 to be 200` | 🟡 测试过时（average→**median**） |
| 3 | `apps/api/src/growth-loop/feedback.test.ts:30:20` | outputs bounded KEEP CHANGE and exactly one experimental variable | KEEP/CHANGE 现允许为空 + `metric`→`targetMetric` | 🟡 测试过时 |
| 4 | `apps/api/src/growth-loop/feedback.test.ts:38:23` | returns actionable three posts and does not mix demo evidence with real evidence | 同上 | 🟡 测试过时 |
| 5 | `apps/api/src/growth-loop/repository.test.ts:29:76` | round-trips a published snapshot and metrics, rejects metrics before publication | `expected { views:+0, likes:+0, …(8) } to deeply equal { …(9) }` | 🟡 测试过时（`ContentMetrics` 新增 `hoursSincePublish`） |

> 结论：**5 个失败里只有 1 个是真实功能缺陷**（#1，且它同时是"演示数据加载不了"的根因）。
> 其余 4 个是旧测试在断言 **PHASE D/H 主动替换掉的旧契约**。改这 4 个断言是**正确且必要**的，
> 不是在掩盖问题——它们保护的旧行为（average 基线、KEEP 必非空、无 `hoursSincePublish`）已被明确废弃。
> **注意：#1 不是"改测试"能解决的，必须改 schema（§6.2）。**

### 8.5 各 workspace 明细（逐字）

| workspace | Test Files | Tests |
|---|---|---|
| `@emotion-studio/api` | **3 failed / 11 passed / 1 skipped（15）** | **5 failed / 86 passed / 14 skipped（105）** |
| `@emotion-studio/web` | 3 passed（3） | 23 passed（23） |
| `@emotion-studio/worker` | 1 passed（1） | 1 passed（1） |
| `@emotion-studio/contracts` | 2 passed（2） | 12 passed（12） |
| `@emotion-studio/database` | 1 passed / 1 skipped（2） | 4 passed / 2 skipped（6） |

**新增的三个测试文件全部通过**：
- ✓ `src/growth-loop/provider.test.ts`（9 tests）
- ✓ `src/growth-loop/strategy.test.ts`（6 tests）
- ✓ `src/growth-loop/facts.test.ts`（5 tests）

**PHASE 0 时改过的两个前端测试也已通过**：
- ✓ `src/pages/GrowthContentReview.test.tsx`（2）  · ✓ `src/App.test.tsx`（20）

### 8.6 跳过的用例（**不是失败，属正常**）

| 位置 | 原因 |
|---|---|
| `apps/api/src/content/persistence.integration.test.ts`（1 skipped） | 集成测试，需 `DATABASE_URL` |
| `apps/api/src/content/repository.contract.test.ts`（11/22 skipped） | 需数据库 |
| `apps/api/src/growth-loop/repository.test.ts`（2 skipped） | 需数据库 |
| `packages/database/src/migrations.test.ts`（2 skipped） | 需 `DATABASE_URL` |

### 8.7 哪些"**还没执行**"（接手前必须知道）

1. **`npm run check`** —— 串跑 typecheck+test+build，因前置红而从未走完
2. **`deepseek` 真实 provider 路径** —— 无 API Key，**全部 9 个 provider 验证都是 mock 模式**
3. **`0005_strategy_memory.sql`** —— 从未在任何数据库上执行（应用不会自动建表）
4. **浏览器端到端 / 人工走查** —— PHASE I 未做（`npm run dev` 起的双服务流程没人跑过）
5. **`npm run test:contracts`** 的独立跑法 —— 只在 `npm test` 聚合里跑过（结果为 ✓）
6. 无 lint 脚本（根 `package.json` 只有 `dev/typecheck/test/build/test:contracts/check`）

---

## 9. 当前"不可用状态"（桩代码 / 半成品）

| 项 | 位置 | 状态 |
|---|---|---|
| `detectPreferenceSignal` / `preferenceProposals` | `apps/api/src/growth-loop/preference.ts` | **完整实现但零调用方** —— 等价于桩 |
| `aiDraft` / `preferenceSignal` / `rejectReason` / `rejectedAt` | `packages/contracts/src/growth-loop.ts` | 契约已声明，**无生产者** |
| `status: "rejected"` | 同上 | 无路由可达 |
| `POST /contents/:id/experiment` | `apps/api/src/growth-loop/routes.ts` | 后端可用，**前端无入口** |
| `StrategyCategory: "testing" / "unknown"` | `strategy.ts` | **无任何生产者** |
| `deactivateStrategy` | `strategy.ts` | 仅测试调用 |
| `continuation_testing` 语义 | `service.ts:decideExperiment` | 选 `continue_testing` 时实验仍被标记 `completed` —— **语义瑕疵，需复查** |
| `STRATEGY_FILTERS` | `generation-context.ts` | 只有 1 条规则（戏剧/夸张），其余 avoid 策略只进 prompt 不强制 |
| `0005_strategy_memory.sql` | `packages/database/migrations/` | **未执行过** |
| `Feedback` UI | `GrowthLoopPage.tsx` | 仍只显示 KEEP/CHANGE/NEXT_EXPERIMENT，新字段未展示 |

---

## 10. PHASE E 状态（重点，逐项核对）

PHASE E 的唯一目标：**生成时真的读取上一轮的学习结果**，而不是让 Strategy / Experiment 变成"写进数据库但没人看"的死数据。

核心文件：`apps/api/src/growth-loop/generation-context.ts`（**新建，约 96 行，建议第一个读它**）

### 10.1 Generation Context 组装 — ✅ 已实现

`generation-context.ts:29-42` 定义 `GrowthGenerationContext`，`:44-70` 的 `buildGenerationContext()` 是唯一组装入口：

```ts
export interface GrowthGenerationContext {
  account; topic; contentType; retro;
  facts: string[];                 // 来自 retro.analysis.facts
  interpretations: string[];       // 来自 retro.analysis.interpretations
  strategy: ReturnType<typeof strategyContext>;
  userPreferences: string[];       // source === "human_edit" | "reject" 的策略
  experiment: Experiment | null;   // 本轮唯一变量
  promptVersion: string;           // "growth-loop.v2"
  strategyText: string;            // 注入 prompt 的策略段落
  generationRules: string[];       // 5 条硬规则（见下 RULES）
}
```

消费方：`service.generate()` 调 `buildGenerationContext()` → `agent.generateContentOpportunity(context)` → `provider.ts` 返回 `{ writing, debug }`。

### 10.2 FACTS — ✅ 已实现并单测

- 来源：`retro.analysis.facts`（PHASE B 产物），**不重新推断**
- `generationRules[0]`：`只引用 facts 里的真实经历，禁止补造对话、金额、人物、时间或成功结果。`
- 未定义时安全回落 `?? []`（`generation-context.ts:55`）
- 测试：`facts.test.ts` 5 例（逐字保留、追不回的推断被剔除、不凭空加事实、"今天没发生什么"不强行生成机会、每条推断都标"推断"）

### 10.3 STRATEGY — ✅ 已实现（**这是唯一真正打通的"学习→生成"链路**）

- `strategyContext(state, account)` 按 5 类分组（works/avoid/testing/watch/unknown）
- `strategyPrompt(state, account)` 生成 prompt 段落 → `strategyText`
- **确定性强制**：`STRATEGY_FILTERS`（`generation-context.ts:7-9`）命中 `戏剧|夸张|标题党|博眼球` → `stripDrama()`（`:15-22`）**由代码真实删除** 9 个夸张词（震惊/必看/全网/绝对/100%/必须点开/不看后悔/炸裂/逆天）并把 `！`/`!` 换成 `.`
- 测试：`strategy.test.ts` 6 例 + `provider.test.ts` 的 `really constrains the text when a strategy says to avoid drama`

### 10.4 EXPERIMENT — ✅ 已实现并被确定性应用

- `experiment: Experiment | null`；无实验时为 `null`，**绝不自动发明**
- 应用点：`provider.ts:applyExperiment(writing, retro, experiment)` 按 `variant` 分支（`question` / `statement` / `scene_first` / `three_steps` / `fixed_window`）
- **关键性质：provider 无关**。PHASE A2 已修掉 deepseek 提前 return，mock 与真实模型都会走同一段确定性改写
- 测试：`provider.test.ts` 9 例全绿 —— 无实验时原样不动、question 变真疑问句、已是问句不重复包、hook 只加一次、three_steps、**无 model client 也能应用**、无实验不伪造、约束真改文本、debug 轨迹

### 10.5 PREFERENCES — 🟡 结构已通，**当前恒为空**

- 定义：`userPreferences(state, account)`（`generation-context.ts:25-27`），只取 `source === "human_edit"` 或 `"reject"` 的 active 策略
- 会写进 `debug.userPreferenceUsed` 并拼进 `contextSnapshot`
- ❌ **但 PHASE G 未接线** → `human_edit` / `reject` 两个 source **目前没有任何生产者**，所以这个数组在真实流程里**永远返回 `[]`**
- 结论：**管道是通的，上游没有水。** 修 PHASE G（§6.3）后才会自动生效

### 10.6 RULES — ✅ 已实现

`generationRules`（`generation-context.ts:62-68`）5 条，直接进 prompt：
1. 只引用 `facts` 里的真实经历，禁止补造对话、金额、人物、时间或成功结果
2. `interpretations` 是推断，只能在正文里以「我现在的判断」出现，**不得写成已发生的事**
3. 建议必须明确标为下一次计划，不伪装成已完成的结果
4. **本轮唯一变量由 current experiment 决定，其余写作维度保持不变**
5. **没有 experiment 时不得自行发明实验，也不要声称在做对比**

### 10.7 observability — ✅ 已实现并持久化

`GenerationDebugSchema` 字段 → 由 `buildDebug()`（`generation-context.ts:85-95`）组装：

| 字段 | 内容 |
|---|---|
| `promptVersion` | `"growth-loop.v2"`（常量 `generation-context.ts:4`） |
| `provider` / `model` | `"mock"` 或 `"deepseek"` + 模型名（无 model client 时 `null`） |
| `factsUsed` | 实际进入上下文的事实数组 |
| `interpretationsUsed` | 实际进入上下文的推断数组 |
| `strategyUsed` | 5 类策略合并后 `.slice(0, 30)` |
| `experimentUsed` | `"title_style=question"` 形式，无实验为 `null` |
| `userPreferenceUsed` | 见 10.5（当前恒空） |
| `constraintsApplied` | 实际生效的确定性约束标签数组 |
| `finalGenerationContext` | `contextSnapshot()` 的单行文本快照（`:73-83`） |

- 写入位置：`service.generate()` → `PublishedContent.debug`，**随内容快照持久化**（JSONB，无需迁移）
- ❌ 前端**没有查看入口**（需求第 20 节要求 debug 不占普通 UI，但至少要能查）

### 10.8 provider tests — ✅ 9 例全绿

`apps/api/src/growth-loop/provider.test.ts`（新建）。这把 PHASE A2 的"实验必须与 provider 无关"锁死在测试里 —— 是本次最关键的回归保护。

### 10.9 typecheck — ❌ **当前红色（EXIT=2）**

- **不是 PHASE E 自身的问题**：`generation-context.ts` 与 `provider.ts` 均无 TS 报错
- 唯一错误来自 PHASE D 改名后的 UI 未同步：`GrowthLoopPage.tsx:515 Property 'metric' does not exist`（详见 §6.1）
- **结论：PHASE E 的代码层已完成；它被一个 UI 行的阻塞挡住，无法通过 `build` 验证。**

### 10.10 PHASE E 缺口汇总

- ❌ `ContentFeedback`（KEEP/CHANGE/NEXT_EXPERIMENT）**仍无生成侧读取方** —— 原 PHASE A 的 BROKEN ① **依旧断着**。现在打通的是「Strategy Memory → 生成」，不是「Feedback → 生成」
- ❌ 无端到端测试证明「上一轮结束 → 下一轮生成真的变了」
- ❌ `deepseek` 真实路径**完全未验证**（无 API Key），全部验证在 mock
- ❌ `PREFERENCES` 恒空（PHASE G 未接线，见 10.5）
- ❌ `debug` 无 UI 入口

---

## 11. 最终目标 A–E 判定（本次重估）

| 项 | 目标 | 修复前 | 本次实跑后的真相 | 判定 |
|---|---|---|---|---|
| **A** | Previous Learning → Next Generation | FAIL | Strategy 路径**已通**（代码 + 单测）；`Feedback` 路径**仍断**（无读取方） | 🟡 **部分 PASS** |
| **B** | Experiment → Generation Behavior | FAIL | 代码层**已通且 9 例单测覆盖**（mock 模式）；deepseek 未验证 | 🟡 **PASS(mock) / 未验证(deepseek)** |
| **C** | Human Feedback → Strategy Memory | FAIL | **完全没动**：PHASE G 只有契约 + 死代码，无写入方 | ❌ **FAIL** |
| **D** | Metrics → Evidence-based Learning | FAIL | 逻辑已写，但被 §6.2 的 schema bug **阻塞**：`demo.test.ts` 实测抛 `ZodError`，**演示数据根本加载不了** → 无法运行，无从验证 | ❌ **FAIL** |
| **E** | Insufficient Evidence → WATCH / UNKNOWN | FAIL | 逻辑已写（verdict + WATCH + LOW + 拒绝 promotion）；但 D 挂 → **无法端到端验证** | 🟡 **逻辑 PASS / 未验证** |

### ✅ 判定：**Growth Loop Reality Upgrade 仍未 PASS（0 / 5 完全 PASS）**

对比修复前，A、B、E 有实质推进（尤其 B 有 9 例单测把"与 provider 无关"锁死）；**C、D 仍为 FAIL**。

### 修复 §6 三个阻塞后的预计状态（**预测，非已验证**）

| 项 | 修完 §6.1 + §6.2 + 4 个断言后 |
|---|---|
| A | 仍🟡（Feedback→生成 依然断，除非另做） |
| B | 仍🟡（deepseek 仍无 Key） |
| C | 仍❌（要接 PHASE G） |
| D | 可转 ✅（demo 能加载 + median/窗口/relative 都能跑起来） |
| E | 可转 ✅（INSUFFICIENT_EVIDENCE + WATCH 链路可跑通） |

→ 即：**修完 §6 最多到 2/5 完全 PASS。想要 5/5，PHASE G 与端到端测试是硬缺口。**

---

## 12. Git 安全声明

本次交接**没有执行**：`commit` / `push` / `merge` / `rebase` / `force push` / `reset --hard` / `clean` / `checkout --` / `stash drop`。

- ✅ 所有未提交成果完整保留
- ✅ 所有已有 UI 修改保留
- ✅ 没有删除任何业务文件
- ✅ 没有触碰 `data/` 下的业务数据文件
- ✅ 唯一的临时产物 `/tmp/h_tc.log`、`/tmp/h_test.log`、`/tmp/h_build.log`、`/tmp/dc.txt` 写在**系统临时目录**，不在项目内

### 接手后的三条禁令

1. 🚫 **不要** `git checkout .` / `git restore .` —— 工作区改动就是本次全部成果，丢掉等于本会话白做
2. 🚫 **不要** `git stash drop` / `stash pop` / `stash clear` —— 仓库里有一个**别人的** stash（§2.7，来自 `codex/persistence-ai-foundation`）
3. 🚫 **不要**删 `*.bat` / `*-workspace.css` / `DEMO_STATUS.md` —— 上一会话的 UI 工作依赖它们（§2.4）

---

## NEXT EXACT ACTION

> 下一任务启动后，严格按序执行以下动作。

### 前置环境（每次新会话都先跑）

```bash
export PATH="/c/Users/lin/.workbuddy/binaries/node/versions/22.22.2-3:/usr/bin:/bin:/mingw64/bin:$PATH"
cd "C:/Users/lin/Documents/ChatGPT/情绪灵感库/emotion-content-studio"
git branch --show-current     # 必须是 feature/content-growth-loop
git status --short            # 确认工作区改动还在
npm run check                 # 现在应当 EXIT=0；若不是，说明状态已漂移，先别改
```

### 已完成（第二会话，勿重做）

1. ~~修 §6.1~~ ✅ 已修：`GrowthLoopPage.tsx:515` → `.targetMetric`
2. ~~修 §6.2~~ ✅ 已修：`growth-loop.ts` 新增 `relativeRate`（允许负数）
3. ~~同步过时断言~~ ✅ 已同步（`feedback.test.ts` ×3、`repository.test.ts` ×1，另补齐 `sample()` 的 `strategies: []`）
4. ~~PHASE G 接线~~ ✅ 已接线（`aiDraft` / `preferenceSignal` / `POST /contents/:id/reject` / 前端 Reject 入口）
5. ~~UI 补齐（Feedback 组件）~~ ✅ 已补齐：`verdict / confidence / observation / hypothesis / evidence / WATCH / relative / hoursSincePublish` 全部展示，并新增 `decideExperiment` 的 UI 入口（结题：升级 / 继续测试 / 否决）

### 已完成（第三会话，勿重做）

1. ~~PHASE A BROKEN ①~~ ✅ **已修**：`ContentFeedback` → 下一轮 Generation 真正打通（详见 **§0.1**）
2. ~~`git diff --check` 归零~~ ✅ 48 处 trailing whitespace 已清理（`GrowthLoopPage.tsx` 45 + `DashboardPage.tsx` 3）

### 已完成（第四会话 · DEMO V1 封板，勿重做）

1. ~~修 `service.decideExperiment` 的 `continue_testing` 语义~~ ✅ **已修 + 测试锁定**
   （`experiment-decision.test.ts`：连续两次 `continue_testing` 不抛 409、`currentSamples` 单调不减、`status !== "completed"`；`promote` / `reject` 仍正常结题）
2. ~~修「内容潜力永远 <6 → 创建内容永久 409」~~ ✅ **已修**（`retrospective.ts` 适配单正文框计分）
3. ~~修「内容创建成功页永远看不到」~~ ✅ **已修**（`GrowthLoopPage.tsx` 状态提升 + `key` 去掉 `refresh`）
4. ~~§3 打磨~~ ✅ 分析面板中文化、困扰/反应/经验从正文逐句抽取、学习面板写明筛选规则
5. ~~§2 / §5 浏览器完整走查~~ ✅ **两次 PASS**（真实 UI 走完 10 步，含 PNG 导出，`PAGE_ERRORS []` / `CONSOLE_ERRORS []`）
6. ~~§6 工程门禁~~ ✅ 全部 **EXIT=0**（见 §0.2 H.3）
7. ~~§9 交付物~~ ✅ 本文件 §0.2 + **`docs/DEMO_V1_GUIDE.md`**

### 唯一的下一个优先级

> **DEMO V1 已封板，本轮不要继续加功能。** 下一步只在用户明确要求时开启。

**执行 `packages/database/migrations/0005_strategy_memory.sql`，并用 `TEST_DATABASE_URL=... npm test` 唤醒 14 个 skipped 用例（含 DB 仓储契约）。**

- 现状：该迁移**从未在任何数据库执行过**，`strategy_memory` 表在真实库里不存在；应用不会自动建表。
- 意义：这是「策略记忆」从 demo 走向持久化的前提；目前它只在内存仓储 + 单测里被验证。
- 验证：迁移后跑 `TEST_DATABASE_URL=... npm test`，skipped 数应从 14 降到接近 0，且全部为 passed。
- 提醒：不要为了让用例通过而降低断言强度。

### 之后再排（**本轮不要动**）

2. 端到端验证 `deepseek` 真实路径（需 API Key；当前所有 provider 验证都在 `AI_PROVIDER=mock`）
3. 补 `STRATEGY_FILTERS`：把 `title_preference` / `tone_intensity` / `perspective` 也变成确定性约束（目前只进 prompt）
4. 让离线规则生成器能产出「备选做法」（单正文框下 `betterApproach` / `nextAction` 仍是中性提示）
5. 同步 `apps/api/src/growth-loop/smoke.ts` 到新版复盘 UI（旧版 6 栏表单写法，不影响产品）
6. PHASE I 收尾：23 节 15 项测试重点 + 更多边界（跨窗口对比等）

> 仍未 commit / push。工作区改动就是全部成果 —— **不要** `git checkout .`，**不要**动 §2.7 那个别人的 stash，**不要**删 `.bat` 与 `*-workspace.css`。
> 演示/排障/门禁命令见 **`docs/DEMO_V1_GUIDE.md`**。
