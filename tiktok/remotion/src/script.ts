import scriptJson from '../../scripts/spanish-cognates-01.json';
import {FPS, PAD, GAP, HOLD, LOOP_BRIDGE} from './theme';

export type Card = {
  english: string;
  spanish: string;
  prompt_say: string;
  reveal_say: string;
  stress_hint?: string;
};

export type Script = {
  id: string;
  title: string;
  hook: {say: string; show_top: string; show_main: string; show_sub: string; show_cta: string};
  lead_in?: {say: string; show_main: string; show_sub: string};
  cards: Card[];
  outro: {say: string; show_main: string; show_cta: string; show_url: string};
  caption: string;
  hashtags: string[];
};

export const script = scriptJson as Script;

// Estimated speech duration (seconds) — mirrors Python est_dur for dry preview.
export const estDur = (text: string, lang: 'en' | 'es'): number => {
  const wps = lang === 'en' ? 2.3 : 1.9;
  const words = text.trim().split(/\s+/).length;
  return Math.max(0.8, words / wps);
};

export type SceneKind =
  | 'hook'
  | 'lead'
  | 'prompt'
  | 'ring'
  | 'reveal'
  | 'outro'
  | 'loop';

export type Scene = {
  kind: SceneKind;
  durFrames: number; // total on-screen frames
  speechSec: number; // speech length used for karaoke timing
  cardIndex?: number;
  audioKey?: string; // public/audio/<audioKey>.mp3 — undefined for silent beats (ring/loop)
};

// Props passed into the composition. Scenes are plain serializable data so they
// can flow through calculateMetadata -> component (per Remotion best practices).
export type ClipProps = {
  scenes: Scene[];
};

const f = (s: number) => Math.round(s * FPS);

// `dur` maps audioKey -> measured clip seconds (from Root's calculateMetadata).
// When absent (dry preview / un-synthesized), fall back to the estimator so the
// composition still builds. speechSec = the speech length, so karaoke captions
// sync to the real voice once audio is wired.
export function buildScenes(s: Script, dur?: Record<string, number>): Scene[] {
  const scenes: Scene[] = [];
  const sec = (key: string, text: string, lang: 'en' | 'es') => dur?.[key] ?? estDur(text, lang);

  const hookS = sec('hook', s.hook.say, 'en');
  scenes.push({kind: 'hook', audioKey: 'hook', durFrames: f(hookS + PAD), speechSec: hookS});

  if (s.lead_in) {
    const d = sec('lead', s.lead_in.say, 'en');
    scenes.push({kind: 'lead', audioKey: 'lead', durFrames: f(d + PAD), speechSec: d});
  }

  s.cards.forEach((c, i) => {
    const pk = `card${i}_prompt`;
    const rk = `card${i}_reveal`;
    const pd = sec(pk, c.prompt_say, 'en');
    const rd = sec(rk, c.reveal_say, 'es');
    scenes.push({kind: 'prompt', cardIndex: i, audioKey: pk, durFrames: f(pd + PAD), speechSec: pd});
    scenes.push({kind: 'ring', cardIndex: i, durFrames: f(GAP), speechSec: GAP});
    scenes.push({kind: 'reveal', cardIndex: i, audioKey: rk, durFrames: f(rd + HOLD), speechSec: rd});
  });

  const od = sec('outro', s.outro.say, 'en');
  scenes.push({kind: 'outro', audioKey: 'outro', durFrames: f(Math.max(od, 2.0) + 0.4), speechSec: od});

  // seamless loop bridge: re-show hook frame-0 so last frame === first frame
  scenes.push({kind: 'loop', durFrames: f(LOOP_BRIDGE), speechSec: 1});

  return scenes;
}

export const totalFrames = (scenes: Scene[]) =>
  scenes.reduce((a, b) => a + b.durFrames, 0);
