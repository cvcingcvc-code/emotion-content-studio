# V1.3 decisions

- Local durable default is SQLite using Node 24 `node:sqlite`; no native addon or external database service is needed. Explicit `memory` remains supported, PostgreSQL remains an optional independently unaccepted mode.
- Keep existing public DTO and repository boundaries. JSON payload storage retains current schemas while indexed metadata enforces IDs, duplicate content, relationships and optimistic revisions.
- SQLite schema migrations run transactionally at open; PostgreSQL migrations remain explicitly invoked. Backups/imports never overwrite or discard original files.
- Existing English draft/history JSON and PNG export folders remain in their established format; the backup procedure includes these files in addition to SQLite and the AI usage ledger.
- Mock/demo remains the AI default. Adapter construction never grants paid-call authorization. Real quality/cost acceptance requires a later user-directed run; mocked success is labelled simulated.
- Existing review/approval is human controlled. Batch generation does not approve or publish. Exports are local artifacts; there is no automated external publication.
- Provider transport is accepted only through simulated upstream responses; live paid calls remain separately gated. Explicit English providers never borrow another provider's credentials. Missing cost rates/usage remain null, and usage-storage failure prevents silent success/fallback.
- Topic deduplication uses account, content type, retrospective source and normalized exact topic. It does not claim semantic duplicate detection. Failed drafts survive for retry; optimistic revisions protect reviewed exports.
- Use one writing API process for each local SQLite database. Growth requests can finish after a browser timeout; consult saved history before retrying. No background queue or cross-process generation lock was added.
- English edits and page switches create a fresh sandboxed preview document after actual browser reproduction of blank frames. The original shared HTML/PNG template and five-page renderer remain in use.
- All 16 PostgreSQL skips require a dedicated TEST_DATABASE_URL and schema/migration permissions. Updating stale expected migration lists does not constitute PostgreSQL acceptance. Actual SQLite process restart, browser and recovery CLI evidence are recorded separately from Vitest totals.
- Preserve the logs-only SQLite preparation commit f837fb3 and all original failure evidence. GitHub synchronization uses ordinary push on the existing feature/content-growth-loop branch under the user's 2026-10-10 instruction; no force push, merge or deployment.
- V1.4 local Docker Desktop service cannot be opened from the current Windows terminal; run the previously skipped PostgreSQL tests on the repository's isolated PostgreSQL 17 GitHub Actions service instead. The verification now runs on `codex/**` pushes.
- Pin Actions to verified official release commit SHAs and pin the GitHub runner to Ubuntu 24.04. The first green run exposed Node 20 and `ubuntu-latest` migration warnings; the pinned version was run and passed twice afterward.
