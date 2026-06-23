const DEFAULT_VOICE_ID = 'Czw3Dn181ypdrCOnPfif'; // Brian (matches TikTok pipeline)

// Matches the TikTok lesson pipeline (tiktok/remotion/scripts/tts-lesson.mjs):
// eleven_v3 with per-segment language tagging keeps cognates English in prompts
// and Spanish in reveals, so we drop the v2 speed/carrier-phrase params here.
export const ELEVENLABS_MODEL_ID = 'eleven_v3';

export type ElevenLabsLanguage = 'en' | 'es';

export interface ElevenLabsRequestBody {
  text: string;
  model_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
  };
  language_code?: ElevenLabsLanguage;
}

export function getElevenLabsVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
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
      similarity_boost: 0.8
    },
    language_code: lang
  };
}
