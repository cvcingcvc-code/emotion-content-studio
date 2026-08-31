# Emotion Content Studio — Agent Rules

## Scope

This repository is an independently authored prototype for an emotional-content inspiration and short-video production workspace.

## Hard boundaries

- Do not copy source code, Git history, database content, configuration, media, fonts, copy, or design assets from any client project.
- Do not add scraping, private platform APIs, login bypasses, automated publishing, real AI calls, or real video rendering in the prototype phase.
- Do not add Remotion, FFmpeg, pg-boss, Redis, a vector database, or multi-user authorization until a later approved phase.
- `apps/web` communicates with backend functionality only through HTTP DTOs from `packages/contracts`.
- `apps/web` must never import `packages/database`, Drizzle, PostgreSQL clients, server-only environment values, or storage keys.
- `packages/contracts` contains only public-safe DTOs and pure TypeScript/Zod schemas.
- `packages/database` may be imported only by `apps/api` and `apps/worker`.
- All API errors use `{ ok: false, error: { code, message }, requestId }`.
- Sensitive values belong in server environment variables only. Never commit local environment files.

## Development

- Node.js 24 and npm workspaces are the baseline.
- Use TypeScript strict mode.
- Add tests with every contract or behavior change.
- Database changes require a checked-in migration.
- Do not commit, push, or create remotes unless the user explicitly asks.

## Product rules

- Mock content must be newly written and contain no real comments, lyrics, usernames, or personal data.
- AI output is always a draft until an explicit human confirmation.
- `reference_only` and `prohibited` material cannot be exported.
- The prototype exports simulations only and never publishes externally.
