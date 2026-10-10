# Current status

V1.2 baseline committed and pushed: `5eae8a1` on `feature/content-growth-loop`.
Fresh baseline: 199 passed / 16 PostgreSQL skipped, full Growth Loop browser PASS, English five-page smoke PASS on sequential retry. Original failed smoke evidence remains preserved.

SQLite stage1 complete: full check PASS, 218 passed / 16 PostgreSQL skipped. Includes memory compatibility, migrations, snapshot import/rollback, live-WAL backup/recovery and API/MCP sharing.

Provider stage2 complete (`0554b12`): 22 new simulated transport tests, paid gate, retry/fallback, isolated credentials and durable usage/cost ledger. Full working-tree check PASS, 256 passed / 16 skipped (includes the prepared workbench changes).

Workbench stage3 complete (`7d6bcf9`): batch generation/deduplication, explicit review, version-checked copy/TXT/JSON export and English preview repair. Stage3 check PASS, 256 passed / 16 PostgreSQL skipped. Actual browser E2E passed 10 checkpoints; independently restarted compiled API passed 11. English smoke passed five pages with live edits and actual PNG rendering.

V1.3 final check PASS on 2026-10-10: 256 passed / 16 PostgreSQL skipped, all workspace typecheck/build complete (exit 0). Real recovery CLI status/backup/export/import/restore round-trips preserve exact snapshots; existing backup refuses overwrite and its SHA-256 remains unchanged. Final handoff: docs/V1.3_HANDOFF_2026-10-10.md. User authorized GitHub synchronization on the same date; ordinary-push receipt is .tmp-check/v1.3-github-sync.log. No main-branch merge or deployment.

Read-only capture of the earlier memory API failed with ECONNREFUSED at 127.0.0.1:8787; this task did not stop that process and cannot recover memory after it has exited. No capture or recovery success is claimed. SQLite migration tooling supports future live-memory captures.

No paid API enabled, real model key read, deployment or external publication performed. PostgreSQL's 16 conditional tests and real-model acceptance remain outstanding with explicit retest requirements in the handoff.
