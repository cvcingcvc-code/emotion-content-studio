# GitHub 开发交接 — 2026-09-15

## 接管入口

- 仓库：https://github.com/cvcingcvc-code/emotion-content-studio
- 本次同步分支：`feature/content-growth-loop`。默认分支仍是 `demo/english-content-workflow`，不要误用默认分支当作本次最新进度。
- 同步前本地 HEAD：`78c39f6e1e17ca2c2bcca2102f2ae6ef0bd03a76`；包含此前尚未推送的 `5456baf` 与 `78c39f6`。
- 本文件随新的开发快照提交。恢复时以包含本文件的分支最新提交为准。
- 用户要求同步整个当前开发进度、保存交接文档，远端确认成功后删除本地 `emotion-content-studio` 项目目录。
- 本次交接保留已有实现，没有顺带修复或重构业务代码。

## 当前开发原则

项目处于 **V1.2 Usage-Driven Development**。真实使用 → 发现具体问题 → 最小修改 → 验证 → 继续使用。

仅处理真实阻塞、明确 bug、重复至少两次的操作摩擦、重复且可验证的 AI 输出问题，或用户明确要求的功能。不要主动扩展架构、实现 backlog 或重新设计 Growth Loop。

保护完整链路：Retrospective → Content Opportunity → Create Content → Growth Content Review → Published Content → Metrics → Historical Comparison → KEEP / CHANGE / NEXT → Dashboard；同时保护 English、PNG、Offline Demo、Demo/真实数据隔离及 debug evidence。

## 已有进度

1. **V1.1 加固**：请求超时与恢复、同步防重入、复盘保存 disabled、流量保存保护、空态与错误态、真实 Dashboard 口径、Demo 上游隔离。详见 [V1.1 最终报告](V1.1_HARDENING_FINAL_REPORT.md)。当时全量结果为 182 passed / 16 skipped；此数字是历史基线。
2. **复盘直接生成**：已保存且已分析、内容潜力至少 6 分时显示“直接生成内容”。使用推荐配置，创建并生成后进入审核；已取得 ID 的草稿在失败后可以复用。见 [V1.2 使用问题记录](V1.2_USAGE_ISSUES.md)。
3. **审核页宽度调整**：`review-workspace.css` 已改最大宽度、编辑区和侧栏比例。只通过既有组件测试，不能认定布局问题已完全解决，见下节。
4. **发布格式整理初步实现**：`growth-loop/provider.ts` 新增 `normalizePublishText` / `normalizeWriting`，用于新生成的非 English 成长稿件。既有 provider 9 项测试通过，但没有针对用户长 Markdown 样本的专项验证；旧稿件不会自动更新。
5. **既有 MCP 开发成果**：保留 `apps/api/src/mcp/` 8 个文件、SDK 依赖、配置与 README，用于四个只读工具。MCP 跨进程共享真实数据和客户端部署尚未验收。

## 尚未完成的真实使用问题

用户最新反馈是：输出仍是很长的复盘整理，带 Markdown 表格、标题、引用和对话式措辞，达不到“直接复制即可发布”。后续应从这里继续，不能仅依据上一次聊天的 PASS 宣称完成。

- 离线 `offlineDraft` 直接拼接 `retro.whatHappened`，格式清理不会把长篇聊天总结转成简洁的发布稿，也不会自动做内容取舍。
- `normalizePublishText` 的表格分支提前返回，单元格内的加粗标记不会继续清理；也未充分覆盖缩进引用、转义字符等用户样本情况。
- 审核页与旧全局 CSS 共用 `.review-workspace`；`styles.css` 对它定义了外层两列 grid，而新页面的 CSS 没有明确覆盖外层布局，导致 header 与编辑区仍可能并排。父级 `growth-loop.css` 还限制最大宽度 1100px。单纯把子容器上限改成 1500px 没有解决截图里的根因。
- 原有“复制正文”只复制 body；核心观点、解决方案、结尾问题和标签分开存在。需要按照用户的发布目标确认最终可复制内容，而不是把字段拼接或去除 Markdown 等同于内容质量验收。

建议下一位 Agent 先复现上述两个具体问题，使用脱敏的长 Markdown 测试样本；围绕实际预览与复制结果做局部修复，补有意义的回归。不要上传用户真实复盘文本，也不要未经许可调用真实模型。

## 同步前验证

2026-09-15 执行 `npm run check`（typecheck → 全 workspace tests → build），退出码 0，全部通过：

| Workspace | Passed | Skipped |
|---|---:|---:|
| API | 121 | 14 |
| Web | 51 | 0 |
| Worker | 1 | 0 |
| Contracts | 12 | 0 |
| Database | 4 | 2 |
| 合计 | **189** | **16** |

16 项跳过均为依赖 `TEST_DATABASE_URL` 的 PostgreSQL 仓储/持久化/迁移测试。本次没有新增 skip，没有真实模型调用。Typecheck 与全部 workspace build 通过，`git diff --check` 通过。既有测试通过不代表上述排版和文案问题已解决。

历史浏览器验证：`scripts/v1.1-happy-path.ts` 在 2026-09-14 通过，覆盖直接生成与原 Growth Loop、Demo 隔离、PNG、English 页面 smoke。证据在 `.tmp-check/v1.1-shots/run-2026-09-14T15-30-55-396Z-iXtE27/`。这次同步未重新运行浏览器，历史结果不替代后续排版验收。

PostgreSQL、Real Model、认证和生产部署尚未正式验收。GitHub workflow 仅针对 main/master 的 push 或 PR 触发，推送当前分支不代表云端 CI 自动通过。

## 数据与证据边界

仓库是公开仓库。源码、测试、交接文档及经核对的合成测试截图/debug evidence 随本次同步保存。

本地 `.env`、真实使用产生的草稿/导出数据、运行日志、依赖和构建缓存不上传。用户已要求删除整个本地项目；这类未纳入 Git 的文件无法通过重新 clone 恢复。GitHub 源码恢复不等同于恢复本地数据或密钥。内存仓储数据也不会持久化到 GitHub。

## 重新拉取与启动

使用 Node.js 24。在希望恢复的父目录运行：

```powershell
git clone --branch feature/content-growth-loop https://github.com/cvcingcvc-code/emotion-content-studio.git
cd emotion-content-studio
npm ci
$env:CONTENT_REPOSITORY = 'memory'
$env:AI_PROVIDER = 'mock'
$env:ENGLISH_AI_MODE = 'demo'
npm run dev
```

打开 `http://127.0.0.1:5173`。本地配置可参考 `.env.example`，其默认 database 示例不代表已完成 PostgreSQL 验收。

验证命令均来自现有脚本：

```powershell
npm run typecheck
npm test
npm run build
npm run check
```

浏览器回归：保持 web dev server 运行，另一个终端执行 `npx tsx scripts/v1.1-happy-path.ts`。该脚本创建独立内存 API 与 English 目录，不使用真实模型；系统需可用的 Edge/Chromium，详见 README。

## 其他已知 backlog

完整记录见 [OPTIMIZATION_BACKLOG.md](../OPTIMIZATION_BACKLOG.md)。包括跨账号相对基线缺少 account 筛选、PostgreSQL 测试迁移清单过期、跨刷新幂等、策略来源元数据和 MCP 数据共享。它们没有在这次同步中被实现。
