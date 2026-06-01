import { create } from 'zustand';
import { createId } from '../../lib/storage';
import type { TranscriptSegment } from '../../types/meeting';
import {
  appendLegacyFinalSegmentToTranscript,
  applyAsrEventToTranscript,
  createEmptyTranscriptModel,
  transcriptModelToLegacySegments,
} from './realtimeTranscriptReducer';
import type {
  AsrEvent,
  MicStatus,
  PersistenceStatus,
  PipelineError,
  RealtimeEngineMode,
  RealtimeSessionCapabilities,
  RealtimeSession,
  SessionStatus,
  TranscriptModel,
  TransportMetricsSnapshot,
  TransportStatus,
  VoiceState,
} from './realtimeTypes';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'finalizing' | 'saving' | 'error';

interface RecordingStateSnapshot {
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
  activeMeetingTitle: string;
}

interface RecordingStore {
  status: RecordingStatus;
  activeMeetingTitle: string;
  elapsedSeconds: number;
  segments: TranscriptSegment[];
  errorMessage: string;
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
  startSession: (title: string) => void;
  appendSegment: (segment: TranscriptSegment) => void;
  setStatus: (status: RecordingStatus, errorMessage?: string) => void;
  updateElapsed: (elapsedSeconds: number) => void;
  resetSession: () => void;
  createRealtimeSession: (input: {
    title: string;
    engineMode?: RealtimeEngineMode;
    language?: string;
    sessionId?: string;
  }) => string;
  setSessionStatus: (status: SessionStatus) => void;
  setMicStatus: (status: MicStatus) => void;
  setVoiceState: (voiceState: VoiceState) => void;
  setTransportStatus: (status: TransportStatus) => void;
  setPersistenceStatus: (status: PersistenceStatus) => void;
  setPipelineError: (error: PipelineError | null) => void;
  setPipelineWarning: (warning: PipelineError | null) => void;
  setSessionCapabilities: (capabilities: RealtimeSessionCapabilities | null) => void;
  setTransportMetrics: (metrics: TransportMetricsSnapshot | null) => void;
  applyAsrEvent: (event: AsrEvent) => void;
  replaceTranscript: (transcript: TranscriptModel) => void;
  advanceChunkSeq: () => number;
  resetRealtimeState: () => void;
}

function deriveLegacyStatus(snapshot: RecordingStateSnapshot): RecordingStatus {
  if (snapshot.lastError || snapshot.session?.status === 'error') {
    return 'error';
  }

  if (snapshot.persistenceStatus === 'persisting') {
    return 'saving';
  }

  if (snapshot.session?.status === 'stopping') {
    return 'finalizing';
  }

  if (snapshot.session?.status === 'paused') {
    return 'paused';
  }

  if (snapshot.session?.status === 'starting' || snapshot.session?.status === 'running') {
    return 'recording';
  }

  return 'idle';
}

function deriveLegacyErrorMessage(lastError: PipelineError | null) {
  return lastError?.message ?? '';
}

function getPatchedValue<Key extends keyof RecordingStateSnapshot>(
  state: RecordingStateSnapshot,
  patch: Partial<RecordingStateSnapshot>,
  key: Key,
): RecordingStateSnapshot[Key] {
  return Object.prototype.hasOwnProperty.call(patch, key)
    ? (patch[key] as RecordingStateSnapshot[Key])
    : state[key];
}

function syncLegacyFields(snapshot: RecordingStateSnapshot) {
  return {
    status: deriveLegacyStatus(snapshot),
    elapsedSeconds: Math.max(0, Math.floor(snapshot.elapsedMs / 1000)),
    segments: transcriptModelToLegacySegments(snapshot.transcript),
    errorMessage: deriveLegacyErrorMessage(snapshot.lastError),
  };
}

function applyPatch(
  state: RecordingStore,
  patch: Partial<RecordingStateSnapshot>,
): Partial<RecordingStore> {
  const nextSnapshot: RecordingStateSnapshot = {
    session: getPatchedValue(state, patch, 'session'),
    sessionCapabilities: getPatchedValue(state, patch, 'sessionCapabilities'),
    micStatus: getPatchedValue(state, patch, 'micStatus'),
    voiceState: getPatchedValue(state, patch, 'voiceState'),
    transportStatus: getPatchedValue(state, patch, 'transportStatus'),
    transportMetrics: getPatchedValue(state, patch, 'transportMetrics'),
    persistenceStatus: getPatchedValue(state, patch, 'persistenceStatus'),
    transcript: getPatchedValue(state, patch, 'transcript'),
    elapsedMs: getPatchedValue(state, patch, 'elapsedMs'),
    nextChunkSeq: getPatchedValue(state, patch, 'nextChunkSeq'),
    lastError: getPatchedValue(state, patch, 'lastError'),
    lastWarning: getPatchedValue(state, patch, 'lastWarning'),
    activeMeetingTitle: getPatchedValue(state, patch, 'activeMeetingTitle'),
  };

  return {
    ...patch,
    ...syncLegacyFields(nextSnapshot),
  };
}

function createInitialSnapshot(): RecordingStateSnapshot {
  return {
    session: null,
    sessionCapabilities: null,
    micStatus: 'unknown',
    voiceState: 'unknown',
    transportStatus: 'idle',
    transportMetrics: null,
    persistenceStatus: 'idle',
    transcript: createEmptyTranscriptModel(),
    elapsedMs: 0,
    nextChunkSeq: 0,
    lastError: null,
    lastWarning: null,
    activeMeetingTitle: '',
  };
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  ...createInitialSnapshot(),
  ...syncLegacyFields(createInitialSnapshot()),
  startSession: (title) =>
    set((state) =>
      applyPatch(state, {
        activeMeetingTitle: title,
        session: {
          sessionId: createId('rt'),
          engineMode: 'mock',
          language: 'auto',
          startedAt: new Date().toISOString(),
          status: 'running',
        },
        sessionCapabilities: null,
        micStatus: 'ready',
        voiceState: 'unknown',
        transportStatus: 'idle',
        transportMetrics: null,
        persistenceStatus: 'idle',
        transcript: createEmptyTranscriptModel(),
        elapsedMs: 0,
        nextChunkSeq: 0,
        lastError: null,
        lastWarning: null,
      }),
    ),
  appendSegment: (segment) =>
    set((state) => ({
      ...applyPatch(state, {
        transcript: appendLegacyFinalSegmentToTranscript(
          state.transcript,
          state.session?.sessionId ?? 'legacy-session',
          segment,
        ),
      }),
    })),
  setStatus: (status, errorMessage = '') =>
    set((state) => {
      if (status === 'idle') {
        return {
          ...applyPatch(state, {
            session: null,
            sessionCapabilities: null,
            transportStatus: 'idle',
            transportMetrics: null,
            persistenceStatus: 'idle',
            lastError: null,
            lastWarning: null,
          }),
        };
      }

      const nextSession: RealtimeSession = state.session ?? {
        sessionId: createId('rt'),
        engineMode: 'mock',
        language: 'auto',
        startedAt: new Date().toISOString(),
        status: 'idle',
      };

      const patch: Partial<RecordingStateSnapshot> = {
        session: {
          ...nextSession,
          status:
            status === 'paused'
              ? 'paused'
              : status === 'finalizing'
                ? 'stopping'
                : status === 'saving'
                  ? 'stopped'
                  : status === 'error'
                    ? 'error'
                    : 'running',
        },
        sessionCapabilities: null,
        persistenceStatus: status === 'saving' ? 'persisting' : state.persistenceStatus,
        lastError:
          status === 'error'
            ? {
                source: 'transport',
                message: errorMessage || 'Recording failed.',
                recoverable: true,
              }
            : state.lastError,
      };

      return {
        ...applyPatch(state, patch),
        status,
        errorMessage: status === 'error' ? errorMessage : deriveLegacyErrorMessage(patch.lastError ?? state.lastError),
      };
    }),
  updateElapsed: (elapsedSeconds) =>
    set((state) =>
      applyPatch(state, {
        elapsedMs: Math.max(0, elapsedSeconds) * 1000,
      }),
    ),
  resetSession: () =>
    set(() => {
      const initialSnapshot = createInitialSnapshot();
      return {
        ...initialSnapshot,
        ...syncLegacyFields(initialSnapshot),
      };
    }),
  createRealtimeSession: ({ title, engineMode = 'local-whisper-stream', language = 'zh-CN', sessionId }) => {
    const nextSessionId = sessionId ?? createId('rt');
    set((state) =>
      applyPatch(state, {
        activeMeetingTitle: title,
        session: {
          sessionId: nextSessionId,
          engineMode,
          language,
          startedAt: new Date().toISOString(),
          status: 'starting',
        },
        sessionCapabilities: null,
        transportStatus: 'connecting',
        transportMetrics: null,
        persistenceStatus: 'idle',
        transcript: createEmptyTranscriptModel(),
        elapsedMs: 0,
        nextChunkSeq: 0,
        lastError: null,
        lastWarning: null,
      }),
    );
    return nextSessionId;
  },
  setSessionStatus: (status) =>
    set((state) =>
      applyPatch(state, {
        session: state.session
          ? {
              ...state.session,
              status,
            }
          : null,
      }),
    ),
  setMicStatus: (status) =>
    set((state) =>
      applyPatch(state, {
        micStatus: status,
      }),
    ),
  setVoiceState: (voiceState) =>
    set((state) =>
      applyPatch(state, {
        voiceState,
      }),
    ),
  setTransportStatus: (status) =>
    set((state) =>
      applyPatch(state, {
        transportStatus: status,
      }),
    ),
  setPersistenceStatus: (status) =>
    set((state) =>
      applyPatch(state, {
        persistenceStatus: status,
      }),
    ),
  setPipelineError: (error) =>
    set((state) =>
      applyPatch(state, {
        lastError: error,
      }),
    ),
  setPipelineWarning: (warning) =>
    set((state) =>
      applyPatch(state, {
        lastWarning: warning,
      }),
    ),
  setSessionCapabilities: (capabilities) =>
    set((state) =>
      applyPatch(state, {
        sessionCapabilities: capabilities,
      }),
    ),
  setTransportMetrics: (metrics) =>
    set((state) =>
      applyPatch(state, {
        transportMetrics: metrics,
      }),
    ),
  applyAsrEvent: (event) =>
    set((state) =>
      applyPatch(state, {
        transcript: applyAsrEventToTranscript(state.transcript, event),
      }),
    ),
  replaceTranscript: (transcript) =>
    set((state) =>
      applyPatch(state, {
        transcript,
      }),
    ),
  advanceChunkSeq: (): number => {
    let currentSeq = 0;
    set((state) => {
      currentSeq = state.nextChunkSeq;
      return applyPatch(state, {
        nextChunkSeq: state.nextChunkSeq + 1,
      });
    });
    return currentSeq;
  },
  resetRealtimeState: () =>
    set((state) =>
      applyPatch(state, {
        session: null,
        sessionCapabilities: null,
        micStatus: 'unknown',
        voiceState: 'unknown',
        transportStatus: 'idle',
        transportMetrics: null,
        persistenceStatus: 'idle',
        transcript: createEmptyTranscriptModel(),
        elapsedMs: 0,
        nextChunkSeq: 0,
        lastError: null,
        lastWarning: null,
      }),
    ),
}));
