# Optimization Backlog

本文件记录 V1.1 断点接管期间发现、未扩入本轮加固的事项。原有 POST_DEMO_BACKLOG.md 保留。

- **创建请求幂等键**：超时可能发生在服务端已经保存之后。本轮只补超时恢复、同步提交锁和检查历史提示；跨刷新/跨客户端重试去重留待后续。
- **流量历史快照**：本轮阻止请求中和刷新前的重复提交；刷新完成后仍允许新增相同数值的观察记录，以保留现有按时间记录指标的语义。服务端幂等键另行设计。
- **跨账号相对基线**：`growth-loop/metrics.ts` 的 `relativePerformance` 注释和展示写“同账号”，实际 baseline 筛选缺少 account 条件。现有同账号 happy path 可验证；多账号真实数据比较应在后续专项修复并加回归，避免将此轮工程加固扩成指标逻辑改造。
- **导入表单一致性**：CSV 读取/上传过程中仍可切换文件及授权字段。后续统一锁定输入与结果所对应的文件；本轮仅加固四态与 Demo 加载反馈。
- **旧素材 Dashboard 的单篇分析整合**：本轮移除冒充真实表现的固定示例数字和结论，保留通往现有 Growth Loop 数据流程的入口；不新增分析接口。
- **策略/实验来源元数据**：StrategyEntry 尚无独立 isDemo 字段；当前 Demo seed 不建立策略。本轮堵住 Demo 上游进入真实草稿的入口；未来开放 Demo 编辑/实验时需明确策略与样本隔离，不在本轮改契约或迁移。
- **真实运行环境验收**：PostgreSQL runtime migration、真实模型质量、认证和部署仍按原交接范围留待后续。离线内存验证不替代这些验收。
- **PostgreSQL 测试迁移清单**：`apps/api/src/content/persistence.integration.test.ts` 仍只预期迁移到 `0003`，而 `packages/database/src/migrations.test.ts` 已列 `0004_growth_loop.sql`。两者目前条件 skipped，后续数据库验收前需与实际迁移文件核对清单；本次未修改或执行迁移。
- **已有 MCP 改动**：接管时已存在的 SDK 依赖、配置、文档和适配器原样保留；本轮不增加 MCP 功能，其独立进程内存仓储与 API 数据共享方式需另案验收。
- **审核拒绝区排版**：2026-09-14 对照 `.tmp-check/shots/05-next-generation-learning.png` 与 V1.1 对应截图，底部拒绝理由 / 标记拒绝控件均存在窄列逐字换行。属于原有布局问题；后续局部调整，不纳入本轮四态加固。
  - 2026-10-05：随用户实际反馈的审核页面布局问题局部修复；四种视口的选择框宽度、换行及无横向溢出已验证。历史记录保留。
- **依赖安全更新评估**：2026-10-05 恢复项目后 `npm ci` 报告 5 项（3 moderate / 2 high）；`npm audit --omit=dev --json` 报告生产依赖 3 项（2 high / 1 moderate），涉及 fastify、fast-uri、ip-address。尚未升级依赖或验收修复；后续单独评估兼容性与回归，本轮未执行 audit fix 或修改 lockfile。
