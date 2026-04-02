import { createId } from '../../lib/storage';
import { resolveBrowserLocalWhisperInferenceUrl } from '../../lib/openaiCompatible';
import type { TranscriptSegment } from '../../types/meeting';
import { hasUsableTranscriptText, sanitizeTranscriptText } from './transcriptSanitizer';
import type {
  RecordingEngine,
  RecordingEngineCallbacks,
  RecordingEngineSnapshot,
} from './engineTypes';

type EngineState = 'idle' | 'recording' | 'paused';

interface ChunkEnvelope {
  blob: Blob;
  startedAt: number;
  endedAt: number;
}

interface WhisperResponseSegment {
  start?: number;
  end?: number;
  text?: string;
  confidence?: number;
}

interface WhisperResponse {
  text?: string;
  segments?: WhisperResponseSegment[];
}

function buildChunkErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Light-Minute local whisper live transcription failed. ${error.message}`;
  }

  return 'Light-Minute local whisper live transcription failed unexpectedly.';
}

function buildSegmentsFromResponse(
  payload: WhisperResponse,
  envelope: ChunkEnvelope,
): TranscriptSegment[] {
  if (payload.segments?.length) {
    return payload.segments
      .filter((segment) => hasUsableTranscriptText(segment.text ?? ''))
      .map((segment, index) => ({
        id: createId(`segment-live-${index}`),
        startTime: Math.max(0, Math.round(envelope.startedAt + (segment.start ?? 0))),
        endTime: Math.max(
          Math.round(envelope.startedAt + ((segment.start ?? 0) + 1)),
          Math.round(envelope.startedAt + (segment.end ?? envelope.endedAt - envelope.startedAt)),
        ),
        text: sanitizeTranscriptText(segment.text ?? ''),
        confidence: segment.confidence ?? 0.9,
      }));
  }

  const transcript = sanitizeTranscriptText(payload.text ?? '');
  if (!hasUsableTranscriptText(transcript)) {
    return [];
  }

  return [
    {
      id: createId('segment-live-fallback'),
      startTime: Math.max(0, Math.round(envelope.startedAt)),
      endTime: Math.max(Math.round(envelope.startedAt + 1), Math.round(envelope.endedAt)),
      text: transcript,
      confidence: 0.9,
    },
  ];
}

export class LocalWhisperRecordingEngine implements RecordingEngine {
  readonly mode = 'local-whisper-live' as const;

  private state: EngineState = 'idle';
  private elapsedSeconds = 0;
  private emittedCount = 0;
  private tickTimer: number | null = null;
  private callbacks: RecordingEngineCallbacks | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkQueue: Promise<void> = Promise.resolve();
  private currentChunkStartedAt = 0;
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  isSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }

  start(callbacks: RecordingEngineCallbacks) {
    if (!this.isSupported()) {
      throw new Error('Light-Minute local whisper live transcription is not supported in this browser.');
    }

    this.reset();
    this.state = 'recording';
    this.callbacks = callbacks;
    this.currentChunkStartedAt = 0;
    this.startTicking();

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (this.state === 'idle') {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        this.stream = stream;
        const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : undefined;
        this.recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);

        this.recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size === 0) {
            return;
          }

          const endedAt = Math.max(this.elapsedSeconds, 1);
          const envelope: ChunkEnvelope = {
            blob: event.data,
            startedAt: this.currentChunkStartedAt,
            endedAt,
          };
          this.currentChunkStartedAt = endedAt;
          this.chunkQueue = this.chunkQueue.then(() => this.processChunk(envelope));
        };

        this.recorder.onerror = () => {
          this.callbacks?.onError?.('Audio capture failed while using the Light-Minute local whisper recorder.');
        };

        this.recorder.start(3000);
      })
      .catch((error) => {
        this.callbacks?.onError?.(
          error instanceof Error
            ? `Microphone access failed. ${error.message}`
            : 'Microphone access failed.',
        );
        this.reset();
      });
  }

  pause() {
    if (this.state !== 'recording') {
      return;
    }

    this.state = 'paused';
    this.clearTickTimer();
    this.recorder?.pause();
  }

  resume() {
    if (this.state !== 'paused') {
      return;
    }

    this.state = 'recording';
    this.currentChunkStartedAt = this.elapsedSeconds;
    this.startTicking();
    this.recorder?.resume();
  }

  async stop(): Promise<RecordingEngineSnapshot> {
    const snapshot = {
      elapsedSeconds: this.elapsedSeconds,
      emittedCount: this.emittedCount,
      mode: this.mode,
    } satisfies RecordingEngineSnapshot;

    this.clearTickTimer();
    this.state = 'idle';

    await this.stopRecorder();
    await this.chunkQueue.catch(() => {});
    this.stopTracks();
    this.reset();

    return snapshot;
  }

  private startTicking() {
    this.clearTickTimer();
    this.tickTimer = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.callbacks?.onTick(this.elapsedSeconds);
    }, 1000);
  }

  private clearTickTimer() {
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private async stopRecorder() {
    if (!this.recorder || this.recorder.state === 'inactive') {
      return;
    }

    await new Promise<void>((resolve) => {
      if (!this.recorder) {
        resolve();
        return;
      }

      const recorder = this.recorder;
      recorder.onstop = () => resolve();

      try {
        if (recorder.state === 'paused') {
          recorder.resume();
        }
        recorder.stop();
      } catch {
        resolve();
      }
    });
  }

  private stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async processChunk(envelope: ChunkEnvelope) {
    try {
      const formData = new FormData();
      formData.append(
        'file',
        new File([envelope.blob], 'live-chunk.webm', { type: envelope.blob.type || 'audio/webm' }),
      );
      formData.append('response_format', 'json');
      formData.append('temperature', '0.0');
      formData.append('temperature_inc', '0.2');
      formData.append('detect_language', 'true');
      formData.append('diarize', 'false');
      formData.append('split_on_word', 'true');

      const response = await fetch(resolveBrowserLocalWhisperInferenceUrl(this.endpoint), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`The local whisper server returned ${response.status}.`);
      }

      const payload = (await response.json()) as WhisperResponse;
      const segments = buildSegmentsFromResponse(payload, envelope);

      segments.forEach((segment) => this.callbacks?.onSegment(segment));
      this.emittedCount += segments.length;
    } catch (error) {
      this.callbacks?.onError?.(buildChunkErrorMessage(error));
    }
  }

  private reset() {
    this.clearTickTimer();
    this.state = 'idle';
    this.elapsedSeconds = 0;
    this.emittedCount = 0;
    this.callbacks = null;
    this.recorder = null;
    this.stopTracks();
    this.chunkQueue = Promise.resolve();
    this.currentChunkStartedAt = 0;
  }
}
