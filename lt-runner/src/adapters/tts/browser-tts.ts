import type { TTSAdapter } from '@/types/adapters';

export class BrowserTTS implements TTSAdapter {
  private synthesis: SpeechSynthesis | null;
  private activeUtterance: SpeechSynthesisUtterance | null;

  constructor() {
    this.synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null;
    this.activeUtterance = null;
  }

  speak(text: string) {
    if (!this.synthesis) {
      return Promise.reject(new Error('Speech synthesis unavailable'));
    }

    this.stop();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.onend = () => {
        this.activeUtterance = null;
        resolve();
      };
      utterance.onerror = () => {
        this.activeUtterance = null;
        reject(new Error('Unable to play browser speech'));
      };
      this.activeUtterance = utterance;
      this.synthesis!.speak(utterance);
    });
  }

  stop() {
    if (!this.synthesis) return;
    if (this.synthesis.speaking || this.synthesis.pending) {
      this.synthesis.cancel();
    }
    this.activeUtterance = null;
  }
}
