import type { TTSAdapter } from '@/types/adapters';

export class TextTTS implements TTSAdapter {
  async speak(_text: string, _segments?: { text: string; lang: 'en' | 'es' }[]) {
    return Promise.resolve();
  }

  stop() {}
}
