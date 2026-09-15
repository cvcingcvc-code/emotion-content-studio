import { mkdirSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright";

const web = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const shotDir = process.env.SHOT_DIR ?? ".tmp-check/shots";
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
page.setDefaultTimeout(25_000);

const pageErrors: string[] = [];
const consoleErrors: string[] = [];
page.on("pageerror", e => pageErrors.push(e.message));
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });

const steps: string[] = [];
const record = (m: string) => { steps.push(m); console.log("  · " + m); };

async function shot(name: string) { await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true }); }
async function appState() { return page.evaluate(async () => (await fetch("/api/v1/growth-loop").then(r => r.json())).data as Record<string, any>); }

async function waitEnabled(locator: Locator, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) return;
    await page.waitForTimeout(150);
  }
  throw new Error("控件始终未变为可用：" + String(locator));
}

function localDateTime(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const RETRO = "今天下午接到一份活动物料修改任务，我没有先确认使用对象和交付格式就开始改版，结果对方要的是竖版海报，我交的是横版，一个下午都在返工。当时我的反应是立刻动手，现在回头看，问题出在没有先把验收标准问清楚。我学到的是先确认范围再投入时间，下次接到类似任务，我会先把使用场景、交付格式、截止时间这三件事发给对方确认后再开始。";

async function recordRetrospective() {
  await page.goto(web + "/retrospectives", { waitUntil: "domcontentloaded" });
  await page.locator("textarea.retrospective-main-input").fill(RETRO);
  await page.getByRole("button", { name: "保存复盘" }).click();
  await page.waitForURL(/\/retrospectives\/[0-9a-f-]+/);
  const retroId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "分析复盘" }).click();
  await page.getByRole("heading", { name: "内容机会分析" }).waitFor();
  const potential = await page.locator(".retrospective-analysis").getByText(/潜力 \d+\/10/).first().innerText().catch(() => "");
  record(`Retrospective 已记录并分析（${potential.trim()}）`);
  await shot("02-retrospective-opportunity");
  return { retroId, potential };
}

/** 走一遍真实 UI：创建 → 生成 → 人工审核 → 发布 → 录指标 → Analyze。 */
async function publishPiece(opts: { retroId: string; topic: string; views: number; minutesAgo: number; viaDashboard: boolean }) {
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
  await page.getByRole("button", { name: "生成内容 →" }).click();
  await page.getByRole("heading", { name: "内容创建成功！" }).waitFor();
  await page.getByRole("button", { name: "立即进入内容审核 →" }).click();
  await page.waitForURL(/\/growth-content\//);
  const id = page.url().split("/").pop()!;

  await page.getByRole("button", { name: "生成内容", exact: true }).click();
  await page.getByLabel("内容正文").waitFor();
  await page.getByLabel("内容正文").fill(`人工审核后的正文：${opts.topic}。先把使用对象、交付格式和截止时间写清楚，再开始动手。`);

  await page.getByRole("button", { name: "通过审核 →" }).click();
  const publishButton = page.getByRole("button", { name: "标记为已发布" });
  await waitEnabled(publishButton);
  await page.getByLabel("发布时间").fill(localDateTime(opts.minutesAgo));
  await publishButton.click();

  await page.getByRole("heading", { name: /Daily Content Feedback/ }).waitFor();
  await page.getByLabel("views", { exact: true }).fill(String(opts.views));
  await page.getByLabel("likes", { exact: true }).fill(String(Math.round(opts.views * 0.05)));
  await page.getByLabel("favorites", { exact: true }).fill(String(Math.round(opts.views * 0.03)));
  await page.getByLabel("comments", { exact: true }).fill("1");
  await page.getByLabel("followersGained", { exact: true }).fill("1");
  await page.getByRole("button", { name: "保存流量" }).click();
  const analyze = page.getByRole("button", { name: "Analyze Performance" });
  await waitEnabled(analyze);
  await analyze.click();
  await page.getByRole("heading", { name: /KEEP \/ CHANGE \/ NEXT EXPERIMENT/ }).waitFor();

  const state = await appState();
  const feedback = state.feedback.find((f: Record<string, unknown>) => f.contentId === id);
  record(`内容已发布并分析：${opts.views} views → 结论 ${feedback?.verdict}（${feedback?.confidence}）`);
  return { id, verdict: feedback?.verdict as string, feedback };
}

try {
  /* 1. Dashboard */
  await page.goto(web + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Today · 今日行动/ }).waitFor();
  const demo = page.getByRole("button", { name: /加载7篇离线演示数据/ });
  if (await demo.count()) { await demo.first().click(); await page.getByRole("heading", { name: "NEXT 3 POSTS" }).waitFor(); }
  record("Dashboard 已打开（离线演示数据已加载）");
  await shot("01-dashboard");

  /* 2. Retrospective + Opportunity */
  const { retroId } = await recordRetrospective();

  /* 3. Create #1 + Review + Publish + Metrics + Feedback */
  const first = await publishPiece({ retroId, topic: "返工前先确认这三件事", views: 100, minutesAgo: 150, viaDashboard: false });
  await shot("03-first-feedback");

  /* 4. 再录 3 篇真实内容，建立同账号同窗口可比基线 */
  for (const [index, topic] of ["确认范围之后效率变高", "把交付标准写成清单", "先问清楚再动手"].entries()) {
    await publishPiece({ retroId, topic, views: 100, minutesAgo: 130 - index * 10, viaDashboard: true });
  }

  /* 5. KEEP：明显高于中位数的 1 篇 */
  const keep = await publishPiece({ retroId, topic: "确认清单让返工消失了", views: 600, minutesAgo: 90, viaDashboard: true });
  await shot("04-verdict-keep");

  /* 6. CHANGE：明显低于中位数的 1 篇 */
  const change = await publishPiece({ retroId, topic: "被临时消息打断的一天", views: 10, minutesAgo: 70, viaDashboard: true });

  /* 7. NEXT_EXPERIMENT：与中位数持平的 1 篇 */
  const neutral = await publishPiece({ retroId, topic: "照常推进的一天", views: 100, minutesAgo: 50, viaDashboard: true });

  /* 8. 下一篇生成：必须读取到上面三轮的 feedback */
  await page.goto(web + "/", { waitUntil: "domcontentloaded" });
  await page.locator(".loop-list a").first().click();
  await page.waitForURL(/\/create/);
  const retroSelect = page.locator(".retro-selector select");
  if (await retroSelect.count()) await retroSelect.selectOption(retroId);
  await page.locator('.creation-form input[type="text"]').fill("带着上一轮学习写下一篇");
  await page.getByRole("button", { name: "生成内容 →" }).click();
  await page.getByRole("heading", { name: "内容创建成功！" }).waitFor();
  await page.getByRole("button", { name: "立即进入内容审核 →" }).click();
  await page.waitForURL(/\/growth-content\//);
  const nextId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "生成内容", exact: true }).click();

  const panel = page.locator(".loop-learning");
  await panel.waitFor();
  const panelText = (await panel.innerText()).replace(/\s+/g, " ").trim();
  await shot("05-next-generation-learning");

  const state = await appState();
  const next = state.contents.find((c: Record<string, any>) => c.id === nextId);
  const used = (next.debug?.feedbackUsed ?? []) as Array<Record<string, unknown>>;
  const verdicts = used.map(u => u.verdict);
  record(`Generation #2 读取到的 learnings：${JSON.stringify(verdicts)}`);
  record(`Generation #2 面板文本：${panelText.slice(0, 220)}`);

  const checks = {
    keep: verdicts.includes("KEEP"),
    change: verdicts.includes("CHANGE"),
    nextExperiment: verdicts.includes("NEXT_EXPERIMENT"),
    upstreamFirst: used[0]?.contentId === neutral.id,
    promptV3: String(next.debug?.promptVersion).includes("v3"),
    panelShowsLearnings: /KEEP/.test(panelText) && /CHANGE/.test(panelText),
    noDemoLeak: used.every(u => u.contentId !== "f17ed000-0000-4000-8000-000000000001"),
  };
  console.log("CHECKS " + JSON.stringify(checks, null, 1));
  if (!Object.values(checks).every(Boolean)) throw new Error("learning loop checks failed: " + JSON.stringify(checks));

  /* 9. Performance / History */
  await page.goto(web + "/performance", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Daily Feedback" }).waitFor();
  await shot("06-performance");
  await page.goto(web + "/history", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Feedback History" }).waitFor();
  await shot("07-history");
  record("Performance / History 已确认");

  /* 10. PNG 导出（审核阶段提供；已发布内容是只读快照，没有预览入口） */
  await page.goto(`${web}/growth-content/${nextId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "预览发布效果 →" }).click();
  await page.locator('iframe[title^="Content Preview"]').first().waitFor();
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "导出当前页" }).click();
  const png = await download;
  const pngPath = `${shotDir}/exported-card.png`;
  await png.saveAs(pngPath);
  record(`PNG 导出成功：${png.suggestedFilename()}`);

  /* 11. English workflow smoke（只看不改） */
  await page.goto(web + "/english", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const englishText = (await page.locator("body").innerText()).slice(0, 120).replace(/\s+/g, " ");
  record(`English 工作流 smoke：${englishText.slice(0, 80)}`);
  await shot("08-english-smoke");

  console.log("PAGE_ERRORS " + JSON.stringify(pageErrors));
  console.log("CONSOLE_ERRORS " + JSON.stringify(consoleErrors.filter(e => !/favicon|404/.test(e))));
  console.log("RESULT " + JSON.stringify({ result: "PASS", steps, keep: keep.verdict, change: change.verdict, neutral: neutral.verdict, firstVerdict: first.verdict, usedVerdicts: verdicts, panelText }));
} catch (error) {
  await shot("99-failure").catch(() => {});
  console.error("WALK FAILED at", page.url());
  console.error("steps:", steps);
  console.error("pageErrors:", pageErrors, "consoleErrors:", consoleErrors);
  throw error;
} finally {
  await browser.close();
}
