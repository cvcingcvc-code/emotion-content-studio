import type { PublishedContent } from "./growth-loop.js";

/** Plain-text publishing: keep the words and paragraph breaks, remove Markdown syntax. */
export function normalizePublishText(value: string): string {
  const inline = (text: string) => text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_match, bold: string | undefined, underlined: string | undefined) => bold ?? underlined ?? "")
    .replace(/(?<!\d)\*([^\s*](?:[^*\n]*[^\s*])?)\*(?!\d)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([\\`*_{}\[\]()#+\-.!>|~])/g, "$1");
  return value.replace(/\r\n?/g, "\n").split("\n").map(line => {
    let text = line.trim();
    if (/^```[^`]*$/.test(text) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) return "";
    if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(text)) return "";
    if (text.startsWith("|") && text.endsWith("|")) {
      const cells = text.slice(1, -1).split(/(?<!\\)\|/).map(cell => inline(cell.trim())).filter(Boolean);
      return cells.length ? `· ${cells.join("：")}` : "";
    }
    text = text.replace(/^(?:>\s*)+/, "").replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "· ");
    return inline(text);
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The body and tags copied to a publishing form; the title has its own field. */
export function growthPublishText(content: Pick<PublishedContent, "writing" | "english">): string {
  const writing = content.english ?? content.writing;
  if (!writing) return "";
  const body = normalizePublishText(writing.body);
  const question = content.english ? "" : normalizePublishText(content.writing?.endingQuestion ?? "");
  const seen = new Set<string>();
  const tags = writing.tags.map(normalizePublishText).filter(tag => {
    if (!tag || seen.has(tag)) return false;
    seen.add(tag);
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u").test(body);
  }).join(" ");
  return [body, question && !body.includes(question) ? question : "", tags].filter(Boolean).join("\n\n");
}
