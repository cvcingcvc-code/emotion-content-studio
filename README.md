# Emotion Content Studio

An independently authored, single-user prototype for turning authorized emotional-content material into reviewed writing drafts and simulated short-video exports.

## Prototype scope

- Seven responsive product pages
- HTTP-only Web-to-API boundary
- Safe shared DTO contracts
- Mock API and original synthetic data
- PostgreSQL/Drizzle schema foundation
- Worker placeholder without a queue
- No real CSV parsing, AI calls, rendering, scraping, or publishing

## Local development

Use Node.js 24.

```bash
npm ci
npm run dev
```

- Web: `http://localhost:5173`
- Mock API: `http://localhost:8787`

See `docs/architecture.md` for boundaries, `docs/prototype-states.md` for the UI state matrix, and `docs/ui-design-system.md` for visual tokens and responsive rules.
