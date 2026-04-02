import type { TTSAdapter } from '@/types/adapters';

export class TextTTS implements TTSAdapter {
  async speak() {
    return Promise.resolve();
  }

  stop() {}
}
