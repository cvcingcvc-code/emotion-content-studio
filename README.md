# Emotion Content Studio

Latest development handoff (2026-09-15): [GitHub handoff, current status, known gaps, and recovery steps](docs/GITHUB_HANDOFF_2026-09-15.md). Current development is on `feature/content-growth-loop`.

## English Demo: live preview and PNG export

Start with `npm run dev`, then open http://127.0.0.1:5173.
In Offline Demo Mode, enter 尴尬时刻英语50句 (or open its existing draft).
Edit English/Chinese in Review. Preview updates immediately, including unsaved edits.
Use buttons 1–5 to inspect ten sentences per page. **Export Current Page** downloads the
currently displayed content as a 900 × 1200 PNG without a model call or a save prerequisite.
The existing approved publishing-package export still exports all five pages.

Preview and PNG share one HTML template. Windows rendering uses installed Microsoft Edge;
on other systems run `npx playwright install chromium` once.

Verified: typecheck, build, 10 targeted English workflow tests, and the real browser
generation → edit → five-page preview → PNG download flow (including image dimensions).
Repeat browser verification with the web dev server running:
`node --import tsx apps/api/src/english/preview-smoke.ts`.
It uses an isolated temporary history and a local API, with no paid model calls.
Next demo step: rehearse the three-minute presentation using this flow.

An independently authored, single-user prototype for turning authorized emotional-content material into reviewed writing drafts and simulated short-video exports.

## Prototype scope

- Six focused DEMO flow pages, including material detail and generated-result routes
- HTTP-only Web-to-API boundary
- Safe shared DTO contracts
- Mock API and original synthetic data
- PostgreSQL/Drizzle persistent repository with explicit migrations
- Worker placeholder without a queue
- Real local CSV parsing with bounded Mock analysis and a replaceable Mock/DeepSeek generation adapter
- Strict Zod validation for provider output and the Web's core HTTP DTOs
- No rendering, scraping, queue, or publishing integration

## Local development

Use Node.js 24.

```bash
npm ci
npm run dev
```

The direct development command keeps the bounded in-memory repository for quick UI work. For
restart-persistent data, use the checked-in PostgreSQL stack:

```bash
docker compose up --build
```

Compose runs `npm run migrate -w @emotion-studio/database` as an explicit one-shot service before
the API starts. Application startup never changes the schema implicitly. A non-Compose database
can use the same migration command with `DATABASE_URL` and `CONTENT_REPOSITORY=database` configured
in the server environment.

AI generation defaults to `AI_PROVIDER=mock`, so normal development and tests never create external
costs. To opt in to DeepSeek, set `AI_PROVIDER=deepseek` and provide `DEEPSEEK_API_KEY` only in the
API process environment; model, timeout, and the maximum of three attempts are configurable through
the variables documented in `.env.example`. Provider failures never silently fall back to Mock.

CSV imports and the 40-item demo load intentionally continue to use the bounded Mock analyzer even
when DeepSeek generation is enabled. This prevents a large import from producing unbounded external
calls and preserves the existing import-before-provider-failure safety boundary. The validated
`DeepSeekContentAnalyzer` adapter is present for a later explicit re-analysis workflow that first
persists source material and records analysis status.

- Web: `http://localhost:5173`
- API: `http://localhost:8787`
- MCP (read-only): `http://localhost:8790/mcp`

## MCP Integration

Emotion Content Studio can expose its Growth Loop capabilities through MCP, so ChatGPT, Claude Desktop,
or any other MCP client can read the user's real Growth Loop data. The MCP server is an adapter layer:
it reuses the existing Growth Loop repository, dashboard projection, metrics/relative-performance helpers,
and stored KEEP / CHANGE / NEXT feedback. It contains no second copy of the Growth Loop logic.

```
ChatGPT / MCP Client
        ↓
      MCP (Streamable HTTP or stdio)
        ↓
Emotion Content Studio MCP Server (read-only)
        ↓
Existing Growth Loop Repository (memory or PostgreSQL)
```

### Tools (phase 1, read-only)

| Tool | Returns |
| --- | --- |
| `get_growth_dashboard` | Today's retrospective status, content opportunity count, ready-to-publish count, yesterday's published metrics, and the current focus (FOCUS_NOW, STOP_DOING, KEEP_DOING, NEXT_3_POSTS) |
| `list_retrospectives` | Retrospective records (`date`, `whatHappened`, reaction, lesson, next action, tags, and analysis when present), filterable by `date` / `startDate` / `endDate`, newest first |
| `list_content_opportunities` | Retrospectives whose `analysis.contentPotential` reached the existing threshold, with `coreProblem`, `contentAngle`, recommended account/type/titles, and the content already created from them |
| `get_growth_history` | Published content with latest metrics, rates, relative performance vs. the same-account same-window baseline, historical comparisons, feedback verdicts (KEEP / WATCH / CHANGE / NEXT_EXPERIMENT), strategy memory, and the recommended focus |

Phase 1 intentionally has **no write tools**: no create / update / delete / publish / record-metrics tool,
no shell, filesystem, SQL, or arbitrary HTTP tool.

### Install and build

```bash
npm ci
npm run mcp:build
```

### Start MCP (production entry)

```bash
npm run mcp:start
```

### Development mode (watch)

```bash
npm run mcp:dev
```

### HTTP endpoint

`http://localhost:8790/mcp` (Streamable HTTP; stateless, `enableJsonResponse` enabled).
`http://localhost:8790/health` is a plain status probe. The MCP port does not touch the Web (5173) or
API (8787) ports. Override with `MCP_HOST` / `MCP_PORT`; keep the default `127.0.0.1` locally and bind
`0.0.0.0` only behind a trusted private tunnel or reverse proxy.

For Claude Desktop / local inspector debugging, stdio is also available:

```bash
npm run mcp:stdio -w @emotion-studio/api
```

### Environment requirements

The MCP server reads the same server configuration as the API (`CONTENT_REPOSITORY`, `DATABASE_URL`,
`NODE_ENV`, `AI_PROVIDER`, plus `MCP_HOST` / `MCP_PORT`). It follows the same repository rules and never
falls back to demo data: `CONTENT_REPOSITORY=database` requires `DATABASE_URL` and fails clearly if the
database is unavailable, while `memory` starts empty. The web's explicit "加载7篇离线演示数据" action is
the only way demo rows are created, and every demo row is returned with `isDemo: true`. Read tools never
call a model, so no API key is needed to run MCP.

### How to verify

```bash
npx tsx apps/api/src/mcp/smoke.ts
```

This starts a real Streamable HTTP MCP server on an ephemeral localhost port, connects with the official
MCP client, lists the four tools, calls each of them, and prints a `"result": "PASS"` summary.

### Example ChatGPT prompts (natural language, not a prompt engine)

- Show my latest retrospectives.
- Find the strongest content opportunities from my recent retrospectives.
- Compare the performance of my recent published content.
- Based on my history, what should I KEEP, CHANGE and try NEXT?
- Find three problems from my recent retrospectives that are worth turning into content.

See `docs/architecture.md` for boundaries, `docs/prototype-states.md` for the UI state matrix, and `docs/ui-design-system.md` for visual tokens and responsive rules.
