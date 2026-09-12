# Growth Loop System Audit

审计基准：磁盘真实代码 + Git 状态 + 真实测试结果（不依赖任何历史会话）。
分支：`feature/content-growth-loop`
日期：2026-09-11

---

## 0. PHASE 0 代码健康结果

| 项目 | 修复前 | 修复后 |
|---|---|---|
| `npm run typecheck` | 4 处 TS1128（语法） | **0 error，EXIT=0** |
| 被语法错误掩盖的类型错误 | 15 处（未暴露） | **0** |
| `npm test` | 2 个用例失败 | **全部通过，EXIT=0** |
| `npm run build` | — | **EXIT=0** |

### 真实语法病根

不是 ContentList / History / Feedback / MetricsEditor 各自出错，而是**全部集中在 `apps/web/src/pages/GrowthLoopPage.tsx` 一个文件**：

`CreateContent`(402)、`Feedback`(509)、`ContentList`(526)、`History`(561) 四个组件各自正常收尾后，**多出一行孤立的 `}`**。这是"重构 UI 后留下的重复收尾"，共 4 处，直接导致 TS1128 × 4。

### 顺带修掉的真实 bug（非语法）

1. `MetricsEditor` 初始化把 `likes` 读成了 `metric?.views` —— 点赞数会被浏览量污染。
2. 账号 / 内容类型下拉框用了按 `AccountId` / `ContentLane` 键控的全局标签表，而值是 `ContentAccount` / `ContentType`（两套不同枚举），且 `<option>` **漏写 `value` 属性** —— 选项值会变成中文标签，`ContentAccountSchema.parse()` 在选中时直接抛错。
3. `GrowthContentReview` 的 `sourceRetro?: Retrospective` 在 `exactOptionalPropertyTypes: true` 下不接受显式 `undefined` 传参。

### 工作区未提交改动中的"空想字段"

工作区版本（+474 行）的复盘工作台引用了 **契约层和后端都不存在** 的字段：

| 字段 | 出现位置 | 后端支持 |
|---|---|---|
| `input.tags` | 复盘表单「标签」 | 无 |
| `input.emotion` | 复盘表单「情绪」 | 无 |
| `input.eventType` | 复盘表单「事件类型」 | 无 |
| `record.history[]` | 「历史复盘」区块 | 无 |
| `analysis.contentOpportunities` | 内容机会文案 | 无（Analysis 里只有 `contentPotential`） |

处理方式（遵循"不回滚已有工作台 UI" + "最小契约修改"）：

- `tags` / `emotion` / `eventType` → 以 **`.optional()`** 加入 `RetrospectiveInputSchema`。选 `.optional()` 而非 `.default()` 是为了保证旧数据和既有测试仍能解析（向后兼容）。数据库仓储把整对象存进 JSONB `payload` 列，**无需迁移**。
- `record.history` → 改为读取真实的 `state.retrospectives`，「内容机会」徽标改用真实的 `analysis.contentPotential >= 6` 判定（与 `dashboard.ts` 对 `contentOpportunities` 的定义一致）。
- `analysis.contentOpportunities` → 改用真实的 `analysis.contentPotential`。

### 测试修改说明

修改了 2 处测试断言，**原因均为前一会话的中文化改动未同步测试，不是测试保护了错误逻辑**：

1. `App.test.tsx:184`：断言 `'总览'`，但 `AppShell` 已把导航改名为 `'内容总览'` → 同步为 `'内容总览'`。
2. `GrowthContentReview.test.tsx`：`GrowthContentReview` 新增了 `<Link to="/create">返回内容创作</Link>`，测试未包 Router → `useContext(...)` 返回 null 而崩溃。补 `MemoryRouter` 包裹。

---

## 1. 真实数据链（含断裂点）

```
Metrics  POST /contents/:id/metrics  →  ContentMetrics{ capturedAt }
  │
  ├─ metrics.ts · latestMetrics()            每篇只取最新一条快照
  │
  ├─ feedback.ts · analyzePerformance()      ← 学习信号产生处
  │     ├─ historicalComparison() → averageMetrics()   用 average（非 median），无时间窗
  │     ├─ recommendNextExperiment()  → Experiment{ variable, instruction, keepConstant, metric }
  │     ├─ KEEP   = 固定模板字符串（与指标无关，只看有没有 sourceRetrospectiveId）
  │     └─ CHANGE = experiment.instruction   ← 与 NEXT_EXPERIMENT 是同一个字符串
  │
  ├─ routes.ts  POST /contents/:id/analyze
  │
  ├─ repository.addFeedback()  →  state.feedback
  │
  ✗ BROKEN HERE ①
  │   state.feedback 的全部读取方：
  │     demo.ts:38        仅判重（种子数据）
  │     routes.ts:46      仅做缓存命中
  │     repository.ts:41  仅做重复校验
  │     GrowthLoopPage    仅在页面展示
  │   → 没有任何生成逻辑读回它。KEEP / CHANGE / NEXT_EXPERIMENT 是死数据。
  │
  ├─ dashboard.ts → feedback.ts · recommendEffortDirection()
  │     → NEXT_3_POSTS[].experiment  （展示在 Dashboard）
  │
  ✗ BROKEN HERE ②
  │   service.createContent() 完全忽略 Dashboard 给出的 experiment，
  │   改为重新调用 recommendNextExperiment(previous, metric, state) 自算一个。
  │
  ├─ service.createContent()  →  content.experiment
  │
  └─ service.generate()  →  agent.generateContentOpportunity(retro, topic, type, experiment)
        ✗ BROKEN HERE ③
          provider.ts:18-21  deepseek 模式在调用模型后**立即 return**，
          因此 provider.ts:29-31 那段真正把 experiment 落到 title / body / solution
          的确定性改写**永远不会执行**。
          结果：experiment 只是被塞进 prompt 当数据，没有任何强制约束。
          （只有 mock / 离线模式才会真正改变标题与正文。）
```

### 关键结论

**系统当前是「Generation System + Analytics Dashboard」，不是 Learning System。**
闭环在视觉上存在（页面齐全、字段齐全），但**学习信号没有任何一条路径真正回流到下一轮生成**。

---

## 2. 16 项审计问答

| # | 问题 | 真实答案 |
|---|---|---|
| 1 | KEEP 在哪里产生 | `feedback.ts:23` `analyzePerformance()` 内联字符串 |
| 2 | CHANGE 在哪里产生 | `feedback.ts:24`，值 = `experiment.instruction` |
| 3 | NEXT_EXPERIMENT 在哪里产生 | `feedback.ts:5` `recommendNextExperiment()` |
| 4 | 当前数据结构 | `ExperimentSchema = { variable, instruction, keepConstant, metric }` |
| 5 | 是否只是字符串 | **是**，`instruction` 是一句自然语言，无 `hypothesis/variant/baseline` |
| 6 | 存在哪里 | `ContentFeedback` 内，随 `state.feedback` 持久化 |
| 7 | 是否持久化 | 是（内存 / JSONB 均持久化） |
| 8 | 下一轮 Generation 有没有读取 | **没有**。见 BROKEN ① |
| 9 | Generator 当前读取哪些历史信息 | 只有 `retro`、`topic`、`contentType`、`experiment` 四项 |
| 10 | humanEditedOutput 有没有参与学习 | **Growth Loop 域根本不存在该字段**（只存在于情感/内容工作室域） |
| 11 | rejected content 有没有被记录 | **没有**。没有 reject 概念、没有 rejectReason、没有 rejectedAt |
| 12 | Metrics 是否有采集时间 | **有**，`capturedAt`（`routes.ts:72`） |
| 13 | Historical Comparison 怎么计算 | `historicalComparison()`：按同账号/同类型取最近 7 篇，算**算术平均**；分 `recent3/recent7/sameAccount/sameContentType` |
| 14 | 是否存在 Strategy Memory | **不存在**。全库无任何 strategy / memory 结构 |
| 15 | 是否存在 Fact / Interpretation 分离 | **不存在**。`RetrospectiveAnalysis` 是扁平字段，无 `facts[]` / `interpretations[]` |
| 16 | Generation Observability 记录什么 | **Growth Loop 域没有**。仅工作室域有 `promptVersion` |

### 额外发现（影响后续阶段）

- **无时间窗口归一化**：`latestMetrics` 只取"最新一条"，但不同内容的观察时长可能完全不同 —— 发布 1 小时的数据会直接与历史 72 小时数据比较。schema 里没有 `hoursSincePublish`。
- **无相对表现**：没有任何 `relativeViews/Likes/Saves/Comments`，只有绝对值和比率。
- **比较用 average 而非 median**（`metrics.ts:18`），单篇爆款会严重拉偏基线。
- **BROKEN ③ 的模式差异**：离线/mock 模式实验真的生效，接入真实模型后反而失效 —— 这会让 demo 通过、真实使用失效，是最危险的一类 bug。
- **`variable` 枚举不含 `title_style`**：只有 `title | hook | actionSteps | sampleSize`，无法表达"问题型标题"这类变量。

---

## 3. 最终目标 A–E 判定（当前基线）

| 项 | 目标 | 判定 | 依据 |
|---|---|---|---|
| A | Previous Learning → Next Generation | **FAIL** | BROKEN ①，`state.feedback` 无任何生成侧读取方 |
| B | Experiment → Generation Behavior | **FAIL** | 仅 mock 模式成立；deepseek 模式 BROKEN ③，提前 return |
| C | Human Feedback → Strategy Memory | **FAIL** | 无 Strategy Memory；无 humanEditedOutput；无 reject 记录 |
| D | Metrics → Evidence-based Learning | **FAIL** | 有指标与比较，但无 median、无时间窗、无 confidence，且结论不回流 |
| E | Insufficient Evidence → WATCH / UNKNOWN | **FAIL** | 有 `sampleCount < 3` 的软提示，但无 WATCH 状态、无 INSUFFICIENT EVIDENCE 决策值 |

**Growth Loop Reality Upgrade：FAIL（0 / 5 PASS）**

这是真实的 FAIL。页面存在、字段存在、Demo 能跑通，但 A–E 无一项真正贯通。

---

## 4. 对开发顺序的校正建议

原计划的 PHASE B（Fact / Interpretation 分离）可以按序执行，但需要先补一个**前置**：

- **PHASE A2（建议插入）**：修掉 BROKEN ③。让 `experiment` 的落地不再依赖"是否配置了模型"。这是最小、最高收益的一处修复，且直接决定 B 项能否 PASS。
- PHASE E 之后必须专门验证"策略真的改变了产出"，而不是只验证 prompt 里出现了策略文本 —— 这正是 BROKEN ③ 暴露的教训。

其余阶段（B→I）顺序保持。
