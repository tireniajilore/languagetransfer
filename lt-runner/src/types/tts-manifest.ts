import type { SpeechSegment } from '@/types/lesson';

export interface TTSManifestSegment extends SpeechSegment {
  file: string;
  hash: string;
}

export interface TTSManifestEntry {
  segments: TTSManifestSegment[];
}

export interface TTSManifest {
  lessonId: string;
  generatedAt: string;
  entries: Record<string, TTSManifestEntry>;
}
