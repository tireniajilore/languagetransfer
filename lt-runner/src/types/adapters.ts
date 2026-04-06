import type { SpeechSegment } from '@/types/lesson';

export interface TTSAdapter {
  speak(text: string, segments?: SpeechSegment[], sourceKey?: string): Promise<void>;
  stop(): void;
}

export interface STTAdapter {
  startListening(): Promise<void>;
  stopListening(): Promise<string>;
}
