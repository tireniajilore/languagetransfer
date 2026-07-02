#!/usr/bin/env node
// Render a TikTok/Instagram carousel deck from one of the structured script
// JSON files. The Remotion composition renders one still at a time; this script
// loops through the normalized slides and writes a manifest next to the PNGs.
//
// Usage:
//   node scripts/render-carousel.mjs
//   node scripts/render-carousel.mjs --script ../scripts/lesson-05-ant-ent.json
//   node scripts/render-carousel.mjs --script ../scripts/lesson-05-ant-ent.json --dry-run
//   node scripts/render-carousel.mjs --script ../scripts/lesson-05-ant-ent.json --slide 19

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_SCRIPT = path.resolve(REMOTION_DIR, '..', 'scripts', 'spanish-cognates-01.json');
const DEFAULT_OUT = path.resolve(REMOTION_DIR, 'out', 'carousels');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function argValue(args, name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a value`);
    process.exit(1);
  }
  return value;
}

const compact = (value) => value?.trim().replace(/\n+/g, '\n') || undefined;

const numberLabel = (index, total) =>
  `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

const lineFromLessonSegment = (segment) =>
  compact(segment?.display ?? segment?.show ?? segment?.word ?? segment?.say);

function buildCognateSlides(script) {
  const slides = [
    {
      kind: 'cover',
      eyebrow: compact(script.hook?.show_top) ?? 'start here',
      title: compact(script.hook?.show_main ?? script.hook?.say) ?? script.title,
      subtitle: compact(script.hook?.show_sub ?? script.concept),
      footer: compact(script.hook?.show_cta) ?? 'swipe slowly',
    },
  ];

  if (script.lead_in) {
    slides.push({
      kind: 'rule',
      eyebrow: 'pattern',
      title: compact(script.lead_in.show_main ?? script.lead_in.say) ?? 'same word.\nnew stress.',
      subtitle: compact(script.lead_in.show_sub ?? script.lead_in.say),
      footer: 'save this pattern',
    });
  }

  for (const card of script.cards) {
    slides.push({
      kind: 'prompt',
      eyebrow: 'your turn',
      title: card.english,
      subtitle: compact(card.prompt_say) ?? `How do you say ${card.english}?`,
      prompt: 'say it out loud',
      footer: 'answer on next slide',
    });
    slides.push({
      kind: 'reveal',
      eyebrow: 'answer',
      title: card.spanish,
      subtitle: card.english,
      answer: card.spanish,
      phonetic: compact(card.stress_hint),
      footer: 'repeat it once',
    });
  }

  if (script.outro) {
    slides.push({
      kind: 'summary',
      eyebrow: 'keep going',
      title: compact(script.outro.show_main ?? script.outro.say) ?? 'Hundreds more\nyou already know',
      subtitle: compact(script.outro.say),
      footer: compact(script.outro.show_cta) ?? 'follow for the free course',
    });
  }

  return slides;
}

function buildLessonSlides(script) {
  const slides = [];
  const firstLine = script.segments.find((segment) => segment.kind === 'line');

  slides.push({
    kind: 'cover',
    eyebrow: 'micro lesson',
    title: lineFromLessonSegment(firstLine ?? script.segments[0]) ?? script.title,
    subtitle: script.title,
    footer: 'swipe to practice',
  });

  for (const segment of script.segments) {
    if (segment === firstLine) continue;

    if (segment.kind === 'line' || segment.kind === 'vowels') {
      slides.push({
        kind: segment.kind === 'vowels' ? 'rule' : 'teaching',
        eyebrow: segment.kind === 'vowels' ? 'vowels' : 'idea',
        title:
          segment.kind === 'vowels'
            ? 'a  e  i  o  u'
            : lineFromLessonSegment(segment) ?? 'watch the pattern',
        subtitle: segment.kind === 'vowels' ? 'ah  eh  ee  oh  oo' : compact(segment.say),
        footer: 'carry this forward',
      });
      continue;
    }

    if (segment.kind === 'prompt') {
      slides.push({
        kind: 'prompt',
        eyebrow: 'your turn',
        title: compact(segment.word ?? segment.display ?? segment.show) ?? 'say it in Spanish',
        subtitle: compact(segment.say),
        prompt: 'answer before swiping',
        footer: 'answer on next slide',
      });
      continue;
    }

    if (segment.kind === 'reveal') {
      slides.push({
        kind: 'reveal',
        eyebrow: 'answer',
        title: compact(segment.word ?? segment.display ?? segment.show) ?? 'listen again',
        subtitle: compact(segment.say),
        answer: compact(segment.word),
        phonetic: compact(segment.phon),
        footer: 'say it twice',
      });
    }
  }

  slides.push({
    kind: 'summary',
    eyebrow: 'save this',
    title: script.title,
    subtitle: compact(script.caption),
    footer: 'follow for the next pattern',
  });

  return slides;
}

function buildDeck(script) {
  const slides = Array.isArray(script.cards) ? buildCognateSlides(script) : buildLessonSlides(script);
  return {
    id: script.id,
    title: script.title,
    theme: 'editorial-flashcards',
    caption: script.caption,
    hashtags: script.hashtags,
    slides: slides.map((slide, index) => ({
      ...slide,
      eyebrow: `${slide.eyebrow} / ${numberLabel(index, slides.length)}`,
    })),
  };
}

function renderStill(propsFile, outputFile) {
  const result = spawnSync(
    'npx',
    [
      'remotion',
      'still',
      'src/index.ts',
      'CarouselDeck',
      outputFile,
      `--props=${propsFile}`,
    ],
    {
      cwd: REMOTION_DIR,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const scriptPath = path.resolve(REMOTION_DIR, argValue(args, '--script', DEFAULT_SCRIPT));
  const outRoot = path.resolve(REMOTION_DIR, argValue(args, '--out', DEFAULT_OUT));
  const slideArg = argValue(args, '--slide', null);

  if (!fs.existsSync(scriptPath)) {
    console.error(`Missing script JSON: ${scriptPath}`);
    process.exit(1);
  }

  const source = readJson(scriptPath);
  const deck = buildDeck(source);
  const outDir = path.join(outRoot, deck.id);
  const propsDir = path.join(outDir, '.props');
  fs.mkdirSync(propsDir, {recursive: true});

  const imageFiles = deck.slides.map((_, index) =>
    path.join(outDir, `slide-${String(index + 1).padStart(2, '0')}.png`),
  );
  const selectedSlide =
    slideArg === null ? null : Number.parseInt(slideArg, 10);
  if (
    selectedSlide !== null &&
    (!Number.isInteger(selectedSlide) || selectedSlide < 1 || selectedSlide > deck.slides.length)
  ) {
    console.error(`--slide must be between 1 and ${deck.slides.length}`);
    process.exit(1);
  }
  const manifest = {
    id: deck.id,
    title: deck.title,
    theme: deck.theme,
    source: path.relative(path.resolve(REMOTION_DIR, '..'), scriptPath),
    slide_count: deck.slides.length,
    caption: deck.caption,
    hashtags: deck.hashtags,
    images: imageFiles.map((file) => path.relative(outDir, file)),
    slides: deck.slides,
  };

  writeJson(path.join(outDir, 'deck.json'), deck);
  writeJson(path.join(outDir, 'manifest.json'), manifest);

  if (dryRun) {
    console.log(`Prepared ${deck.slides.length} slides for ${deck.id}`);
    console.log(`Manifest: ${path.join(outDir, 'manifest.json')}`);
    return;
  }

  const slideIndexes =
    selectedSlide === null ? deck.slides.map((_, index) => index) : [selectedSlide - 1];

  slideIndexes.forEach((slideIndex) => {
    const propsFile = path.join(propsDir, `slide-${String(slideIndex + 1).padStart(2, '0')}.json`);
    writeJson(propsFile, {deck, slideIndex});
    renderStill(propsFile, imageFiles[slideIndex]);
  });

  fs.rmSync(propsDir, {recursive: true, force: true});
  console.log(`Rendered ${slideIndexes.length} of ${deck.slides.length} slides to ${outDir}`);
}

main();
