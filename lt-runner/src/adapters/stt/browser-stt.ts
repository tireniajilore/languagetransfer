import type { STTAdapter } from '@/types/adapters';

type SpeechRecognitionCtor = new () => SpeechRecognition;

export class BrowserSTT implements STTAdapter {
  private recognition: SpeechRecognition | null = null;
  private transcript = '';

  constructor() {
    if (typeof window === 'undefined') return;
    const ctor = (window.SpeechRecognition || window.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined;
    if (!ctor) return;

    this.recognition = new ctor();
    this.recognition.lang = 'es-ES';
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;
  }

  async startListening() {
    if (!this.recognition) {
      throw new Error('Browser speech recognition unavailable');
    }

    this.transcript = '';

    return new Promise<void>((resolve, reject) => {
      this.recognition!.onstart = () => resolve();
      this.recognition!.onerror = () => reject(new Error('Unable to start speech recognition'));
      this.recognition!.onresult = (event) => {
        this.transcript = event.results[0]?.[0]?.transcript ?? '';
      };
      this.recognition!.start();
    });
  }

  async stopListening() {
    if (!this.recognition) {
      throw new Error('Browser speech recognition unavailable');
    }

    return new Promise<string>((resolve) => {
      this.recognition!.onend = () => resolve(this.transcript);
      this.recognition!.stop();
    });
  }
}
