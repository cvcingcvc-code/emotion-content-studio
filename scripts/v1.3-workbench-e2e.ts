/** Real browser, local SQLite and real five-page renderer; synthetic data and Mock only. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { buildApp } from "../apps/api/src/app.js";
import { createConfiguredRepository } from "../apps/api/src/content/repository-factory.js";
import { readServerConfig } from "../apps/api/src/config.js";
import { createEnglishWriter } from "../apps/api/src/english/provider.js";
import { growthPublishText, type PublishedContent, type GrowthLoopState } from "@emotion-studio/contracts";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidenceBase = join(root, ".tmp-check/v1.3-workbench-e2e"); mkdirSync(evidenceBase, { recursive: true });
const evidence = mkdtempSync(join(evidenceBase, "run-" + new Date().toISOString().replaceAll(/[:.]/g, "-") + "-"));
const sqlite = join(evidence, "studio.sqlite"), englishRoot = join(evidence, "english");
const checks: string[] = [], errors: string[] = [];
const record = (message: string) => { checks.push(message); console.log("  · " + message); };
let app!: Awaited<ReturnType<typeof buildApp>>;
let origin = "";
let pageForEvidence: Page | undefined;
async function start() {
  const storage = createConfiguredRepository(readServerConfig({ NODE_ENV: "test", CONTENT_REPOSITORY: "sqlite", SQLITE_PATH: sqlite, AI_PROVIDER: "mock", AI_ALLOW_PAID_CALLS: "false" }));
  app = await buildApp({ contentRepository: storage.repository, contentRepositoryMode: "sqlite", englishWorkflow: { root: englishRoot, writer: createEnglishWriter({}) } });
  app.addHook("onClose", storage.close);
  origin = await app.listen({ host: "127.0.0.1", port: 0 });
}
async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(origin + "/api/v1" + path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { "content-type": "application/json" } }) });
  const body = await res.json() as { ok: boolean; data: T };
  assert.equal(res.ok && body.ok, true, JSON.stringify(body)); return body.data;
}
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  await start();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage(); pageForEvidence = page; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => { const url = new URL(route.request().url()); await route.fulfill({ response: await route.fetch({ url: origin + url.pathname + url.search }) }); });
  const web = process.env.WORKBENCH_WEB_URL ?? "http://127.0.0.1:5173";
  const retro = await api<{ id: string; revision: number }>("/growth-loop/retrospectives", "POST", { date: "2026-10-09", whatHappened: "今天下午我接到活动物料修改任务，没有先确认使用对象和交付格式就开始做。对方需要竖版，我却交了横版，花了一下午返工。我当时立刻动手，问题是没有把验收标准问清楚。我学到的是先确认范围，下次我会先把使用场景、交付格式和截止时间发给对方确认。", optionalNote: "合成回归记录，不来自用户。" });
  const analyzed = await api<{ analysis: { contentPotential: number } }>("/growth-loop/retrospectives/" + retro.id + "/analyze", "POST", { revision: retro.revision });
  assert.ok(analyzed.analysis.contentPotential >= 6, "Synthetic retrospective must qualify as a content opportunity");
  writeFileSync(join(evidence, "seed-retrospective.json"), JSON.stringify(analyzed, null, 2));
  await page.goto(web + "/xiaohongshu");
  await page.getByRole("heading", { name: "小红书内容工作台", exact: true }).waitFor();
  writeFileSync(join(evidence, "form-labels.json"), JSON.stringify(await page.locator("label").allTextContents(), null, 2));
  await page.getByLabel(/^内容账号/).selectOption("emotion");
  await page.getByLabel("主题列表（每行一个，最多10个）", { exact: true }).fill("一个人也能认真过周末\n允许自己慢慢恢复\n一个人也能认真过周末");
  await page.getByRole("button", { name: "批量生成", exact: true }).click();
  await page.getByText("本批完成：生成 2 篇，重复 1 条，失败 0 条。生成结果仍需逐篇审核。", { exact: true }).waitFor();
  let state = await api<GrowthLoopState>("/growth-loop");
  assert.equal(state.contents.length, 2); assert.ok(state.contents.every(item => item.status === "review" && item.provider === "mock"));
  record("UI batch generated two drafts and reused duplicate without automatic approval");
  await page.getByLabel(/^内容账号/).selectOption("growth");
  await page.getByLabel(/真实复盘来源/).selectOption(retro.id);
  await page.getByLabel("主题列表（每行一个，最多10个）", { exact: true }).fill("动手之前确认尺寸");
  await page.getByRole("button", { name: "批量生成", exact: true }).click();
  await page.getByText("本批完成：生成 1 篇，重复 0 条，失败 0 条。生成结果仍需逐篇审核。", { exact: true }).waitFor();
  state = await api<GrowthLoopState>("/growth-loop"); assert.equal(state.contents.length, 3);
  record("Growth batch uses a real analyzed retrospective source");
  await page.getByRole("button", { name: "选择当前列表", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "导出 JSON", exact: true }).isDisabled(), true);
  record("Bulk export remains disabled for unreviewed selection");
  const emotion = state.contents.filter(item => item.account === "emotion");
  const editedTitle = "给慢慢恢复的自己一点时间";
  for (const [index, content] of emotion.entries()) {
    await page.goto(web + "/growth-content/" + content.id);
    await page.getByLabel("内容标题", { exact: true }).waitFor();
    if (index === 0) {
      await page.getByLabel("内容标题", { exact: true }).fill(editedTitle);
      const body = page.getByLabel("内容正文", { exact: true });
      await body.fill((await body.inputValue()) + "\n\n合成验收手工补充：今晚先完成一件小事。");
      const current = await page.getByLabel("可复制的发布文案", { exact: true }).inputValue();
      await page.getByRole("button", { name: "复制发布文案", exact: true }).click();
      await page.getByText("已复制", { exact: true }).waitFor();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      writeFileSync(join(evidence, "review-clipboard.txt"), copied);
      assert.equal(copied.replaceAll("\r\n", "\n"), current);
      const unchanged = (await api<GrowthLoopState>("/growth-loop")).contents.find(item => item.id === content.id)!;
      assert.equal(unchanged.title, content.title); assert.equal(unchanged.status, "review");
      record("Review copy uses current edits without silently saving or approving");
    }
    await page.getByRole("button", { name: "通过审核 →", exact: true }).click();
    await page.getByText("状态：已通过", { exact: true }).waitFor();
  }
  state = await api<GrowthLoopState>("/growth-loop");
  const edited = state.contents.find(item => item.id === emotion[0]!.id)!;
  assert.equal(edited.title, editedTitle); assert.notDeepEqual(edited.writing, edited.aiDraft);
  assert.equal(state.contents.filter(item => item.status === "ready").length, 2);
  record("Manual edits and two explicit approvals persisted while AI originals remain intact");
  await page.goto(web + "/xiaohongshu");
  await page.getByLabel(/审核状态/).selectOption("ready");
  await page.getByRole("button", { name: "选择当前列表", exact: true }).click();
  await page.getByRole("button", { name: "导出 JSON", exact: true }).waitFor({ state: "visible" });
  const selected = state.contents.filter(item => item.status === "ready").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const expected = await api<{ content: string }>("/growth-loop/batch/export", "POST", { items: selected.map(({ id, revision }) => ({ id, revision })), format: "text" });
  await page.getByRole("button", { name: "复制所选发布文案", exact: true }).click();
  await page.getByText("已复制。", { exact: true }).waitFor();
  const bulkCopied = await page.evaluate(() => navigator.clipboard.readText()); writeFileSync(join(evidence, "batch-clipboard.txt"), bulkCopied);
  assert.equal(bulkCopied.replaceAll("\r\n", "\n"), expected.content);
  for (const format of ["TXT", "JSON"]) {
    const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "导出 " + format, exact: true }).click();
    const download = await downloaded, path = join(evidence, download.suggestedFilename()); await download.saveAs(path);
    const text = readFileSync(path, "utf8");
    if (format === "TXT") assert.equal(text, expected.content);
    else { const exported = JSON.parse(text); assert.equal(exported.contents.length, 2); assert.ok(text.includes(editedTitle)); assert.equal(exported.contents.find((item: PublishedContent) => item.id === edited.id).publishText, growthPublishText(edited)); }
  }
  record("Browser clipboard and actual TXT/JSON downloads match the approved saved revisions");
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Workbench must fit width " + width);
    await page.screenshot({ path: join(evidence, "workbench-" + width + ".png"), fullPage: true, animations: "disabled" });
    if (width === 375) assert.equal(await page.locator("#primary-sidebar").evaluate(element => element.getBoundingClientRect().right <= 1), true, "Closed mobile menu must not cover content");
  }
  record("Workbench fits desktop and 375px viewport without horizontal overflow");
  await page.setViewportSize({ width: 1280, height: 1000 }); await page.goto(web + "/english");
  await page.getByLabel("主题", { exact: true }).fill("尴尬时刻英语50句");
  await page.getByRole("button", { name: /^Generate/ }).click(); await page.getByLabel("英文 1", { exact: true }).waitFor();
  await page.getByLabel("英文 1", { exact: true }).fill("Sorry, I thought you were my friend.");
  await page.getByLabel("中文 1", { exact: true }).fill("不好意思，我还以为你是我朋友。");
  for (let n = 1; n <= 5; n++) {
    await page.getByRole("navigation", { name: "预览页码" }).getByRole("button", { name: String(n), exact: true }).click();
    const preview = page.locator('iframe[title="Preview Page ' + n + '"]'); await preview.scrollIntoViewIfNeeded();
    const frame = page.frameLocator('iframe[title="Preview Page ' + n + '"]'); await frame.locator("li").first().waitFor(); assert.equal(await frame.locator("li").count(), 10);
    if (n === 1) { assert.equal(await frame.locator(".en").first().textContent(), "Sorry, I thought you were my friend."); assert.equal(await frame.locator(".zh").first().textContent(), "不好意思，我还以为你是我朋友。"); }
  }
  await page.getByRole("button", { name: "批准", exact: true }).first().click(); await page.getByText("已批准。可以生成最终发布包。", { exact: true }).waitFor();
  const packageResponse = page.waitForResponse(res => res.url().endsWith("/export") && res.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "Generate Publishing Package", exact: true }).first().click();
  const res = await packageResponse; assert.equal(res.status(), 200); const pack = (await res.json()).data;
  assert.equal(pack.files.length, 7);
  for (const file of pack.files as { name: string; url: string }[]) {
    const fetched = await fetch(origin + file.url); assert.equal(fetched.status, 200); const bytes = Buffer.from(await fetched.arrayBuffer()); writeFileSync(join(evidence, file.name), bytes, { flag: "wx" });
    if (file.name.endsWith(".png")) { assert.equal(bytes.readUInt32BE(16), 900); assert.equal(bytes.readUInt32BE(20), 1200); }
  }
  const packageData = JSON.parse(readFileSync(join(evidence, "content.json"), "utf8")); assert.equal(packageData.writing.sentences.length, 50); assert.equal(packageData.pages.length, 5); assert.equal(packageData.writing.sentences[0].english, "Sorry, I thought you were my friend.");
  await page.screenshot({ path: join(evidence, "english-package.png"), fullPage: false });
  record("English 50 live edits approved and real five 900x1200 PNGs plus Markdown/JSON exported");
  const before = await api<GrowthLoopState>("/growth-loop"); const englishBefore = await api("/english");
  writeFileSync(join(evidence, "before.json"), JSON.stringify({ state: before, english: englishBefore }, null, 2));
  await app.close(); await start();
  assert.deepEqual(await api("/growth-loop"), before); assert.deepEqual(await api("/english"), englishBefore);
  await page.goto(web + "/xiaohongshu"); await page.getByRole("heading", { name: editedTitle, exact: true }).waitFor();
  await page.goto(web + "/english"); await page.getByRole("link", { name: /尴尬时刻英语50句.*已导出/ }).waitFor();
  record("Reopened SQLite and English history preserve edited content, audit states and exported package");
  assert.deepEqual(errors, []); record("No browser page errors and no paid provider calls");
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ result: "PASS", checkpoints: checks.length, checks, browserErrors: errors, paidCalls: 0, evidence }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ result: "PASS", checkpoints: checks.length, evidence }));
} catch (error) {
  if (pageForEvidence && !pageForEvidence.isClosed()) { await pageForEvidence.screenshot({ path: join(evidence, "failure.png"), fullPage: true }).catch(() => undefined); writeFileSync(join(evidence, "failure.html"), await pageForEvidence.content()); }
  writeFileSync(join(evidence, "failure.json"), JSON.stringify({ checks, browserErrors: errors, error: error instanceof Error ? error.message : String(error) }, null, 2)); throw error;
}
finally { await browser.close(); if (app!) await app.close(); }
