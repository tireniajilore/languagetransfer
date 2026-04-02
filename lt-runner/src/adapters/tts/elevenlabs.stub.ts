import type { TTSAdapter } from '@/types/adapters';

export class ElevenLabsStub implements TTSAdapter {
  async speak() {
    throw new Error('ElevenLabs adapter not implemented for the MVP');
  }

  stop() {}
}
