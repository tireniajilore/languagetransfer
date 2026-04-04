import type { TTSAdapter } from '@/types/adapters';
import type { SpeechSegment } from '@/types/lesson';

export class TextTTS implements TTSAdapter {
  async speak(_text: string, _segments?: SpeechSegment[]) {
    return Promise.resolve();
  }

  stop() {}
}
