import { chromium, type Page } from "playwright";
import { join } from "node:path";
import { englishCardHtml, type EnglishWriting } from "@emotion-studio/contracts";
export { englishCardHtml } from "@emotion-studio/contracts";

async function capture(page: Page, writing: EnglishWriting, index: number): Promise<Buffer> {
  await page.setContent(englishCardHtml(writing, index), { waitUntil: "load" });
  await page.evaluate("document.fonts.ready");
  const overflow = await page.evaluate<boolean>(`[...document.querySelectorAll("li")].some((row) => {
    const line = row.querySelector(".line");
    return !!line && line.getBoundingClientRect().height > row.getBoundingClientRect().height;
  }) || document.querySelector(".card").scrollHeight > document.querySelector(".card").clientHeight`);
  if (overflow) throw new Error("CARD_OVERFLOW");
  return page.screenshot({ type: "png" });
}

export async function withCanvas<T>(action: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    return await action(page);
  } finally { await browser.close(); }
}

export async function renderEnglishPagePng(writing: EnglishWriting, index: number): Promise<Buffer> {
  return withCanvas((page) => capture(page, writing, index));
}

export async function renderEnglishPngs(writing: EnglishWriting, directory: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await withCanvas(async (page) => {
    for (let index = 1; index <= 5; index++) {
      await writeFile(join(directory, `page-${String(index).padStart(2, "0")}.png`), await capture(page, writing, index));
    }
  });
}
