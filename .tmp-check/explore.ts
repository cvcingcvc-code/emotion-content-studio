import { chromium } from "playwright";

const web = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(20_000);
const errors: string[] = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

async function dump(label: string, url: string, limit = 80) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const snapshot = await page.locator("body").ariaSnapshot();
  const lines = snapshot.split("\n");
  console.log(`\n===== ${label} :: ${url} (${lines.length} lines) =====`);
  console.log(lines.slice(0, limit).join("\n"));
}

await page.goto(web + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
console.log("===== BEFORE DEMO =====");
console.log((await page.locator("body").ariaSnapshot()).split("\n").slice(0, 60).join("\n"));

const demoButton = page.getByRole("button", { name: /加载7篇离线演示数据/ });
if (await demoButton.count()) {
  await demoButton.first().click();
  await page.waitForTimeout(2500);
}
console.log("\n===== AFTER DEMO =====");
console.log((await page.locator("body").ariaSnapshot()).split("\n").slice(0, 80).join("\n"));

const state = await page.evaluate(async () => (await fetch("/api/v1/growth-loop").then(r => r.json())).data);
console.log("\n===== API STATE SUMMARY =====");
console.log(JSON.stringify({
  retrospectives: state.retrospectives.length,
  contents: state.contents.map((c: Record<string, unknown>) => ({ id: c.id, account: c.account, status: c.status, isDemo: c.isDemo, topic: String(c.topic).slice(0, 24), hasExperiment: !!c.experiment, hasDebug: !!c.debug, sourceContentId: c.sourceContentId })),
  metrics: state.metrics.length,
  feedback: state.feedback.map((f: Record<string, unknown>) => ({ contentId: f.contentId, verdict: f.verdict, confidence: f.confidence })),
  strategies: state.strategies.length,
}, null, 1));

await dump("RETROSPECTIVES", web + "/retrospectives", 70);
await dump("CREATE", web + "/create?topic=%E6%B5%8B%E8%AF%95%E4%B8%BB%E9%A2%98&account=growth&contentType=solution", 60);
await dump("PERFORMANCE", web + "/performance", 70);
await dump("HISTORY", web + "/history", 70);

const firstContent = state.contents[0];
if (firstContent) await dump("CONTENT DETAIL", `${web}/growth-content/${firstContent.id}`, 90);

console.log("\n===== PAGE ERRORS =====");
console.log(errors.length ? errors.join("\n") : "(none)");
await browser.close();
