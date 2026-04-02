import type { TranscriptSegment } from '../../types/meeting';

export type RecordingEngineMode = 'browser-speech' | 'local-whisper-live' | 'mock';

export interface RecordingEngineCallbacks {
  onSegment: (segment: TranscriptSegment) => void;
  onTick: (elapsedSeconds: number) => void;
  onError?: (message: string) => void;
}

export interface RecordingEngineSnapshot {
  elapsedSeconds: number;
  emittedCount: number;
  mode: RecordingEngineMode;
}

export interface RecordingEngine {
  readonly mode: RecordingEngineMode;
  isSupported: () => boolean;
  start: (callbacks: RecordingEngineCallbacks) => void;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<RecordingEngineSnapshot>;
}
