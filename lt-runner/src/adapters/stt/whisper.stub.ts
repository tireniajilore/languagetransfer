import type { STTAdapter } from '@/types/adapters';

export class WhisperStub implements STTAdapter {
  async startListening(): Promise<void> {
    throw new Error('Whisper adapter not implemented for the MVP');
  }

  async stopListening(): Promise<string> {
    throw new Error('Whisper adapter not implemented for the MVP');
  }
}
