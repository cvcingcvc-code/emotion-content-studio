import { growthCardHtml, type PublishedContent } from "@emotion-studio/contracts";
import { withCanvas, renderEnglishPagePng } from "../english/cards.js";

export async function renderGrowthCard(content: PublishedContent, index: number) {
  if (content.account === "english" && content.english) return renderEnglishPagePng(content.english, index);
  return withCanvas(async page => {
    await page.setContent(growthCardHtml(content, index), { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    const overflow = await page.evaluate<boolean>(`document.querySelector('.card').scrollHeight > 1200 || document.querySelector('.copy').getBoundingClientRect().bottom > document.querySelector('footer').getBoundingClientRect().top`);
    if (overflow) throw new Error("CARD_OVERFLOW");
    return page.screenshot({ type: "png" });
  });
}
