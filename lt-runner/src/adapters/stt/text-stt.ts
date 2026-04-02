import type { STTAdapter } from '@/types/adapters';

export class TextSTT implements STTAdapter {
  private readonly getValue: () => string;
  private readonly clearValue?: () => void;

  constructor(getValue: () => string, clearValue?: () => void) {
    this.getValue = getValue;
    this.clearValue = clearValue;
  }

  async startListening() {
    return Promise.resolve();
  }

  async stopListening() {
    const value = this.getValue();
    this.clearValue?.();
    return value;
  }
}
