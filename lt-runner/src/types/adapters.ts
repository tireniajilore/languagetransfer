export interface TTSAdapter {
  speak(text: string): Promise<void>;
  stop(): void;
}

export interface STTAdapter {
  startListening(): Promise<void>;
  stopListening(): Promise<string>;
}
