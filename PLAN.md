# V1.3 implementation plan

User authorization: preserve current work/evidence, verify and push V1.2, then autonomous local V1.3 implementation. No deployment or paid AI enablement.

1. V1.2 baseline: completed, committed and pushed as `5eae8a1`. Fresh check 199 passed / 16 skipped, full browser PASS, English sequential retry PASS.
2. SQLite: complete in c37d721; stage1 check 218 passed / 16 skipped. Preserve the separate preparation-log commit f837fb3. Real CLI migration/restore and non-overwrite evidence also pass.
3. AI Providers: complete in 0554b12; 22 new simulated tests, final prepared-tree check 256 passed / 16 skipped. No paid call or real-model acceptance.
4. Xiaohongshu workbench: complete, including the English rapid-edit preview repair. Full check 256 passed / 16 skipped, real browser E2E 10 checkpoints PASS, process restart 11 checkpoints PASS, original English smoke PASS. Commit independently.
5. Verification/handoff: complete; 16 PostgreSQL skip conditions documented and stale migration assertions fixed without changing historical SQL. Final check 256 passed / 16 skipped (exit 0). Handoff dated 2026-10-10 includes local use, evidence and recovery. Synchronize completed commits to GitHub via ordinary push under the user's same-day instruction; no deployment.

## V1.4 follow-up

Run all former PostgreSQL skips with the existing PostgreSQL 17 CI service, wire `codex/**` pushes into CI, pin Node 24 actions and Ubuntu runner, verify quality/Compose jobs, and publish a dated handoff. Complete: all 16 execute and pass, 272/272 overall tests pass, Compose smoke passes, branch `codex/v1.4-postgresql-acceptance` pushed unmerged.

Preserve historical handoffs, evidence, user database and secrets. Never reset dirty files or overwrite backups. Each implementation phase is verified before its own commit.
