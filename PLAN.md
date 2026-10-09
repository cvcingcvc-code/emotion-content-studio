# V1.3 implementation plan

User authorization: preserve current work/evidence, verify and push V1.2, then autonomous local V1.3 implementation. No deployment or paid AI enablement.

1. V1.2 baseline: completed, committed and pushed as `5eae8a1`. Fresh check 199 passed / 16 skipped, full browser PASS, English sequential retry PASS.
2. SQLite: durable content and Growth Loop repositories, checked-in migration, default local configuration, memory/PostgreSQL compatibility, snapshot migration and non-overwriting backups. Run check and persistence tests, commit independently.
3. AI Providers: OpenAI-compatible adapter, explicit paid-call gate, configurable endpoint/model, bounded retries/timeouts, truthful fallback and durable usage/cost recording. Only simulated upstream tests. Run check, commit independently.
4. Xiaohongshu workbench: batch create/generate and duplicate suppression, status filtering, explicit review, current edit copy and local text/JSON export; retain English fifty-sentence/five-page PNG path. Run check/browser E2E, commit independently.
5. Verification/handoff: exact PostgreSQL skip inventory/retest conditions, fix stale migration assertions, API process restart E2E, final complete checks, usage and recovery instructions, evidence and Git state.

Preserve historical handoffs, evidence, user database and secrets. Never reset dirty files or overwrite backups. Each implementation phase is verified before its own commit.
