import { BrowserTTS } from '@/adapters/tts/browser-tts';
import type { TTSAdapter } from '@/types/adapters';

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

  async speak(text: string): Promise<void> {
    this.stop();

    const token = ++this.playbackToken;
    const controller = new AbortController();
    this.activeRequest = controller;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text }),
        signal: controller.signal
      });

      if (token !== this.playbackToken) {
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'ElevenLabs TTS request failed.');
      }

      const audioBlob = await response.blob();
      if (token !== this.playbackToken) {
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
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
    } catch (error) {
      if (controller.signal.aborted || token !== this.playbackToken) {
        return;
      }

      this.clearActiveAudio();
      this.activeRequest = null;
      return this.browserFallback.speak(text);
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
      this.activeAudio.onended = null;
      this.activeAudio.onerror = null;
      this.activeAudio.src = '';
      this.activeAudio = null;
    }

    if (this.activeAudioUrl) {
      URL.revokeObjectURL(this.activeAudioUrl);
      this.activeAudioUrl = null;
    }

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
}
