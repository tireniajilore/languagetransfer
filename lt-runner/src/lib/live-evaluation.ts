/** Opt-in audio-native evaluation capture; recordings remain in the browser. */
export class LiveEvaluationRecorder {
  private context: AudioContext | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private sources: MediaStreamAudioSourceNode[] = [];
  start(local: MediaStream, remote: MediaStream): void {
    if (this.recorder) throw new Error('Evaluation recording already started');
    if (typeof MediaRecorder === 'undefined')
      throw new Error('This browser cannot record evaluation audio');
    const context = new AudioContext();
    this.context = context;
    const destination = context.createMediaStreamDestination();
    for (const stream of [local, remote]) {
      const source = context.createMediaStreamSource(stream);
      source.connect(destination);
      this.sources.push(source);
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(
      (t) => MediaRecorder.isTypeSupported(t),
    );
    const recorder = new MediaRecorder(
      destination.stream,
      mimeType ? { mimeType } : undefined,
    );
    this.recorder = recorder;
    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    recorder.start(1000);
    void context.resume();
  }
  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) return null;
    this.recorder = null;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    const audio = new Blob(this.chunks, { type: recorder.mimeType });
    this.chunks = [];
    for (const source of this.sources) source.disconnect();
    this.sources = [];
    await this.context?.close();
    this.context = null;
    return audio;
  }
}
export function downloadEvaluationFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
