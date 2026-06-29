import type { STTAdapter } from '@/types/adapters';

type SpeechRecognitionCtor = new () => SpeechRecognition;

export class BrowserSTT implements STTAdapter {
  private recognition: SpeechRecognition | null = null;
  private transcript = '';
  private isListening = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const ctor = (window.SpeechRecognition || window.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined;
    if (!ctor) return;

    this.recognition = new ctor();
    // Concrete country locale — Chrome's speech recognizer does not accept the
    // generic 'es-419' tag and silently falls back to the UI language (often
    // en-US), which wrecks Spanish transcription. es-MX is well-supported and
    // matches the largest Spanish variety among US learners.
    this.recognition.lang = 'es-MX';
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
  }

  async startListening() {
    if (!this.recognition) {
      throw new Error('Browser speech recognition unavailable');
    }

    this.transcript = '';

    return new Promise<void>((resolve, reject) => {
      this.recognition!.onstart = () => {
        this.isListening = true;
        resolve();
      };
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
      this.recognition!.onend = () => {
        this.isListening = false;
        resolve(this.transcript);
      };
      this.recognition!.stop();
    });
  }

  async listenForCompleteUtterance(timeoutMs = 12000, onInterim?: (text: string) => void) {
    if (!this.recognition) {
      throw new Error('Browser speech recognition unavailable');
    }

    this.cancelListening();
    this.transcript = '';

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let timeout: number | null = null;

      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        const shouldStop = this.isListening;
        this.isListening = false;
        if (timeout) window.clearTimeout(timeout);
        this.recognition!.onend = null;
        this.recognition!.onerror = null;
        this.recognition!.onresult = null;
        if (shouldStop) {
          try {
            this.recognition!.stop();
          } catch {
            // Speech recognition may have already stopped after a final result.
          }
        }
        resolve(value.trim());
      };

      this.recognition!.onerror = (event) => {
        if (event.error === 'no-speech') {
          finish('');
          return;
        }

        if (settled) return;
        settled = true;
        this.isListening = false;
        if (timeout) window.clearTimeout(timeout);
        reject(new Error('Unable to hear a Spanish response'));
      };

      this.recognition!.onend = () => finish(this.transcript);
      this.recognition!.onresult = (event) => {
        const resultParts: string[] = [];
        let hasFinalResult = false;

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          resultParts.push(result[0]?.transcript ?? '');
          if (result.isFinal) hasFinalResult = true;
        }

        this.transcript = resultParts.join(' ').replace(/\s+/g, ' ').trim();
        onInterim?.(this.transcript);

        if (hasFinalResult) {
          finish(this.transcript);
        }
      };

      timeout = window.setTimeout(() => finish(this.transcript), timeoutMs);

      try {
        this.recognition!.start();
        this.isListening = true;
      } catch {
        if (timeout) window.clearTimeout(timeout);
        reject(new Error('Unable to start speech recognition'));
      }
    });
  }

  cancelListening() {
    if (!this.recognition || !this.isListening) return;

    try {
      this.recognition.stop();
    } catch {
      // Speech recognition may have already stopped.
    }

    this.isListening = false;
  }
}
