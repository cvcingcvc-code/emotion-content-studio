# Emotion Content Studio

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

See `docs/architecture.md` for boundaries, `docs/prototype-states.md` for the UI state matrix, and `docs/ui-design-system.md` for visual tokens and responsive rules.
