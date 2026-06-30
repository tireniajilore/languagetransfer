export type BatchSTTState = 'recording' | 'transcribing';

interface TranscribeOptions {
  expected?: string[];
  maxMs?: number;
  silenceMs?: number;
  onState?: (state: BatchSTTState) => void;
}

// Records a short spoken answer, auto-stops shortly after the learner finishes
// (voice-activity detection), then sends the clip to /api/stt for accurate,
// expected-word-biased transcription. Replaces the browser Web Speech API,
// which mis-transcribes non-native Spanish.
export class BatchSTT {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private cancelled = false;

  get isSupported() {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
      && typeof MediaRecorder !== 'undefined';
  }

  async transcribe(options: TranscribeOptions = {}): Promise<string> {
    const { expected = [], maxMs = 7000, silenceMs = 800, onState } = options;

    if (!this.isSupported) {
      throw new Error('Microphone recording is unavailable in this browser.');
    }

    this.cancelled = false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;

    const recorder = new MediaRecorder(stream);
    this.recorder = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    onState?.('recording');
    recorder.start();

    const hardStop = window.setTimeout(() => this.stopRecorder(), maxMs);
    this.armSilenceDetection(stream, silenceMs, maxMs, () => this.stopRecorder());

    await stopped;
    window.clearTimeout(hardStop);
    this.teardown();

    if (this.cancelled) return '';

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size === 0) return '';

    onState?.('transcribing');
    const form = new FormData();
    form.append('file', blob, 'answer.webm');
    form.append('expected', expected.join(', '));

    const response = await fetch('/api/stt', { method: 'POST', body: form });
    if (!response.ok) {
      throw new Error('Transcription request failed.');
    }

    const data = (await response.json()) as { text?: string };
    return (data.text ?? '').trim();
  }

  cancel() {
    this.cancelled = true;
    this.stopRecorder();
    this.teardown();
  }

  // RMS-based voice activity detection: wait for the learner to start speaking,
  // then stop once they've been quiet for `silenceMs`. This is what keeps
  // latency low — we don't sit through a fixed window after a one-word answer.
  private armSilenceDetection(
    stream: MediaStream,
    silenceMs: number,
    maxMs: number,
    onSilence: () => void
  ) {
    const AudioCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const audioContext = new AudioCtor();
    this.audioContext = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    const VOICE_THRESHOLD = 0.02;
    let hasSpoken = false;
    let lastVoiceAt = Date.now();

    const tick = () => {
      if (!this.audioContext || this.cancelled) return;

      analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) sumSquares += buffer[i] * buffer[i];
      const rms = Math.sqrt(sumSquares / buffer.length);

      const now = Date.now();
      if (rms > VOICE_THRESHOLD) {
        hasSpoken = true;
        lastVoiceAt = now;
      }

      const quietLongEnough = hasSpoken && now - lastVoiceAt > silenceMs;
      const overallTimeout = now - startedAt > maxMs;
      if (quietLongEnough || overallTimeout) {
        onSilence();
        return;
      }

      window.setTimeout(tick, 100);
    };

    window.setTimeout(tick, 100);
  }

  private stopRecorder() {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      }
    } catch {
      // Recorder may have already stopped.
    }
  }

  private teardown() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }
}
