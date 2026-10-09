# Current status

V1.2 baseline committed and pushed: `5eae8a1` on `feature/content-growth-loop`.
Fresh baseline: 199 passed / 16 PostgreSQL skipped, full Growth Loop browser PASS, English five-page smoke PASS on sequential retry. Original failed smoke evidence remains preserved.

SQLite stage1 complete: full check PASS, 218 passed / 16 PostgreSQL skipped. Includes memory compatibility, migrations, snapshot import/rollback, live-WAL backup/recovery and API/MCP sharing.

Provider stage2 complete: 22 new simulated transport tests, paid gate, retry/fallback, isolated credentials and durable usage/cost ledger. Full working-tree check PASS, 256 passed / 16 skipped (includes the prepared workbench changes). Provider commit is staged separately, preserving those workbench edits. Next: real browser workbench/English acceptance, stage3 commit, final restart E2E and handoff.

Read-only capture of the earlier memory API failed with ECONNREFUSED at 127.0.0.1:8787; this task did not stop that process and cannot recover memory after it has exited. No capture or recovery success is claimed. SQLite migration tooling supports future live-memory captures.

No paid API enabled, model key read, deployment or external publication performed.
