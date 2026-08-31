# Architecture

## Purpose

Emotion Content Studio is a single-user prototype for validating an editorial flow from authorized source material to reviewed copy and simulated vertical-video exports. This repository is independently authored and intentionally small. It proves product interaction and system boundaries; it does not implement production ingestion, generative AI, job processing, rendering, or external publishing.

## Runtime topology

```text
Browser
  |
  | HTTP + public DTOs
  v
Fastify API ---- PostgreSQL
  |
  +---- mock in-process services

Worker placeholder (no queue and no background processing)
```

The browser never connects to PostgreSQL. It does not import database definitions, server configuration, or internal file identifiers. All browser-visible data crosses the API boundary as DTOs defined in `packages/contracts`.

## Monorepo boundaries

### `apps/web`

- React, Vite, and React Router application.
- Implements the seven prototype pages and responsive navigation.
- Calls backend routes through one HTTP client module.
- May import only browser-safe contracts from `packages/contracts`.
- Must not import `packages/database`, Drizzle, PostgreSQL drivers, or server-only configuration.

### `apps/api`

- Fastify HTTP service.
- Validates requests and serializes all responses against public contracts.
- Provides mock data and simulated state transitions only.
- Owns request identifiers and the common error envelope.
- May depend on `packages/contracts` and `packages/database`.

### `apps/worker`

- Compile-safe placeholder that documents the future execution boundary.
- Contains no queue client, polling loop, AI provider, CSV processor, or renderer in this phase.
- May depend on `packages/database` only when a later approved feature needs persistence.

### `packages/contracts`

- Contains public-safe DTO types and pure Zod schemas.
- Has no runtime dependency on a web framework, database client, file system, or environment configuration.
- Defines the only shapes that may cross from API to Web.
- Contract tests protect status literals, required provenance fields, and the common error envelope.

### `packages/database`

- Contains the Drizzle schema, database client boundary, and checked-in migrations.
- Is server-only and may be imported by API and Worker packages.
- The prototype schema is a foundation; the user interface continues to use mock API data in this phase.

## HTTP contract

Successful responses use a stable envelope:

```json
{
  "ok": true,
  "data": {},
  "requestId": "request-id"
}
```

Errors use one structure everywhere:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "A user-safe explanation"
  },
  "requestId": "request-id"
}
```

Internal stack traces, database details, environment values, and internal media identifiers are never part of an HTTP DTO. The API logs diagnostic context under the same request identifier while returning a user-safe message.

## Prototype data flow

1. The Web requests synthetic material and page summaries from the mock API.
2. Import actions simulate CSV validation without parsing a real file.
3. Review actions update the prototype view state through mock endpoints or local optimistic state.
4. Draft generation returns three newly authored mock versions; every generated version remains `draft` until an explicit confirmation action.
5. The studio previews one of three fixed visual templates in the browser.
6. Export actions create simulated success, processing, or failure records. They do not create media files or contact an external platform.

## Product invariants

- Source text and derived drafts are separate records.
- `reference_only` and `prohibited` material cannot reach export actions.
- AI-labelled output is always a draft until a person confirms it.
- No page implies that a simulated export was externally published.
- Mock copy is newly written and contains no real comments, lyrics, user handles, or personal information.
- No external platform, media catalog, or generative provider is contacted.

## Environment model

Node.js 24 and npm workspaces are the development baseline. Local application processes use explicit server-side configuration. Values intended for the browser must use Vite's public prefix and must never contain sensitive configuration.

The development Compose topology provides:

- PostgreSQL for validating connectivity and future migrations.
- API container with a database URL that resolves through the Compose network.
- Web container with a browser-reachable API base URL.

PostgreSQL is not required for the current mock screen flow. Its health check exists so database work can be added later without changing the topology.

## Testing strategy

The quality gate is layered:

1. Contract typecheck, tests, and build.
2. Frontend typecheck, component tests, and production build.
3. Backend typecheck, route tests, and build.
4. Database and Worker compile checks when their scripts are present.
5. Root aggregate checks to detect workspace integration failures.
6. Docker configuration validation and an optional clean smoke test when Docker is available.

The pipeline uses `npm ci`; dependency changes must include the independently generated root lockfile.

## Deferred capabilities

The following are deliberately outside this prototype:

- Real CSV parsing or file persistence.
- Generative AI provider calls.
- Reliable queues and background jobs.
- Video or audio rendering.
- Media search or acquisition.
- Automated platform publishing.
- Multi-user roles and collaboration.
- General-purpose audit administration.

Each deferred capability requires a separate architecture review before a new package or runtime service is added.
