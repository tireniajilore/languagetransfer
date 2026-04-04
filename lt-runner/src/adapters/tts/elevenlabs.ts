import { BrowserTTS } from '@/adapters/tts/browser-tts';
import type { TTSAdapter } from '@/types/adapters';
import type { SpeechSegment } from '@/types/lesson';

export class ElevenLabsTTS implements TTSAdapter {
  private readonly browserFallback: BrowserTTS;
  private activeAudio: HTMLAudioElement | null;
  private activeAudioUrl: string | null;
  private activeRequest: AbortController | null;
  private playbackToken: number;

  constructor(browserFallback = new BrowserTTS()) {
    this.browserFallback = browserFallback;
    this.activeAudio = null;
    this.activeAudioUrl = null;
    this.activeRequest = null;
    this.playbackToken = 0;
  }

  async speak(text: string, segments?: SpeechSegment[]): Promise<void> {
    this.stop();

    const token = ++this.playbackToken;
    const controller = new AbortController();
    this.activeRequest = controller;
    const toSpeak = segments?.length ? segments : [{ text, lang: 'en' as const }];
    let hasStartedPlayback = false;

    try {
      let nextBlobPromise: Promise<Blob> | null = this.fetchSegmentBlob(toSpeak[0], controller, token);

      for (let index = 0; index < toSpeak.length; index += 1) {
        if (!nextBlobPromise || token !== this.playbackToken) {
          return;
        }

        const blob = await nextBlobPromise;
        const nextSegment = toSpeak[index + 1];
        nextBlobPromise = nextSegment
          ? this.fetchSegmentBlob(nextSegment, controller, token)
          : null;

        if (token !== this.playbackToken) {
          return;
        }

        hasStartedPlayback = true;
        await this.playBlob(blob, token);
      }
    } catch (error) {
      if (controller.signal.aborted || token !== this.playbackToken) {
        return;
      }

      this.clearActiveAudio();
      this.activeRequest = null;
      if (!hasStartedPlayback) {
        return this.browserFallback.speak(text);
      }
      throw error;
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

    this.browserFallback.stop();
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

  private async fetchSegmentBlob(
    segment: SpeechSegment,
    controller: AbortController,
    token: number
  ) {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: segment.text, lang: segment.lang }),
      signal: controller.signal
    });

    if (token !== this.playbackToken) {
      throw new Error('Playback cancelled.');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'ElevenLabs TTS request failed.');
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
        reject(new Error('Unable to play ElevenLabs audio.'));
      };

      audio.play().catch((error) => {
        this.clearActiveAudio();
        reject(error);
      });
    });
  }
}
