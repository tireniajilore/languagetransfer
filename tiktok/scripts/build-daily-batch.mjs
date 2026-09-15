#!/usr/bin/env node
// Build the daily posting batch: 1 new lesson + 2 variants of lessons already out.
//
//   node scripts/build-daily-batch.mjs                 # today, writes batches/<date>.json
//   node scripts/build-daily-batch.mjs --date 2026-09-15
//   node scripts/build-daily-batch.mjs --dry           # print, don't write
//
// This file is the whole contract between the render pipeline and Muse. Muse has
// no inbound webhook, so it cannot be triggered — it polls a URL on a schedule,
// reads this JSON, downloads each video, and raises one approval per video.
// Keep the schema stable; Muse's job is written against it.
//
// Policy: one NEW lesson a day (a lesson whose base cut has never been posted)
// plus two VARIANTS (alternate cuts of lessons already out). New lessons are the
// scarce side — variants outnumber them roughly 2:1 — so the new pick is made
// first and the variants fill in around it.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TIKTOK = path.join(ROOT, 'tiktok');
const SCRIPTS = path.join(TIKTOK, 'scripts');
// Renders landed in three places over time. out/ itself holds most base cuts
// (including lessons 24-29), finalized/ the early ones, variants/ the alt cuts.
const OUT_DIRS = [
  path.join(TIKTOK, 'remotion', 'out'),
  path.join(TIKTOK, 'remotion', 'out', 'finalized'),
  path.join(TIKTOK, 'remotion', 'out', 'variants')
];

// Scratch and test renders share out/ with real lessons. Only lesson-* is postable.
const POSTABLE_NAME = /^lesson-\d+-/;
const MANIFEST = path.join(SCRIPTS, '.upload-manifest.json');

// Videos are hosted as assets on a single long-lived GitHub Release rather than
// committed (out/ is gitignored, and 113MB of mp4 has no business in history).
// The repo is public, so these are direct downloads with no auth — which is what
// Muse needs, since it fetches the file to its own machine before uploading.
const ASSET_BASE = process.env.VIDEO_ASSET_BASE
  ?? 'https://github.com/tireniajilore/languagetransfer/releases/download/video-backlog';
const BATCHES = path.join(TIKTOK, 'batches');

// Suffixes that mark an alternate cut of a lesson rather than the lesson itself.
const VARIANT_SUFFIX = /-(15s|hook-a|hook-b|quizfirst|v\d+)$/;
const baseOf = name => name.replace(VARIANT_SUFFIX, '');
const isVariant = name => VARIANT_SUFFIX.test(name);

function postedIds() {
  if (!fs.existsSync(MANIFEST)) return new Set();
  const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return new Set(Object.keys(raw).map(k => path.basename(k).replace(/\.mp4$/, '')));
}

function renderedVideos() {
  const found = [];
  for (const dir of OUT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.mp4')) continue;
      const id = file.replace(/\.mp4$/, '');
      if (!POSTABLE_NAME.test(id)) continue;   // cognate-dry, smoke, previews
      if (found.some(f => f.id === id)) continue;  // same id in two dirs
      found.push({ id, file: path.join(dir, file) });
    }
  }
  return found;
}

// Caption and hashtags are authored in the script JSON, so Muse never writes copy.
// A variant falls back to its base lesson's caption when it has none of its own.
function captionFor(id) {
  for (const candidate of [id, baseOf(id)]) {
    for (const p of [
      path.join(SCRIPTS, `${candidate}.json`),
      path.join(SCRIPTS, 'variants', `${candidate}.json`)
    ]) {
      if (!fs.existsSync(p)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j.caption) return { caption: j.caption, hashtags: j.hashtags ?? [], from: candidate };
      } catch { /* malformed script — fall through */ }
    }
  }
  return null;
}

function previouslyChosen() {
  // Anything already promised to an earlier batch is off the table, even if it
  // has not been posted yet — otherwise a missed approval re-queues it forever.
  const chosen = new Set();
  if (!fs.existsSync(BATCHES)) return chosen;
  for (const f of fs.readdirSync(BATCHES).filter(f => f.endsWith('.json'))) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(BATCHES, f), 'utf8'));
      (b.videos ?? []).forEach(v => chosen.add(v.id));
    } catch { /* ignore */ }
  }
  return chosen;
}

function build(dateStr) {
  const posted = postedIds();
  const spent = previouslyChosen();
  const all = renderedVideos();
  const available = all.filter(v => !posted.has(v.id) && !spent.has(v.id));

  const postedBases = new Set([...posted].map(baseOf));

  // Nothing is postable without a caption — Muse pastes, it does not write copy.
  // Filtering here rather than warning later stops the picker burning a day's
  // slot on something that could never have gone out.
  const postable = available.filter(v => captionFor(v.id));

  // A NEW lesson: no cut of it has EVER been posted. Deliberately strict — if the
  // quizfirst variant already went out, the audience has seen that lesson, so the
  // full cut is a re-run, not a new lesson.
  const newCandidates = postable
    .filter(v => !isVariant(v.id) && !postedBases.has(baseOf(v.id)))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // A VARIANT: an alternate cut of a lesson that IS already out. Variants of a
  // lesson nobody has seen are held back — the base should land first.
  const variantCandidates = postable
    .filter(v => isVariant(v.id) && postedBases.has(baseOf(v.id)))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const picks = [];
  const newPick = newCandidates[0];
  if (newPick) picks.push({ ...newPick, kind: 'new' });

  // One cut per lesson per day. Posting the 15s and the quizfirst of the same
  // lesson on the same day reads as a repeat to anyone scrolling the feed, and
  // wastes the second slot that could have surfaced a different lesson.
  const lessonsUsedToday = new Set(picks.map(p => baseOf(p.id)));
  for (const v of variantCandidates) {
    if (picks.length >= 3) break;
    const lesson = baseOf(v.id);
    if (lessonsUsedToday.has(lesson)) continue;
    lessonsUsedToday.add(lesson);
    picks.push({ ...v, kind: 'variant' });
  }

  const videos = picks.map(p => {
    const meta = captionFor(p.id);
    const stat = fs.statSync(p.file);
    return {
      id: p.id,
      kind: p.kind,
      lesson: baseOf(p.id),
      file: path.relative(ROOT, p.file),
      bytes: stat.size,
      caption: meta?.caption ?? null,
      hashtags: meta?.hashtags ?? [],
      caption_source: meta?.from ?? null,
      url: `${ASSET_BASE}/${p.id}.mp4`,
      gates: null
    };
  });

  const warnings = [];
  if (!newPick) warnings.push('NO NEW LESSON AVAILABLE — render more, or today is variants only.');
  if (videos.length < 3) warnings.push(`Only ${videos.length} video(s) available, wanted 3.`);
  const uncaptioned = available.filter(v => !captionFor(v.id));
  if (uncaptioned.length) {
    warnings.push(`${uncaptioned.length} rendered video(s) skipped for having no caption: ${uncaptioned.map(v => v.id).join(', ')}`);
  }

  return {
    batch_id: dateStr,
    date: dateStr,
    generated_at: new Date().toISOString(),
    policy: '1 new lesson + 2 variants of already-posted lessons',
    videos,
    warnings,
    supply: {
      new_lessons_left: Math.max(0, newCandidates.length - (newPick ? 1 : 0)),
      variants_left: Math.max(0, variantCandidates.length - videos.filter(v => v.kind === 'variant').length)
    }
  };
}

const args = process.argv.slice(2);
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;
const date = dateArg ?? new Date().toISOString().slice(0, 10);
const batch = build(date);

if (args.includes('--dry')) {
  console.log(JSON.stringify(batch, null, 2));
} else {
  fs.mkdirSync(BATCHES, { recursive: true });
  const out = path.join(BATCHES, `${date}.json`);
  fs.writeFileSync(out, JSON.stringify(batch, null, 2) + '\n');
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

for (const w of batch.warnings) console.warn(`  WARNING: ${w}`);
console.warn(`  supply left: ${batch.supply.new_lessons_left} new lessons, ${batch.supply.variants_left} variants`);
if (batch.warnings.length) process.exitCode = 1;
