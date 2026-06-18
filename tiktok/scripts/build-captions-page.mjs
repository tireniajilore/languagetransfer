#!/usr/bin/env node
// Generate the mobile copy-paste captions page for the es-uploader site
// from tiktok/scripts/captions.md, then print the output path.
//
// captions.md is organized by lesson:
//   ## Lesson 3 — Es
//   ### Full (`lesson-03-es.mp4`)
//   > caption text
//   `#hashtags`
//
// The page renders a sticky lesson jump-nav (1..10) and one section per
// lesson holding all of that lesson's variant cards.
//
// Usage: node tiktok/scripts/build-captions-page.mjs [site-dir]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CAPTIONS_MD = path.join(SCRIPT_DIR, "captions.md");
const SITE_DIR = process.argv[2] || path.join(SCRIPT_DIR, "..", "..", "..", "es-uploader-site");

const md = fs.readFileSync(CAPTIONS_MD, "utf8");

const lessons = [];
let lesson = null;
let entry = null;
for (const line of md.split("\n")) {
  const h2 = line.match(/^## Lesson (\d+) — (.+)/);
  const h3 = line.match(/^### (.+?) \(`(.+?)`\)/);
  const quote = line.match(/^> (.+)/);
  const tags = line.match(/^`(#.+)`/);
  if (h2) {
    lesson = { num: Number(h2[1]), title: h2[2].trim(), entries: [] };
    lessons.push(lesson);
    entry = null;
  } else if (h3 && lesson) {
    entry = { variant: h3[1], file: h3[2], caption: "", hashtags: "" };
    lesson.entries.push(entry);
  } else if (quote && entry) {
    entry.caption = quote[1];
  } else if (tags && entry) {
    entry.hashtags = tags[1];
  }
}

const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const attr = (s) =>
  esc(s).replaceAll('"', "&quot;").replaceAll("\n", "&#10;");

const nav = lessons
  .map((l) => `<a class="navchip" href="#lesson-${l.num}">${l.num}</a>`)
  .join("");

const sections = lessons
  .map(
    (l) => `<section id="lesson-${l.num}">
  <h2>Lesson ${l.num} — ${esc(l.title)}</h2>
${l.entries
  .map((e) => {
    const full = `${e.caption}\n\n${e.hashtags}`;
    return `  <div class="card">
    <div class="variant">${esc(e.variant)}</div>
    <div class="file">${esc(e.file)}</div>
    <div class="caption">${esc(e.caption)}</div>
    <div class="tags">${esc(e.hashtags)}</div>
    <button data-copy="${attr(full)}">Copy caption</button>
  </div>`;
  })
  .join("\n")}
</section>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Captions — ES Lesson Uploader</title>
<link rel="stylesheet" href="style.css">
<style>
  .nav {
    position: sticky; top: 0; z-index: 10;
    background: #1a1a2e; padding: 12px 0; margin: 0 0 8px;
    display: flex; gap: 8px; overflow-x: auto;
    border-bottom: 1px solid #2a2a4a;
  }
  .navchip {
    flex: 0 0 auto; width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    background: #16213e; color: #eaeaea; border-radius: 50%;
    font-weight: 700; text-decoration: none; font-size: 1rem;
  }
  .navchip:active { background: #e94560; color: #fff; }
  section { scroll-margin-top: 70px; padding-top: 8px; }
  section h2 { border-bottom: 2px solid #e94560; padding-bottom: 6px; }
  .card { background: #16213e; border-radius: 10px; padding: 16px; margin: 14px 0; }
  .variant { font-weight: 700; color: #fff; margin-bottom: 2px; }
  .file { font-family: monospace; font-size: 0.78rem; color: #888; margin-bottom: 8px; }
  .caption { margin-bottom: 6px; }
  .tags { color: #e94560; font-size: 0.9rem; margin-bottom: 12px; }
  button {
    background: #e94560; color: #fff; border: none; border-radius: 6px;
    padding: 10px 16px; font-size: 1rem; width: 100%;
  }
  button.copied { background: #2e8b57; }
</style>
</head>
<body>
<h1>Captions<span>.</span></h1>
<p>Jump to a lesson, then tap copy and paste into the TikTok caption field.</p>
<nav class="nav">${nav}</nav>
${sections}
<footer>Generated from captions.md · <a href="index.html">Home</a></footer>
<script>
  document.querySelectorAll("button[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy caption";
        btn.classList.remove("copied");
      }, 1500);
    });
  });
</script>
</body>
</html>
`;

const out = path.join(SITE_DIR, "captions.html");
fs.writeFileSync(out, html);
const count = lessons.reduce((n, l) => n + l.entries.length, 0);
console.log(`Wrote ${out} (${count} captions across ${lessons.length} lessons)`);
