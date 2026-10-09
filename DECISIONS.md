# V1.3 decisions

- Local durable default is SQLite using Node 24 `node:sqlite`; no native addon or external database service is needed. Explicit `memory` remains supported, PostgreSQL remains an optional independently unaccepted mode.
- Keep existing public DTO and repository boundaries. JSON payload storage retains current schemas while indexed metadata enforces IDs, duplicate content, relationships and optimistic revisions.
- SQLite schema migrations run transactionally at open; PostgreSQL migrations remain explicitly invoked. Backups/imports never overwrite or discard original files.
- Existing English draft/history JSON and PNG export folders remain in their established format; the backup procedure includes these files in addition to SQLite and the AI usage ledger.
- Mock/demo remains the AI default. Adapter construction never grants paid-call authorization. Real quality/cost acceptance requires a later user-directed run; mocked success is labelled simulated.
- Existing review/approval is human controlled. Batch generation does not approve or publish. Exports are local artifacts; there is no automated external publication.
