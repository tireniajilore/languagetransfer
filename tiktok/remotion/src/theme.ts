// Shared visual system — "In Place" / atmospheric identity. Near-black green
// canvas with two soft radial blooms, a single luminous lime accent, weighty
// plain-English Geist with tight tracking, and fade/cross-dissolve motion only
// — the atmosphere does the work, the type carries the lesson. No cards, no
// ring, no rail.
import {loadFont as loadDisplay} from '@remotion/google-fonts/Geist';
import {loadFont as loadMono} from '@remotion/google-fonts/GeistMono';

// Geist — display, lead lines, captions, labels, CTAs (one family, many weights).
const {fontFamily: displayFamily} = loadDisplay('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
});
// Geist Mono — phonetic respelling beneath the Spanish word. The one register
// that isn't Geist Sans, marking "this is how it sounds".
const {fontFamily: monoFamily} = loadMono('normal', {
  weights: ['400', '500'],
  subsets: ['latin'],
});

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// Atmospheric single-accent palette. The dark green canvas + two diffuse blooms
// ARE the design; lime is the one luminous accent and it's spent sparingly — on
// the Spanish answer, the "your turn" line, one hook word, and the CTA. The cool
// pastels from the source palette live only as bloom light, never as type.
export const COLORS = {
  bg: '#0a0e09', // canvas — near-black green
  ink: '#eceefe', // primary type — lavender-white
  muted: '#7e8b7c', // captions, labels, phonetic, counter — green-grey
  accent: '#96ee60', // THE accent (lime): answer, your-turn line, CTA, hook word
  track: '#1b2117', // progress-bar track (faint lifted canvas)

  // Atmospheric blooms — diffuse radial light on the canvas, fixed, no animation.
  bloomLime: '#96ee60', // lower bloom (warm/green pole)
  bloomSky: '#d9f0ff', // upper bloom (cool pole)
};

export const FONT_DISPLAY = displayFamily;
export const FONT_MONO = monoFamily;

// Type scale on a major-third (1.25) ladder off a 36px base: 36 · 45 · 56 · 70
// · 88 · 110. Six rungs, no near-duplicates. promptWord and revealWord share
// the 110 rung on purpose — English in and Spanish out at the same size says
// "it's the same word".
export const TYPE = {
  hookHeadline: 112, // Geist 700, ink (one word in accent) — dominant scroll-stop
  leadLine: 70, // Geist 500, ink
  promptWord: 110, // Geist 600, ink — the English word
  howDoYouSay: 45, // Geist 400, muted — small labels
  revealWord: 110, // Geist 600, accent — the Spanish word (same slot as English)
  hint: 45, // Geist Mono 500, muted — phonetic respelling
  karaoke: 52, // Geist 400/600 — captions
  counter: 34, // Geist 500, muted
  cta: 56, // Geist 700
};

// Pacing constants (seconds) — mirror make_from_script.py
export const PAD = 0.25;
export const GAP = 1.5; // answer countdown (45 frames @ 30fps)
export const HOLD = 1.0; // hold after reveal audio
export const LOOP_BRIDGE = 0.45;

// Safe area: 80px L/R, 120px top, 200px bottom (TikTok UI chrome).
export const SAFE_TOP = 120;
export const SAFE_BOTTOM = 1720; // HEIGHT - 200
export const SAFE_X = 80;
export const ACTIVE_WIDTH = WIDTH - SAFE_X * 2; // 920

export const sec = (s: number) => Math.round(s * FPS);
