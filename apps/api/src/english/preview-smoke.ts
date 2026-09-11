import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { buildApp } from "../app.js";
import { createEnglishWriter } from "./provider.js";

// Real UI + local API + real renderer. Isolated history; no paid model calls.
const root = await mkdtemp(join(tmpdir(), "english-preview-smoke-"));
const app = await buildApp({ englishWorkflow: { root, writer: createEnglishWriter({}) } });
const address = await app.listen({ port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: address + url.pathname + url.search }) });
  });
  await page.goto(process.env.ENGLISH_SMOKE_WEB_URL ?? "http://127.0.0.1:5173/english");
  await page.getByLabel("主题", { exact: true }).fill("尴尬时刻英语50句");
  await page.getByRole("button", { name: /^Generate/ }).click();
  await page.getByLabel("英文 1", { exact: true }).fill("Sorry, I thought you were my friend.");
  await page.getByLabel("中文 1", { exact: true }).fill("不好意思，我还以为你是我朋友。");
  for (let n = 1; n <= 5; n++) {
    await page.getByRole("navigation", { name: "预览页码" }).getByRole("button", { name: String(n), exact: true }).click();
    const frame = page.frameLocator('iframe[title="Preview Page ' + n + '"]');
    await frame.locator("li").first().waitFor();
    assert.equal(await frame.locator("li").count(), 10);
    assert.equal(await frame.locator(".number").first().textContent(), String(n * 10 - 9).padStart(2, "0"));
    if (n === 1) {
      assert.equal(await frame.locator(".en").first().textContent(), "Sorry, I thought you were my friend.");
      assert.equal(await frame.locator(".zh").first().textContent(), "不好意思，我还以为你是我朋友。");
    }
    const overflow = await frame.locator("li").evaluateAll(`[...document.querySelectorAll("li")].some(row => row.querySelector(".line").getBoundingClientRect().height > row.getBoundingClientRect().height)`);
    assert.equal(overflow, false, "Page " + n + " must not overflow");
  }
  await page.getByRole("navigation", { name: "预览页码" }).getByRole("button", { name: "1", exact: true }).click();
  const exportRequest = page.waitForRequest((request) => request.url().endsWith("/preview/png"));
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export Current Page", exact: true }).click();
  const payload = (await exportRequest).postDataJSON();
  assert.equal(payload.page, 1);
  assert.equal(payload.writing.sentences[0].chinese, "不好意思，我还以为你是我朋友。");
  const image = await download;
  const output = join(root, "verified");
  await mkdir(output);
  const path = join(output, image.suggestedFilename());
  await image.saveAs(path);
  const png = await readFile(path);
  assert.equal(png.readUInt32BE(16), 900);
  assert.equal(png.readUInt32BE(20), 1200);
  await page.screenshot({ path: join(output, "review-preview.png"), fullPage: false });
  console.log(JSON.stringify({ result: "PASS", pages: 5, sentencesPerPage: 10, liveEdits: true, exportPage: payload.page, png: "900x1200", output }));
} finally { await browser.close(); await app.close(); }
