const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_ENGLISH_SPEED = 1.1;
const DEFAULT_SPANISH_SPEED = 0.9;

export const ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';

export type ElevenLabsLanguage = 'en' | 'es';

export interface ElevenLabsRequestBody {
  text: string;
  model_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    speed: number;
  };
  language_code?: 'es';
  previous_text?: string;
  next_text?: string;
}

function parseSpeed(rawValue: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(rawValue ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getElevenLabsVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
}

export function getEnglishSpeed() {
  return parseSpeed(process.env.ELEVENLABS_SPEED_EN, DEFAULT_ENGLISH_SPEED);
}

export function getSpanishSpeed() {
  return parseSpeed(process.env.ELEVENLABS_SPEED_ES, DEFAULT_SPANISH_SPEED);
}

export function buildElevenLabsRequestBody(
  text: string,
  lang: ElevenLabsLanguage = 'en'
): ElevenLabsRequestBody {
  return {
    text,
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      speed: lang === 'es' ? getSpanishSpeed() : getEnglishSpeed()
    },
    ...(lang === 'es'
      ? {
          language_code: 'es' as const,
          previous_text: 'En español:',
          next_text: 'Muy bien.'
        }
      : {})
  };
}
