import { chromium } from "playwright";
import { join } from "node:path";
import type { EnglishWriting } from "@emotion-studio/contracts";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);

const nl2br = (text: string) => escape(text).replace(/\n/g, "<br>");

const sideNotes: Array<[string, string]> = [
  ["碎片时间\n也能学英语 ♡", "Little by little\nstill counts :)"],
  ["先记 5 句\n更容易坚持", "Small steps,\nbig progress!"],
  ["先收藏\n再慢慢学", "You can do it\none line at a time"],
  ["开口比完美\n更重要", "Try a few today,\nnot all today"],
  ["今天记一点\n已经很棒啦", "Slow progress\nis still progress ♡"],
];

/** Preview and export use exactly this template. No external fonts, assets or scripts. */
export function englishCardHtml(writing: EnglishWriting, page: number): string {
  const lines = writing.sentences.slice((page - 1) * 10, page * 10);
  const scene = writing.groupNames[page - 1] ?? "日常口语";
  const [leftNote, rightNote] =
  sideNotes[(page - 1) % sideNotes.length] ??
  ["碎片时间\n也能学英语 ♡", "Little by little\nstill counts :)"];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #fbfaf6;
      color: #163b67;
    }
    body {
      font-family: Arial, "Microsoft YaHei", "PingFang SC", sans-serif;
    }

    .card {
      position: relative;
      width: 100vw;
      height: 133.333333vw; /* 3:4 */
      overflow: hidden;
      padding: 3.4vw 4.2vw 2.8vw;
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(circle at top left, rgba(216, 231, 255, 0.55), transparent 20%),
        radial-gradient(circle at top right, rgba(255, 232, 170, 0.35), transparent 16%),
        #fbfaf6;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.8vw;
      position: relative;
      z-index: 2;
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 0.35vw;
    }

    .brand-title {
      font-size: 2.6vw;
      font-weight: 700;
      letter-spacing: -0.04vw;
      color: #1a476f;
    }

    .brand-sub {
      font-size: 1.1vw;
      color: #7d90a8;
    }

    .studio {
      font-size: 1.08vw;
      color: #8ea1b6;
      letter-spacing: 0.24vw;
      text-transform: uppercase;
      margin-top: 0.5vw;
    }

    .hero {
      position: relative;
      z-index: 2;
      margin-bottom: 1.4vw;
    }

    .kicker {
      font-size: 1.08vw;
      letter-spacing: 0.2vw;
      color: #91a2b4;
      text-transform: uppercase;
      margin-bottom: 1.3vw;
    }

    .title-pill {
      background: linear-gradient(180deg, #eaf3ff 0%, #d9ebff 100%);
      border-radius: 999px;
      padding: 1.9vw 2.7vw 2.1vw;
      box-shadow: inset 0 0.15vw 0 rgba(255, 255, 255, 0.9);
    }

    h1 {
      margin: 0;
      text-align: center;
      font-size: 4.9vw;
      line-height: 1.14;
      font-weight: 800;
      letter-spacing: -0.08vw;
      color: #1a4778;
      overflow-wrap: anywhere;
    }

    .badge-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1vw;
      margin-top: 1.4vw;
    }

    .page-badge {
      min-width: 8vw;
      height: 5.4vw;
      padding: 0 1.6vw;
      border-radius: 999px;
      background: #1f4f84;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.8vw;
      font-weight: 800;
      box-shadow: 0 0.35vw 1.2vw rgba(31, 79, 132, 0.18);
    }

    .scene-chip {
      padding: 1.1vw 2vw;
      border-radius: 999px;
      background: #e4f0ff;
      color: #1b4a7a;
      font-size: 2.05vw;
      font-weight: 700;
      max-width: 46vw;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .series {
      margin-top: 1vw;
      text-align: center;
      font-size: 1.55vw;
      letter-spacing: 0.05vw;
      color: #6f90b3;
    }

    .list-card {
      position: relative;
      z-index: 2;
      flex: 1;
      min-height: 0;
      background: rgba(255, 255, 255, 0.8);
      border: 0.18vw solid #edf3fb;
      border-radius: 3vw;
      padding: 1.55vw 2vw 1.5vw;
      box-shadow: 0 0.6vw 2vw rgba(34, 72, 113, 0.06);
    }

    ol {
      list-style: none;
      margin: 0;
      padding: 0;
      height: 100%;
      display: grid;
      grid-template-rows: repeat(10, 1fr);
      gap: 0.18vw;
    }

    li {
      display: grid;
      grid-template-columns: 5vw 1fr;
      column-gap: 1.15vw;
      align-content: center;
      min-height: 0;
      border-bottom: 0.1vw dashed rgba(89, 121, 159, 0.18);
      padding: 0.18vw 0;
    }

    li:last-child {
      border-bottom: none;
    }

    .number {
      width: 4.3vw;
      height: 4.3vw;
      border-radius: 1.3vw;
      background: #eaf2ff;
      color: #2f6aa2;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.7vw;
      font-weight: 800;
      line-height: 1;
      margin-top: 0.22vw;
      font-variant-numeric: tabular-nums;
    }

    .line {
      min-height: 0;
    }

    .en {
      font-size: 2.35vw;
      line-height: 1.16;
      font-weight: 800;
      letter-spacing: -0.03vw;
      color: #173f70;
      overflow-wrap: anywhere;
    }

    .zh {
      font-size: 1.65vw;
      line-height: 1.32;
      color: #6b8198;
      margin-top: 0.35vw;
      overflow-wrap: anywhere;
    }

    .tip {
      position: relative;
      z-index: 2;
      margin-top: 1.45vw;
      align-self: center;
      min-width: 72%;
      max-width: 88%;
      background: #e7f2ff;
      border-radius: 999px;
      padding: 1.1vw 2vw;
      text-align: center;
      font-size: 1.55vw;
      color: #275584;
      font-weight: 700;
    }

    .doodle {
      position: absolute;
      z-index: 1;
      color: #7ea5ff;
      font-size: 1.12vw;
      line-height: 1.42;
      font-weight: 700;
      text-align: center;
      white-space: pre-line;
    }

    .doodle-left {
      top: 3.6vw;
      left: 0.9vw;
      transform: rotate(-10deg);
    }

    .doodle-right {
      top: 4vw;
      right: 1vw;
      transform: rotate(9deg);
      color: #6d8eff;
    }

    .spark {
      position: absolute;
      z-index: 1;
      width: 2.2vw;
      height: 2.2vw;
      border-radius: 50%;
      background: rgba(255, 214, 98, 0.6);
    }

    .spark-a { top: 17vw; left: 1.8vw; }
    .spark-b { top: 20vw; right: 2vw; }

    .sticker {
      position: absolute;
      z-index: 1;
      font-size: 1.18vw;
      line-height: 1.35;
      text-align: center;
    }

    .sticker-a {
      left: 1.2vw;
      bottom: 17vw;
      color: #93796c;
      background: rgba(255, 244, 226, 0.95);
      border-radius: 1vw;
      padding: 0.8vw 0.7vw;
      transform: rotate(-8deg);
      box-shadow: 0 0.3vw 0.9vw rgba(112, 93, 79, 0.08);
    }

    .sticker-b {
      right: 1vw;
      bottom: 13vw;
      color: #7ea5ff;
      transform: rotate(8deg);
    }

    .mascot-shadow {
      position: absolute;
      right: 1.8vw;
      bottom: 16.5vw;
      width: 13vw;
      height: 1.1vw;
      background: rgba(185, 207, 232, 0.58);
      border-radius: 50%;
      z-index: 0;
    }

    .mascot {
      position: absolute;
      z-index: 1;
      right: 1.9vw;
      bottom: 17.5vw;
      width: 12vw;
      height: 8.9vw;
      border: 0.26vw solid #6f564d;
      border-radius: 6.3vw 6.3vw 5vw 5vw / 5.8vw 5.8vw 3.6vw 3.6vw;
      background: rgba(255, 255, 255, 0.76);
    }

    .mascot::before,
    .mascot::after {
      content: "";
      position: absolute;
      top: -1.15vw;
      width: 3vw;
      height: 3vw;
      border: 0.26vw solid #6f564d;
      border-radius: 50%;
      background: #fbfaf6;
    }

    .mascot::before { left: 1vw; }
    .mascot::after { right: 1vw; }

    .mascot-face {
      position: absolute;
      left: 50%;
      top: 56%;
      transform: translate(-50%, -50%);
      font-size: 1.45vw;
      color: #6f564d;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="doodle doodle-left">${nl2br(leftNote)}</div>
    <div class="doodle doodle-right">${nl2br(rightNote)}</div>
    <div class="spark spark-a"></div>
    <div class="spark spark-b"></div>

    <div class="sticker sticker-a">Plan<br>today? ♡</div>
    <div class="sticker sticker-b">Speak it<br>little by little ♡</div>

    <div class="page-badge">${String(page).padStart(2, "0")} / 05</div>
    <div class="mascot">
      <div class="mascot-face">•ᴗ•</div>
    </div>

    <div class="topbar">
      <div class="brand">
        <div class="brand-title">little english</div>
        <div class="brand-sub">碎片时间学一点英语</div>
      </div>
      <div class="studio">English Content Studio</div>
    </div>

    <section class="hero">
      <div class="kicker">One topic · fifty little conversations</div>
      <div class="title-pill">
        <h1>${escape(writing.topic)}</h1>
      </div>
      <div class="badge-row">
        <div class="page-badge">${page}</div>
        <div class="scene-chip">${escape(scene)}</div>
      </div>
      <div class="series">Everyday English · Part ${page}/5</div>
    </section>

    <section class="list-card">
      <ol>
        ${lines.map((line) => `
          <li>
            <div class="number">${String(line.number).padStart(2, "0")}</div>
            <div class="line">
              <div class="en">${escape(line.english)}</div>
              <div class="zh">${escape(line.chinese)}</div>
            </div>
          </li>
        `).join("")}
      </ol>
    </section>

    <div class="tip">🌱 每天记 5–10 句，比一次背完更轻松</div>
  </main>
</body>
</html>`;
}

export async function renderEnglishPngs(writing: EnglishWriting, directory: string): Promise<void> {
  // Use the installed Edge on Windows; elsewhere install Playwright Chromium once.
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 1200 },
      deviceScaleFactor: 1,
    });

    await page.route("**/*", (route) => route.abort());

    for (let index = 1; index <= 5; index++) {
      await page.setContent(englishCardHtml(writing, index), { waitUntil: "load" });
      await page.evaluate("document.fonts.ready");

      const overflow = await page.evaluate<boolean>(`[...document.querySelectorAll("li")].some((row) => {
        const line = row.querySelector(".line");
        return !!line && line.getBoundingClientRect().height > row.getBoundingClientRect().height;
      }) || document.querySelector(".card").scrollHeight > document.querySelector(".card").clientHeight`);

      if (overflow) throw new Error("CARD_OVERFLOW");

      await page.screenshot({
        path: join(directory, `page-${String(index).padStart(2, "0")}.png`),
        type: "png",
      });
    }
  } finally {
    await browser.close();
  }
}