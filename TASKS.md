# V1.3 tasks

- [x] Read V1.2 handoffs, diff, workspace and preserve evidence.
- [x] Fresh V1.2 check, complete happy path and English preview/export.
- [x] Commit and push V1.2 baseline `5eae8a1`.
- [x] SQLite repositories, migrations, backup/import and repository restart tests; stage1 check 218 passed / 16 skipped.
- [x] Configurable compatible provider, paid gate, isolated credentials, retry/fallback/cost tests; 22 new simulated cases and full working-tree check PASS.
- [x] Batch content workbench and export/duplicate behavior; stage3 check 256 passed / 16 skipped, browser E2E 10 checkpoints PASS.
- [x] Document 16 PostgreSQL skips, update stale assertions, process restart E2E 11 checkpoints PASS and English five-page smoke PASS.
- [x] Final check 256 passed / 16 skipped, recovery CLI round-trips and non-overwrite proof, phase commits and V1.3 handoff dated 2026-10-10. Ordinary GitHub push authorized; keep its local receipt.

## V1.4 follow-up

- [x] Create `codex/v1.4-postgresql-acceptance` from pushed V1.3.
- [x] Run the previously skipped 16 PostgreSQL repository, restart and migration cases on the hosted PostgreSQL 17 service; all pass.
- [x] Extend push checks to codex branches; pin official Node 24 actions to immutable commits and runner to Ubuntu 24.04.
- [x] Hosted check: 272 passed / 0 skipped; Compose smoke PASS; verify again after documentation commit.
- [x] Commit and push final handoff/current status; branch remains unmerged.
