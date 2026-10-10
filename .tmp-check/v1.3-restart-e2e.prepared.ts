/**
 * Real-process SQLite restart regression using synthetic inputs and mock AI only.
 * From the repository root: npm run build && npx tsx scripts/v1.3-restart-e2e.ts
 * No existing API or Web process is required. Only child processes created here
 * are stopped; each run retains its SQLite file, logs and before/after evidence.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  ApiErrorSchema, ContentFeedbackSchema, ContentItemSchema, ContentMetricsSchema,
  GeneratedContentSchema, GrowthLoopStateSchema, PublishedContentSchema, RetrospectiveSchema,
  type GrowthLoopState, type PublishedContent,
} from "@emotion-studio/contracts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverEntry = join(projectRoot, "apps", "api", "dist", "server.js");
assert.ok(existsSync(serverEntry), "Compiled API is missing; run npm run build first");
const evidenceBase = resolve(projectRoot, process.env.RESTART_EVIDENCE_DIR ?? ".tmp-check/v1.3-restart-e2e");
mkdirSync(evidenceBase, { recursive: true });
const runDirectory = mkdtempSync(join(evidenceBase, "run-" + new Date().toISOString().replaceAll(/[:.]/g, "-") + "-"));
const sqlitePath = join(runDirectory, "studio.sqlite");
const checks: string[] = [];
const processes: Array<{ pid: number; port: number }> = [];
const base = "/api/v1/growth-loop";
const input = {
  date: "2026-10-09",
  whatHappened: "今天下午我接到活动物料修改任务，没有先确认使用对象和交付格式就开始做。对方需要竖版，我却交了横版，花了一下午返工。我当时立刻动手，问题是没有把验收标准问清楚。我学到的是先确认范围，下次我会先把使用场景、交付格式和截止时间发给对方确认。",
  optionalNote: "合成的 API 重启回归输入，不来自用户记录。",
};
let running: { child: ChildProcess; closed: Promise<void>; origin: string } | undefined;
const evidence = (name: string, value: unknown) => writeFileSync(join(runDirectory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
function record(message: string) { checks.push(message); console.log("  · " + message); }

async function freshPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolveReady, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolveReady);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolveClosed, reject) => listener.close(error => error ? reject(error) : resolveClosed()));
  return port;
}

async function stopOwnedApi(): Promise<void> {
  const api = running;
  if (!api) return;
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill("SIGTERM");
  const exited = await Promise.race([api.closed.then(() => true), delay(8_000, false, { ref: false })]);
  if (!exited) {
    api.child.kill("SIGKILL");
    assert.equal(await Promise.race([api.closed.then(() => true), delay(3_000, false, { ref: false })]), true, "Own API child must exit");
  }
  running = undefined;
}

async function startApi(): Promise<void> {
  assert.equal(running, undefined, "Previous child must stop before restarting");
  const port = await freshPort();
  const origin = `http://127.0.0.1:${port}`;
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/(?:API_?KEY|TOKEN|SECRET|PASSWORD)/i.test(key)) delete environment[key];
  }
  delete environment.DATABASE_URL;
  delete environment.TEST_DATABASE_URL;
  delete environment.NODE_OPTIONS;
  Object.assign(environment, {
    NODE_ENV: "test", CONTENT_REPOSITORY: "sqlite", SQLITE_PATH: sqlitePath,
    AI_PROVIDER: "mock", ENGLISH_AI_MODE: "demo", ENGLISH_ROOT: join(runDirectory, "english"),
    HOST: "127.0.0.1", PORT: String(port),
  });
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let spawnFailure: Error | undefined;
  const closed = new Promise<void>(resolveClosed => {
    child.once("close", () => resolveClosed());
    child.once("error", error => { spawnFailure = error; });
  });
  const index = processes.length + 1;
  const logPath = join(runDirectory, `api-${index}.log`);
  child.stdout?.on("data", bytes => appendFileSync(logPath, bytes));
  child.stderr?.on("data", bytes => appendFileSync(logPath, bytes));
  running = { child, closed, origin };
  if (child.pid !== undefined) processes.push({ pid: child.pid, port });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnFailure) throw spawnFailure;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`API exited before health; inspect ${logPath}`);
    try {
      const response = await fetch(origin + "/api/v1/health", { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const body = await response.json() as { ok: boolean; data?: { repository?: string; aiProvider?: string }; requestId?: string };
        assert.equal(body.ok, true);
        assert.equal(body.data?.repository, "sqlite");
        assert.equal(body.data?.aiProvider, "mock");
        assert.ok(body.requestId);
        record(`API child ${index} is ready in SQLite/mock mode`);
        return;
      }
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
    }
    await delay(100);
  }
  throw new Error(`API health deadline exceeded; inspect ${logPath}`);
}

async function request(path: string, method = "GET", payload?: unknown, expectedStatus = 200): Promise<unknown> {
  assert.ok(running);
  const response = await fetch(running.origin + path, {
    method, signal: AbortSignal.timeout(10_000),
    ...(payload === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
  });
  assert.equal(response.status, expectedStatus, `${method} ${path} must return ${expectedStatus}`);
  const envelope = await response.json() as { ok: boolean; data?: unknown; requestId?: string };
  assert.ok(envelope.requestId, "Every response must include requestId");
  assert.equal(response.headers.get("x-request-id"), envelope.requestId);
  if (expectedStatus === 200) { assert.equal(envelope.ok, true); return envelope.data; }
  return ApiErrorSchema.parse(envelope);
}

async function state(): Promise<GrowthLoopState> { return GrowthLoopStateSchema.parse(await request(base)); }
function canonical(value: GrowthLoopState) {
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, [...items].sort((a, b) => a.id.localeCompare(b.id))]));
}
async function createAndGenerate(retroId: string, topic: string): Promise<PublishedContent> {
  const draft = PublishedContentSchema.parse(await request(base + "/contents", "POST", {
    account: "growth", topic, contentType: "solution", sourceRetrospectiveId: retroId,
  }));
  assert.equal(draft.status, "draft");
  const generated = PublishedContentSchema.parse(await request(`${base}/contents/${draft.id}/generate`, "POST", { revision: draft.revision }));
  assert.equal(generated.status, "review");
  assert.equal(generated.provider, "mock");
  assert.ok(generated.writing && generated.aiDraft && generated.debug);
  assert.deepEqual(generated.aiDraft, generated.writing);
  return generated;
}

try {
  await startApi();
  assert.deepEqual(canonical(await state()), { retrospectives: [], contents: [], metrics: [], feedback: [], strategies: [] });
  record("Fresh SQLite has no seeded or personal Growth Loop records");
  let retro = RetrospectiveSchema.parse(await request(base + "/retrospectives", "POST", input));
  retro = RetrospectiveSchema.parse(await request(`${base}/retrospectives/${retro.id}`, "PUT", {
    revision: retro.revision, input: { ...input, optionalNote: "合成输入已经核对。" },
  }));
  retro = RetrospectiveSchema.parse(await request(`${base}/retrospectives/${retro.id}/analyze`, "POST", { revision: retro.revision }));
  assert.ok(retro.analysis && retro.analysis.contentPotential >= 6);
  assert.equal(retro.analysisProvider, "mock");
  assert.equal(retro.whatHappened, input.whatHappened);
  record("Retrospective creation, saved edit and offline analysis succeed");

  let content = await createAndGenerate(retro.id, "返工前先确认交付标准");
  const aiDraft = content.aiDraft;
  const editedWriting = { ...content.writing!, title: "我先确认三项交付标准", body: "人工核对后的合成正文：我把使用场景、交付格式和截止时间写成清单，发给对方确认后再开始。下次继续验证这一步是否减少返工。" };
  content = PublishedContentSchema.parse(await request(`${base}/contents/${content.id}/review`, "PUT", {
    revision: content.revision, writing: editedWriting, english: null, note: "已人工核对合成事实。", status: "review",
  }));
  assert.equal(content.status, "review");
  assert.deepEqual(content.aiDraft, aiDraft);
  const blockedPublication = ApiErrorSchema.parse(await request(`${base}/contents/${content.id}/publish`, "POST", {
    revision: content.revision, publishTime: new Date(Date.now() - 60_000).toISOString(),
  }, 409));
  assert.equal(blockedPublication.error.code, "REVIEW_REQUIRED");
  record("Saved human edits retain the AI original; publication requires approval");
  content = PublishedContentSchema.parse(await request(`${base}/contents/${content.id}/review`, "PUT", {
    revision: content.revision, writing: content.writing, english: null, note: content.note, status: "ready",
  }));
  assert.equal(content.status, "ready");
  content = PublishedContentSchema.parse(await request(`${base}/contents/${content.id}/publish`, "POST", {
    revision: content.revision, publishTime: new Date(Date.now() - 60_000).toISOString(),
  }));
  assert.equal(content.status, "published");
  const metric = ContentMetricsSchema.parse(await request(`${base}/contents/${content.id}/metrics`, "POST", {
    views: 123, likes: 8, favorites: 4, comments: 2, followersGained: 1, note: "合成指标，未在外部平台发布。",
  }));
  const feedback = ContentFeedbackSchema.parse(await request(`${base}/contents/${content.id}/analyze`, "POST"));
  assert.equal(feedback.metricsId, metric.id);
  record("Approved local publication snapshot, metrics and feedback are saved");

  const reviewing = await createAndGenerate(retro.id, "保留待审核的生成历史");
  const readyDraft = await createAndGenerate(retro.id, "保留已通过审核的草稿");
  const ready = PublishedContentSchema.parse(await request(`${base}/contents/${readyDraft.id}/review`, "PUT", {
    revision: readyDraft.revision, writing: readyDraft.writing, english: null, note: "已审核，尚未记录发布。", status: "ready",
  }));
  const rejectedDraft = await createAndGenerate(retro.id, "保留人工拒绝记录");
  const rejected = PublishedContentSchema.parse(await request(`${base}/contents/${rejectedDraft.id}/reject`, "POST", {
    revision: rejectedDraft.revision, reason: "bad_title",
  }));
  assert.equal(rejected.status, "rejected");
  record("Generation history includes separate review, ready and rejected states");

  const item = ContentItemSchema.parse(await request("/api/v1/studio/content-items", "POST", {
    accountId: "personal_growth", sourceType: "daily_review", contentLane: "growth_review", content: input.whatHappened,
    licenseStatus: "original", sourcePlatform: null, sourceAuthor: null, sourceUrl: null,
  }));
  const generatedHistory = GeneratedContentSchema.parse(await request("/api/v1/studio/generated-contents", "POST", { contentIds: [item.id] }));
  const historyBefore = await request("/api/v1/generated-contents?accountId=personal_growth");
  assert.ok(Array.isArray(historyBefore));
  assert.ok(historyBefore.some(value => GeneratedContentSchema.parse(value).id === generatedHistory.id));
  record("Studio generation history is also stored in SQLite");

  const before = await state();
  assert.equal(before.contents.length, 4);
  assert.ok(before.strategies.length > 0, "Saved edits and rejection must retain learning strategies");
  evidence("before-restart.json", { state: before, generatedHistory: historyBefore });
  await stopOwnedApi();
  assert.equal(readFileSync(sqlitePath).subarray(0, 16).toString("utf8"), "SQLite format 3\0");
  record("First API process exits; durable SQLite file exists");
  await startApi();
  assert.equal(new Set(processes.map(value => value.pid)).size, 2, "Restart must use a distinct process");
  const after = await state();
  assert.deepEqual(canonical(after), canonical(before));
  assert.equal(after.contents.find(value => value.id === content.id)?.writing?.body, editedWriting.body);
  assert.equal(after.contents.find(value => value.id === reviewing.id)?.status, "review");
  assert.equal(after.contents.find(value => value.id === ready.id)?.status, "ready");
  assert.equal(after.contents.find(value => value.id === rejected.id)?.rejectReason, "bad_title");
  const historyAfter = await request("/api/v1/generated-contents?accountId=personal_growth");
  assert.deepEqual(historyAfter, historyBefore);
  evidence("after-restart.json", { state: after, generatedHistory: historyAfter });
  record("Fresh API process restores exact retrospectives, edits, history, review states, metrics, feedback and strategies");

  const staleRetro = ApiErrorSchema.parse(await request(`${base}/retrospectives/${retro.id}`, "PUT", {
    revision: retro.revision - 1, input,
  }, 409));
  assert.equal(staleRetro.error.code, "STALE_REVISION");
  const staleContent = ApiErrorSchema.parse(await request(`${base}/contents/${reviewing.id}/review`, "PUT", {
    revision: reviewing.revision - 1, writing: reviewing.writing, english: null, note: "必须被拒绝的旧版本。", status: "ready",
  }, 409));
  assert.equal(staleContent.error.code, "STALE_REVISION");
  assert.deepEqual(canonical(await state()), canonical(after), "Rejected stale writes must leave persisted state unchanged");
  const cachedFeedback = ContentFeedbackSchema.parse(await request(`${base}/contents/${content.id}/analyze`, "POST"));
  assert.deepEqual(cachedFeedback, feedback);
  record("Restarted API rejects stale revisions with standard envelopes and preserves cached feedback");
  await stopOwnedApi();
  evidence("result.json", { result: "PASS", paidApiCalls: 0, checks: checks.length, steps: checks, processes, sqlitePath, evidence: runDirectory });
  console.log(JSON.stringify({ result: "PASS", checks: checks.length, paidApiCalls: 0, evidence: runDirectory }));
} catch (error) {
  await stopOwnedApi();
  evidence("result.json", { result: "FAIL", checks: checks.length, steps: checks, processes, error: error instanceof Error ? error.message : String(error), evidence: runDirectory });
  throw error;
} finally {
  await stopOwnedApi();
}
