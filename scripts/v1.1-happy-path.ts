/**
 * V1.1 browser regression, adapted from the preserved .tmp-check/walk.ts.
 * From the repository root:
 *   npm run build -w @emotion-studio/contracts
 *   npm run dev -w @emotion-studio/web
 *   npx tsx scripts/v1.1-happy-path.ts
 * WEB_URL overrides http://127.0.0.1:5173; SHOT_DIR overrides .tmp-check/v1.1-shots.
 * Only the web server must already be running. Every browser /api request goes
 * to this script's fresh memory API on an ephemeral port. Explicit mock/demo
 * providers and a fresh English root prevent model calls or user-data access.
 * Each run gets a new evidence directory; existing walk.ts/screenshots survive.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { GrowthDashboardSchema, GrowthLoopStateSchema, type GrowthLoopState } from "@emotion-studio/contracts";
import { buildApp } from "../apps/api/src/app.js";
import { createContentRepository } from "../apps/api/src/content/repository.js";
import { createEnglishWriter } from "../apps/api/src/english/provider.js";
import { GrowthLoopAgent } from "../apps/api/src/growth-loop/provider.js";

const web = process.env.WEB_URL ?? "http://127.0.0.1:5173";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(web).hostname), "WEB_URL must be a local frontend");
const evidenceBase = resolve(process.env.SHOT_DIR ?? ".tmp-check/v1.1-shots");
mkdirSync(evidenceBase, { recursive: true });
const shotDir = mkdtempSync(join(evidenceBase, "run-" + new Date().toISOString().replaceAll(/[:.]/g, "-") + "-"));
const app = await buildApp({
  contentRepository: createContentRepository({ nodeEnv: "test" }),
  contentRepositoryMode: "memory",
  aiProvider: "mock",
  growthLoopAgent: new GrowthLoopAgent(),
  englishWorkflow: { root: join(shotDir, "isolated-english"), writer: createEnglishWriter({ ENGLISH_AI_MODE: "demo" }) },
});
const address = await app.listen({ port: 0, host: "127.0.0.1" });
let browser: Browser | undefined;
let page: Page;
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const steps: string[] = [];
const record = (message: string) => { steps.push(message); console.log("  · " + message); };
const evidence = (name: string, value: unknown) => writeFileSync(join(shotDir, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
async function shot(name: string) { await page.screenshot({ path: join(shotDir, name + ".png"), fullPage: true }); }
async function apiData(path: string) {
  const response = await app.inject(path);
  assert.equal(response.statusCode, 200, path + " must succeed");
  return response.json().data as unknown;
}
async function appState() { return GrowthLoopStateSchema.parse(await apiData("/api/v1/growth-loop")); }
async function dashboard() { return GrowthDashboardSchema.parse(await apiData("/api/v1/growth-loop/dashboard")); }
async function waitEnabled(locator: Locator, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) return;
    await page.waitForTimeout(100);
  }
  throw new Error("控件始终未变为可用：" + String(locator));
}
function localDateTime(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function assertRealLearning(state: GrowthLoopState) {
  for (const content of state.contents.filter(item => !item.isDemo && item.debug)) {
    for (const used of content.debug!.feedbackUsed) {
      const source = state.contents.find(item => item.id === used.contentId);
      const feedback = state.feedback.find(item => item.id === used.feedbackId);
      assert.ok(source && !source.isDemo, "Every learning content ID must resolve to real-flow content");
      assert.equal(source.account, content.account, "Learning must remain in the same account");
      assert.equal(source.status, "published");
      assert.ok(feedback, "Every learning feedback ID must exist");
      assert.equal(feedback.contentId, source.id);
      assert.ok(state.metrics.some(item => item.id === feedback.metricsId && item.contentId === source.id), "Learning must have matching metrics evidence");
    }
  }
}

const RETRO = "今天下午接到一份活动物料修改任务，我没有先确认使用对象和交付格式就开始改版，结果对方要的是竖版海报，我交的是横版，一个下午都在返工。当时我的反应是立刻动手，现在回头看，问题出在没有先把验收标准问清楚。我学到的是先确认范围再投入时间，下次接到类似任务，我会先把使用场景、交付格式、截止时间这三件事发给对方确认后再开始。";
async function recordRetrospective() {
  await page.goto(web + "/retrospectives", { waitUntil: "domcontentloaded" });
  await page.locator("textarea.retrospective-main-input").fill(RETRO);
  await page.getByRole("button", { name: "保存复盘", exact: true }).click();
  await page.waitForURL(/\/retrospectives\/[0-9a-f-]+/);
  const retroId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "分析复盘", exact: true }).click();
  await page.getByRole("heading", { name: "内容机会分析" }).waitFor();
  const retrospective = (await appState()).retrospectives.find(item => item.id === retroId);
  assert.ok(retrospective?.analysis && retrospective.analysis.contentPotential >= 6, "Retrospective must produce a content opportunity");
  record(`Retrospective 已记录并分析（潜力 ${retrospective.analysis.contentPotential}/10）`);
  await shot("02-retrospective-opportunity");
  return retroId;
}

async function createAndGenerate(opts: { retroId: string; topic: string; viaDashboard: boolean; first?: boolean }) {
  if (opts.viaDashboard) {
    await page.goto(web + "/", { waitUntil: "domcontentloaded" });
    await page.locator(".loop-list a").first().click();
    await page.waitForURL(/\/create/);
  } else {
    await page.goto(`${web}/create?sourceRetrospectiveId=${opts.retroId}&account=growth&contentType=solution`, { waitUntil: "domcontentloaded" });
  }
  const retroSelect = page.locator(".retro-selector select");
  if (await retroSelect.count()) await retroSelect.selectOption(opts.retroId);
  await page.locator('.creation-form input[type="text"]').fill(opts.topic);
  await page.getByRole("button", { name: "生成内容 →", exact: true }).click();
  await page.getByRole("heading", { name: "内容创建成功！" }).waitFor();
  await page.getByRole("button", { name: "立即进入内容审核 →", exact: true }).click();
  await page.waitForURL(/\/growth-content\//);
  const id = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "生成内容", exact: true }).click();
  await page.getByLabel("内容正文").waitFor();
  const state = await appState();
  const content = state.contents.find(item => item.id === id);
  assert.ok(content?.debug, "Generation must preserve debug evidence");
  assert.equal(content.isDemo, false);
  assert.equal(content.provider, "mock");
  assert.equal(content.debug.promptVersion, "growth-loop.v3");
  assert.ok(content.debug.finalGenerationContext.length > 0);
  assertRealLearning(state);
  if (opts.first) {
    assert.equal(content.debug.feedbackUsed.length, 0, "First real-flow generation must not consume demo feedback");
    await page.locator(".loop-learning").getByText(/没有可用的上一轮学习/).waitFor();
    const panelText = await page.locator(".loop-learning").innerText();
    assert.match(panelText, /0 条/);
    assert.match(panelText, /演示数据不会与真实数据混用/);
    evidence("first-generation-debug.json", { id, debug: content.debug, panelText });
    await shot("03-first-generation-no-learning");
    record("首次真实流程生成：feedbackUsed=0，UI 明确无学习且保留完整 debug evidence");
  }
  return id;
}

async function publishPiece(opts: { retroId: string; topic: string; views: number; minutesAgo: number; viaDashboard: boolean; first?: boolean }) {
  const id = await createAndGenerate(opts);
  await page.getByLabel("内容正文").fill(`人工审核后的正文：${opts.topic}。先把使用对象、交付格式和截止时间写清楚，再开始动手。`);
  await page.getByRole("button", { name: "通过审核 →", exact: true }).click();
  const publishButton = page.getByRole("button", { name: "标记为已发布", exact: true });
  await waitEnabled(publishButton);
  await page.getByLabel("发布时间").fill(localDateTime(opts.minutesAgo));
  await publishButton.click();
  await page.getByRole("heading", { name: /Daily Content Feedback/ }).waitFor();
  for (const [label, value] of Object.entries({ views: opts.views, likes: Math.round(opts.views * 0.05), favorites: Math.round(opts.views * 0.03), comments: 1, followersGained: 1 })) {
    await page.getByLabel(label, { exact: true }).fill(String(value));
  }
  await page.getByRole("button", { name: "保存流量", exact: true }).click();
  const analyze = page.getByRole("button", { name: "Analyze Performance", exact: true });
  await waitEnabled(analyze);
  await analyze.click();
  await page.getByRole("heading", { name: /KEEP \/ CHANGE \/ NEXT EXPERIMENT/ }).waitFor();
  const state = await appState();
  const feedback = state.feedback.find(item => item.contentId === id);
  assert.ok(feedback, "Analyze must produce feedback");
  assert.equal(state.metrics.filter(item => item.contentId === id).length, 1, "One save must produce one metrics record");
  for (const comparison of Object.values(feedback.comparisons)) {
    assert.ok(comparison.contentIds.every(sourceId => state.contents.some(item => item.id === sourceId && !item.isDemo)), "Historical comparisons must exclude every demo content ID");
  }
  record(`内容已发布并分析：${opts.views} views → ${feedback.verdict}（${feedback.confidence}）`);
  return { id, verdict: feedback.verdict, feedback };
}

try {
  browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  page.setDefaultTimeout(25_000);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: address + url.pathname + url.search, timeout: 90_000 }) });
  });
  console.log("EVIDENCE " + shotDir);
  const initial = await appState();
  assert.equal(initial.contents.length, 0, "Isolated growth-loop must start empty");
  assert.equal(initial.retrospectives.length, 0);

  await page.goto(web + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Today · 今日行动" }).waitFor();
  const seeded = page.waitForResponse(response => response.url().endsWith("/growth-loop/demo") && response.request().method() === "POST");
  await page.getByRole("button", { name: "加载7篇离线演示数据", exact: true }).click();
  assert.equal((await seeded).status(), 200);
  await page.goto(web + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "NEXT 3 POSTS" }).waitFor();
  const demoState = await appState();
  const demoContents = demoState.contents.filter(item => item.isDemo);
  assert.equal(demoContents.length, 7);
  assert.equal(demoState.contents.filter(item => !item.isDemo).length, 0);
  const demoDashboard = await dashboard();
  assert.equal(demoDashboard.mode, "mock");
  assert.equal(demoDashboard.repository, "memory");
  assert.ok(demoDashboard.focus.NEXT_3_POSTS.every(post => post.sourceContentId === null), "Demo-only dashboard must not inject demo upstream IDs into real creation");
  const homepage = await page.locator(".growth-loop").innerText();
  const focusJson = JSON.stringify(demoDashboard.focus);
  for (const demo of demoContents) {
    assert.ok(!homepage.includes(demo.topic), "Real dashboard must not display a demo-only topic: " + demo.topic);
    assert.ok(!focusJson.includes(demo.id) && !focusJson.includes(demo.topic), "Focus evidence must exclude every demo ID/topic");
  }
  for (const href of await page.locator(".loop-list a").evaluateAll(links => links.map(link => link.getAttribute("href") ?? ""))) {
    assert.equal(new URL(href, web).searchParams.get("sourceContentId"), null);
  }
  evidence("demo-only-dashboard.json", { demoContentIds: demoContents.map(item => item.id), dashboard: demoDashboard });
  record("Demo 数据已加载；真实首页 Focus / NEXT 3 POSTS 无 Demo topic 或 sourceContentId");
  await shot("01-demo-only-dashboard");

  const retroId = await recordRetrospective();
  const first = await publishPiece({ retroId, topic: "返工前先确认这三件事", views: 100, minutesAgo: 150, viaDashboard: false, first: true });
  await shot("04-first-feedback");
  for (const [index, topic] of ["确认范围之后效率变高", "把交付标准写成清单", "先问清楚再动手"].entries()) {
    await publishPiece({ retroId, topic, views: 100, minutesAgo: 130 - index * 10, viaDashboard: true });
  }
  const keep = await publishPiece({ retroId, topic: "确认清单让返工消失了", views: 600, minutesAgo: 90, viaDashboard: true });
  assert.equal(keep.verdict, "KEEP");
  await shot("05-verdict-keep");
  const change = await publishPiece({ retroId, topic: "被临时消息打断的一天", views: 10, minutesAgo: 70, viaDashboard: true });
  assert.equal(change.verdict, "CHANGE");
  const neutral = await publishPiece({ retroId, topic: "照常推进的一天", views: 100, minutesAgo: 50, viaDashboard: true });
  assert.equal(neutral.verdict, "NEXT_EXPERIMENT");

  const nextId = await createAndGenerate({ retroId, topic: "带着上一轮学习写下一篇", viaDashboard: true });
  const panelText = (await page.locator(".loop-learning").innerText()).replace(/\s+/g, " ").trim();
  const state = await appState();
  const next = state.contents.find(item => item.id === nextId)!;
  const used = next.debug!.feedbackUsed;
  const verdicts = used.map(item => item.verdict);
  for (const verdict of ["KEEP", "CHANGE", "NEXT_EXPERIMENT"]) assert.ok(verdicts.includes(verdict as typeof verdicts[number]), "Next generation must include " + verdict);
  assert.equal(used[0]?.contentId, neutral.id, "Direct upstream feedback must be first");
  assert.match(panelText, /KEEP/);
  assert.match(panelText, /CHANGE/);
  assertRealLearning(state);
  evidence("next-generation-debug.json", { nextId, debug: next.debug, panelText });
  await shot("06-next-generation-learning");
  record("下一篇学习链：KEEP / CHANGE / NEXT_EXPERIMENT，直接上游优先，全部 ID 追溯到非 Demo 内容与指标");

  // V1.2 使用问题：已分析的复盘直接生成，不经过创建表单和空草稿页。
  await page.goto(`${web}/retrospectives/${retroId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "直接生成内容", exact: true }).waitFor();
  await shot("06b-direct-generation-entry");
  const countBeforeDirect = (await appState()).contents.length;
  await page.getByRole("button", { name: "直接生成内容", exact: true }).click();
  await page.waitForURL(/\/growth-content\//);
  await page.getByLabel("内容正文").waitFor();
  const directState = await appState();
  const direct = directState.contents.find(item => item.id === page.url().split("/").pop())!;
  const source = directState.retrospectives.find(item => item.id === retroId)!;
  assert.equal(directState.contents.length, countBeforeDirect + 1);
  assert.equal(direct.status, "review");
  assert.equal(direct.sourceRetrospectiveId, retroId);
  assert.equal(direct.sourceContentId, null);
  assert.equal(direct.topic, source.analysis!.recommendedTitleIdeas[0]);
  assert.equal(direct.account, source.analysis!.recommendedAccount);
  assert.equal(direct.contentType, source.analysis!.recommendedContentType);
  assert.equal(direct.isDemo, false);
  assert.ok(direct.writing?.body);
  assert.equal(direct.debug?.promptVersion, "growth-loop.v3");
  assertRealLearning(directState);
  evidence("direct-generation-debug.json", { id: direct.id, debug: direct.debug });
  await shot("06c-direct-generation-review");
  record("已分析复盘直接生成：一篇真实草稿、推荐配置、完整正文与 debug，直接进入待审核");

  await page.goto(web + "/performance", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Daily Feedback", exact: true }).waitFor();
  await shot("07-performance");
  await page.goto(web + "/history", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Feedback History", exact: true }).waitFor();
  await shot("08-history");
  record("Performance / History 路由通过");

  await page.goto(`${web}/growth-content/${nextId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "预览发布效果 →", exact: true }).click();
  await page.locator('iframe[title^="Content Preview"]').first().waitFor();
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "导出当前页", exact: true }).click();
  const download = await downloadPromise;
  const pngPath = join(shotDir, "exported-card.png");
  await download.saveAs(pngPath);
  const png = readFileSync(pngPath);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
  assert.equal(dimensions.width, 900);
  assert.equal(dimensions.height, 1200);
  evidence("png-evidence.json", { path: pngPath, suggestedFilename: download.suggestedFilename(), ...dimensions });
  await shot("09-png-preview");
  record("PNG 导出通过：有效 PNG 签名，900 × 1200，文件已保存");

  await page.goto(web + "/english", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "把生活，聊成英语。", exact: true }).waitFor();
  await page.getByText(/离线原创 Demo · 三个新主题/).waitFor();
  await waitEnabled(page.getByRole("button", { name: /^Generate/ }));
  assert.equal(await page.getByLabel("主题", { exact: true }).isEnabled(), true);
  await shot("10-english-smoke");
  record("English 现有页面 smoke：离线 Demo 已连接，主题与 Generate 控件可用");

  await page.goto(web + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "NEXT 3 POSTS", exact: true }).waitFor();
  const finalState = await appState();
  const finalDashboard = await dashboard();
  for (const post of finalDashboard.focus.NEXT_3_POSTS) {
    if (post.sourceContentId) assert.ok(finalState.contents.some(item => item.id === post.sourceContentId && !item.isDemo));
  }
  await shot("11-final-dashboard");
  evidence("final-state.json", finalState);
  evidence("final-dashboard.json", finalDashboard);
  assert.deepEqual(pageErrors, [], "No browser page errors are allowed");
  assert.deepEqual(consoleErrors, [], "No browser console errors are allowed");
  const result = { result: "PASS", isolatedApi: true, steps, firstVerdict: first.verdict, keep: keep.verdict, change: change.verdict, neutral: neutral.verdict, usedVerdicts: verdicts, png: dimensions, pageErrors, consoleErrors, evidence: shotDir };
  evidence("result.json", result);
  console.log("RESULT " + JSON.stringify(result));
} catch (error) {
  if (typeof page !== "undefined") await shot("99-failure").catch(() => {});
  evidence("failure.json", { message: error instanceof Error ? error.message : String(error), steps, pageErrors, consoleErrors });
  evidence("failure-state.json", await appState().catch(() => null));
  console.error("V1.1 HAPPY PATH FAILED", error, "Evidence:", shotDir);
  throw error;
} finally {
  await browser?.close();
  await app.close();
}
