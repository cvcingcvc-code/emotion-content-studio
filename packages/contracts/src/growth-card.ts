import type { PublishedContent } from "./growth-loop.js";
import { englishCardHtml } from "./english-card.js";

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
/** Conservative character-width wrapping keeps preview and export identical, including long text. */
export function growthCardPages(content: PublishedContent): string[] {
  if (content.account === "english") return Array.from({ length: 5 }, (_, n) => String(n + 1));
  const writing = content.writing;
  if (!writing) return [];
  const text = `${writing.body}\n\n核心观点\n${writing.corePoint}\n\n下次行动\n${writing.solution}\n\n${writing.endingQuestion}\n${writing.tags.join(" ")}`;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "", width = 0;
    for (const char of paragraph) {
      const units = /[\u0000-\u00ff]/.test(char) ? .65 : 1;
      if (width + units > 22) { lines.push(line); line = ""; width = 0; }
      line += char; width += units;
    }
    lines.push(line);
  }
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += 12) pages.push(lines.slice(i, i + 12).join("\n"));
  return pages;
}
export function growthCardHtml(content: PublishedContent, page: number): string {
  if (content.account === "english" && content.english) return englishCardHtml(content.english, page);
  const pages = growthCardPages(content);
  if (!Number.isInteger(page) || page < 1 || page > pages.length) throw new Error("INVALID_PAGE");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=900"><style>
  *{box-sizing:border-box}html,body{margin:0;width:900px;height:1200px;background:#f8f6ef;color:#29372d;font-family:Arial,"Microsoft YaHei",sans-serif}
  .card{width:900px;height:1200px;padding:64px 72px;display:flex;flex-direction:column;overflow:hidden}.eyebrow{font-size:18px;letter-spacing:4px;color:#697b67}
  h1{font-size:36px;line-height:1.4;margin:22px 0 28px;overflow-wrap:anywhere;font-weight:600}.copy{white-space:pre-wrap;overflow-wrap:anywhere;font-size:30px;line-height:1.65;margin:0}
  footer{margin-top:auto;padding-top:24px;border-top:1px solid #bcc7b5;display:flex;justify-content:space-between;font-size:17px;color:#697b67}
  </style></head><body><article class="card"><div class="eyebrow">${escape(content.account.toUpperCase())} / ${content.isDemo ? "合成 DEMO" : "原创草稿"} · 人工审核</div><h1>${escape(content.title)}</h1><p class="copy">${escape(pages[page - 1]!)}</p><footer><span>记录一点，实践一点</span><span>${page} / ${pages.length}</span></footer></article></body></html>`;
}
