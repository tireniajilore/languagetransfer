import type { TTSAdapter } from '@/types/adapters';
import type { TTSManifest } from '@/types/tts-manifest';
import type { SpeechSegment } from '@/types/lesson';

export class StaticTTS implements TTSAdapter {
  private readonly lessonId: string;
  private readonly fallback: TTSAdapter | null;
  private activeAudio: HTMLAudioElement | null;
  private activeAudioUrl: string | null;
  private activeRequest: AbortController | null;
  private playbackToken: number;
  private manifestPromise: Promise<TTSManifest | null> | null;

  constructor(lessonId: string, fallback: TTSAdapter | null = null) {
    this.lessonId = lessonId;
    this.fallback = fallback;
    this.activeAudio = null;
    this.activeAudioUrl = null;
    this.activeRequest = null;
    this.playbackToken = 0;
    this.manifestPromise = null;
  }

  async speak(text: string, segments?: SpeechSegment[], sourceKey?: string): Promise<void> {
    if (!sourceKey) {
      return this.fallback?.speak(text, segments, sourceKey) ?? Promise.reject(new Error('Static TTS requires a source key.'));
    }

    this.stop();

    const token = ++this.playbackToken;
    const manifest = await this.loadManifest();
    const entry = manifest?.entries[sourceKey];

    if (!entry) {
      return this.fallback?.speak(text, segments, sourceKey) ?? Promise.reject(new Error(`No static audio found for ${sourceKey}.`));
    }

    const controller = new AbortController();
    this.activeRequest = controller;

    try {
      let nextBlobPromise: Promise<Blob> | null = this.fetchStaticBlob(entry.segments[0].file, controller, token);

      for (let index = 0; index < entry.segments.length; index += 1) {
        if (!nextBlobPromise || token !== this.playbackToken) {
          return;
        }

        const blob = await nextBlobPromise;
        const nextSegment = entry.segments[index + 1];
        nextBlobPromise = nextSegment
          ? this.fetchStaticBlob(nextSegment.file, controller, token)
          : null;

        if (token !== this.playbackToken) {
          return;
        }

        await this.playBlob(blob, token);
      }
    } catch (error) {
      if (controller.signal.aborted || token !== this.playbackToken) {
        return;
      }

      this.clearActiveAudio();
      this.activeRequest = null;
      return this.fallback?.speak(text, segments, sourceKey) ?? Promise.reject(error);
    } finally {
      if (this.activeRequest === controller) {
        this.activeRequest = null;
      }
    }
  }

  stop(): void {
    this.playbackToken += 1;

    if (this.activeRequest) {
      this.activeRequest.abort();
      this.activeRequest = null;
    }

    if (this.activeAudio) {
      this.activeAudio.pause();
    }
    this.clearActiveAudio();

    this.fallback?.stop();
  }

  private loadManifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch(`/audio/${this.lessonId}/manifest.json`, {
        cache: 'no-store'
      })
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }

          return response.json() as Promise<TTSManifest>;
        })
        .catch(() => null);
    }

    return this.manifestPromise;
  }

  private clearActiveAudio() {
    if (this.activeAudio) {
      this.activeAudio.onended = null;
      this.activeAudio.onerror = null;
      this.activeAudio.src = '';
      this.activeAudio = null;
    }

    if (this.activeAudioUrl) {
      URL.revokeObjectURL(this.activeAudioUrl);
      this.activeAudioUrl = null;
    }
  }

  private async fetchStaticBlob(
    fileName: string,
    controller: AbortController,
    token: number
  ) {
    const response = await fetch(`/audio/${this.lessonId}/${fileName}`, {
      signal: controller.signal,
      cache: 'force-cache'
    });

    if (token !== this.playbackToken) {
      throw new Error('Playback cancelled.');
    }

    if (!response.ok) {
      throw new Error(`Static audio missing: ${fileName}`);
    }

    return response.blob();
  }

  private async playBlob(blob: Blob, token: number) {
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    this.activeAudio = audio;
    this.activeAudioUrl = audioUrl;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        if (token !== this.playbackToken) {
          resolve();
          return;
        }
        this.clearActiveAudio();
        resolve();
      };

      audio.onerror = () => {
        if (token !== this.playbackToken) {
          resolve();
          return;
        }
        this.clearActiveAudio();
        reject(new Error('Unable to play static audio.'));
      };

      audio.play().catch((error) => {
        this.clearActiveAudio();
        reject(error);
      });
    });
  }
}
