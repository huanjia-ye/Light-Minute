import type { TranscriptSegment } from '../../types/meeting';
import type {
  AsrEvent,
  MicStatus,
  PipelineError,
  RealtimeSessionCapabilities,
  TransportMetricsSnapshot,
  TransportStatus,
  VoiceState,
} from './realtimeTypes';

export type RecordingEngineMode =
  | 'browser-speech'
  | 'local-whisper-live'
  | 'local-whisper-chunk'
  | 'mock';

export interface RecordingEngineCallbacks {
  onSegment?: (segment: TranscriptSegment) => void;
  onAsrEvent?: (event: AsrEvent) => void;
  onTick: (elapsedSeconds: number) => void;
  onError?: (message: string) => void;
  onWarning?: (warning: PipelineError) => void;
  onMicStatus?: (status: MicStatus) => void;
  onVoiceState?: (voiceState: VoiceState) => void;
  onTransportStatus?: (status: TransportStatus) => void;
  onSessionCapabilities?: (capabilities: RealtimeSessionCapabilities) => void;
  onTransportMetrics?: (metrics: TransportMetricsSnapshot) => void;
}

export interface RecordingEngineStartOptions {
  sessionId: string;
  language: string;
  micDevice?: string;
  callbacks: RecordingEngineCallbacks;
}

export interface RecordingEngineSnapshot {
  elapsedSeconds: number;
  emittedCount: number;
  mode: RecordingEngineMode;
}

export interface RecordingEngine {
  readonly mode: RecordingEngineMode;
  isSupported: () => boolean;
  start: (options: RecordingEngineStartOptions) => Promise<void>;
  pause: () => void | Promise<void>;
  resume: () => void | Promise<void>;
  stop: () => Promise<RecordingEngineSnapshot>;
}
