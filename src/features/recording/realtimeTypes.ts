export type RealtimeProtocolVersion = 'v1';

export type RealtimeSupportedLanguage = 'zh-CN' | 'en-US';

export type RealtimeEngineMode =
  | 'browser-speech-fallback'
  | 'local-whisper-chunk'
  | 'local-whisper-stream'
  | 'mock';

export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

export type MicStatus =
  | 'unknown'
  | 'requesting_permission'
  | 'ready'
  | 'denied'
  | 'ended'
  | 'error';

export type VoiceState = 'unknown' | 'speech' | 'silence';

export type TransportStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'draining'
  | 'closed'
  | 'error';

export type PersistenceStatus =
  | 'idle'
  | 'persisting'
  | 'persisted'
  | 'error';

export type FinalizeReason = 'silence' | 'force' | 'pause' | 'stop';
export type UtteranceBoundaryReason = Extract<FinalizeReason, 'force'>;

export type PipelineErrorSource =
  | 'mic'
  | 'capture'
  | 'vad'
  | 'transport'
  | 'asr'
  | 'merge'
  | 'persistence';

export interface PipelineError {
  source: PipelineErrorSource;
  message: string;
  recoverable: boolean;
}

export interface RealtimeSessionCapabilities {
  supportsPartials: boolean;
  supportsFinals: boolean;
  acceptedLanguage: string;
}

export interface TransportMetricsSnapshot {
  lastAcceptedSeq: number;
  queueDepth: number;
  bufferedMs: number;
  lastPartialAudioMs: number | null;
  lastPartialInferenceMs: number | null;
  lastPartialEmitLatencyMs: number | null;
  stalePartialDropCount: number;
  lastFinalizeReason: FinalizeReason | null;
  lastFinalAudioMs: number | null;
  lastFinalInferenceMs: number | null;
  lastFinalEmitLatencyMs: number | null;
}

export interface RealtimeSession {
  sessionId: string;
  engineMode: RealtimeEngineMode;
  language: string;
  startedAt: string;
  status: SessionStatus;
}

export interface AudioChunk {
  sessionId: string;
  seq: number;
  startMs: number;
  endMs: number;
  hasSpeech: boolean;
  isLast: boolean;
  boundaryReason?: UtteranceBoundaryReason | null;
}

export type AsrEventType = 'partial' | 'final' | 'error' | 'end';

export interface AsrEvent {
  type: AsrEventType;
  sessionId: string;
  groupId: string;
  utteranceId: string;
  revision: number;
  startMs: number;
  endMs: number;
  text: string;
  error?: PipelineError;
}

export interface FinalTranscriptSegment {
  id: string;
  sessionId: string;
  groupId: string;
  utteranceId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptModel {
  finalSegments: FinalTranscriptSegment[];
  activePartial: AsrEvent | null;
  displayText: string;
}

export type TranscriptDisplayState = 'empty' | 'partial' | 'stable';

export interface RealtimeVoiceInputState {
  session: RealtimeSession | null;
  sessionCapabilities: RealtimeSessionCapabilities | null;
  micStatus: MicStatus;
  voiceState: VoiceState;
  transportStatus: TransportStatus;
  transportMetrics: TransportMetricsSnapshot | null;
  persistenceStatus: PersistenceStatus;
  transcript: TranscriptModel;
  elapsedMs: number;
  nextChunkSeq: number;
  lastError: PipelineError | null;
  lastWarning: PipelineError | null;
}
