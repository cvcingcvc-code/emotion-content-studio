import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "../english/provider.js";

// Real browser → isolated real HTTP API → actual PNG renderer. No paid model calls.
const root = await mkdtemp(join(tmpdir(), "growth-loop-smoke-"));
const app = await buildApp({ englishWorkflow: { root, writer: createEnglishWriter({}) } });
const address = await app.listen({ port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
page.setDefaultTimeout(20_000);
const pageErrors: string[] = [];
const resourceErrors: string[] = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") resourceErrors.push(message.text()); });
page.on("requestfailed", request => resourceErrors.push(request.url() + " " + request.failure()?.errorText));
try {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: address + url.pathname + url.search }) });
  });
  await page.goto(process.env.GROWTH_SMOKE_WEB_URL ?? "http://127.0.0.1:5173/");
  await page.getByRole("heading", { name: "Today · 今日行动" }).waitFor();
  await page.getByRole("button", { name: "加载7篇离线演示数据" }).click();
  await page.getByText(/仅使用合成 Demo 内容：最近7篇/).waitFor();
  await page.getByRole("link", { name: "记录今天发生了什么" }).click();
  const fields = {
    "今天发生了什么": "今天接到一份材料修改任务，没有确认交付范围就开始做，下午又因为理解不同重新整理了一遍。",
    "我当时怎么处理的": "看到消息后直接开始修改，没有先列出需要确认的问题。",
    "哪里让我不舒服 / 犹豫 / 焦虑 / 浪费时间": "花了时间却没有对齐要求，反复返工。",
    "现在回头看哪里可以处理得更好": "开始前确认使用对象、交付格式和验收标准。",
    "我学到了什么": "先确认范围，再投入时间。",
    "下次遇到类似情况怎么做": "把三个确认问题发给对方，收到回复后再开始。",
  };
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "保存复盘", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Retrospective", exact: true }).click();
  await page.getByRole("heading", { name: "Content Potential: 8/10" }).waitFor();
  await page.getByRole("link", { name: "Create Content", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).fill("返工前，先确认这三件事");
  await page.getByRole("button", { name: "Create Content", exact: true }).click();
  await page.getByRole("button", { name: "Generate Content", exact: true }).click();
  await page.getByLabel("内容正文").fill("审核后的真实复盘：开始之前先确认交付对象、格式和验收标准。下一次我会先把这三项写清楚，再开始动手。");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Content Preview 1"]');
  await frame.locator(".copy").waitFor();
  assert.match(await frame.locator(".copy").innerText(), /审核后的真实复盘/);
  const dimensions = await page.locator(".loop-preview").boundingBox();
  assert.ok(dimensions && Math.abs(dimensions.width / dimensions.height - .75) < .01);
  const request = page.waitForRequest(req => req.url().endsWith("/growth-loop/preview/png"));
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export Current Page", exact: true }).click();
  assert.match((await request).postDataJSON().content.writing.body, /审核后的真实复盘/);
  const download = await downloadPromise, pngPath = join(root, download.suggestedFilename());
  await download.saveAs(pngPath);
  const png = await readFile(pngPath); assert.equal(png.readUInt32BE(16), 900); assert.equal(png.readUInt32BE(20), 1200);
  await page.screenshot({ path: join(root, "review-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "批准", exact: true }).click();
  await page.getByRole("button", { name: "Mark as Published", exact: true }).click();
  await page.getByRole("heading", { name: "Daily Content Feedback · 手动录入" }).waitFor();
  for (const [name, value] of Object.entries({ views: 1800, likes: 120, favorites: 160, comments: 16, followersGained: 12 })) await page.getByLabel(name, { exact: true }).fill(String(value));
  await page.getByRole("button", { name: "保存流量", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Performance", exact: true }).click();
  await page.getByRole("heading", { name: "KEEP / CHANGE / NEXT EXPERIMENT", exact: true }).waitFor();
  await page.screenshot({ path: join(root, "feedback.png"), fullPage: true });
  await page.getByRole("link", { name: "返回 Dashboard 查看下一篇策略 →" }).click();
  await page.getByText(/仅使用真实内容：最近1篇/).waitFor();
  await page.screenshot({ path: join(root, "dashboard.png"), fullPage: true });
  await page.getByRole("link", { name: /1\. .*一个新的具体场景/ }).click();
  const state = (await app.inject("/api/v1/growth-loop")).json().data;
  await page.getByLabel("真实复盘来源").selectOption(state.retrospectives[0].id);
  await page.getByRole("button", { name: "Create Content", exact: true }).click();
  await page.getByText("本篇唯一实验：hook", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Generate Content", exact: true }).click();
  await page.getByLabel("内容正文").waitFor();
  assert.match(await page.getByLabel("内容正文").inputValue(), /如果你也遇到/);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("heading", { name: "Feedback History", exact: true }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ result: "PASS", flow: "retrospective → opportunity → generate → edit → preview → PNG → approve → publish → metrics → feedback → focus → next content", demoPosts: 7, sourceExperimentPreserved: true, png: "900x1200", output: root }));
} catch (error) {
  await page.screenshot({ path: join(root, "failure.png"), fullPage: true }).catch(() => {});
  console.error("Smoke failed at", page.url(), "Artifacts:", root, "Page errors:", pageErrors, "Resource errors:", resourceErrors);
  throw error;
} finally { await browser.close(); await app.close(); }
