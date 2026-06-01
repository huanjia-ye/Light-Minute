import { useEffect, useMemo, useRef } from 'react';
import { useCreateMeetingMutation } from '../meetings/hooks';
import type { AppSettings, LiveTranscriptionRoutePolicy } from '../../types/settings';
import { finalTranscriptSegmentsToLegacySegments } from './realtimeTranscriptReducer';
import {
  getRecordingEngine,
  resolveFallbackRecordingEngineForSession,
  resolveRecordingEngineForSession,
  resolveSessionLanguage,
} from './recordingEngine';
import { useRecordingStore } from './store';
import type { RecordingEngine, RecordingEngineMode } from './engineTypes';
import type {
  PipelineError,
  RealtimeEngineMode,
  RealtimeSession,
} from './realtimeTypes';
import {
  isRealtimeSessionRejectedError,
  isRealtimeStartFallbackError,
  isRealtimeTransportStartError,
} from './realtimeStartError';

function mapRecordingEngineMode(mode: RecordingEngineMode): RealtimeEngineMode {
  switch (mode) {
    case 'browser-speech':
      return 'browser-speech-fallback';
    case 'local-whisper-chunk':
      return 'local-whisper-chunk';
    case 'local-whisper-live':
      return 'local-whisper-stream';
    case 'mock':
    default:
      return 'mock';
  }
}

function mapRecordingOrigin(mode: RecordingEngineMode) {
  switch (mode) {
    case 'local-whisper-chunk':
    case 'local-whisper-live':
      return 'local-whisper' as const;
    case 'browser-speech':
      return 'browser-speech' as const;
    case 'mock':
    default:
      return 'mock' as const;
  }
}

function mapRealtimeEngineModeToRecordingEngineMode(
  mode: RealtimeSession['engineMode'] | null | undefined,
): RecordingEngineMode | null {
  switch (mode) {
    case 'browser-speech-fallback':
      return 'browser-speech';
    case 'local-whisper-chunk':
      return 'local-whisper-chunk';
    case 'local-whisper-stream':
      return 'local-whisper-live';
    case 'mock':
      return 'mock';
    default:
      return null;
  }
}

export function getRecordingEngineLabel(mode: RecordingEngineMode, settings: AppSettings) {
  if (mode === 'local-whisper-live') {
    return 'Light-Minute realtime whisper';
  }

  if (mode === 'local-whisper-chunk') {
    return 'Light-Minute local whisper fallback';
  }

  if (mode === 'browser-speech') {
    return `live speech ${settings.liveTranscriptionLanguage === 'auto' ? '(auto)' : `(${settings.liveTranscriptionLanguage})`}`;
  }

  return 'demo mode';
}

export function getLiveTranscriptionRouteLabel(route: LiveTranscriptionRoutePolicy) {
  switch (route) {
    case 'realtime-only':
      return 'Realtime only';
    case 'fallback-only':
      return 'Fallback only';
    case 'prefer-realtime':
    default:
      return 'Prefer realtime';
  }
}

interface UseRecordingSessionControllerOptions {
  settings: AppSettings;
  meetingTitle: string;
  createMeetingTitle: () => string;
  onMeetingSaved: (meetingId: string) => void;
  onMeetingTitleReset?: (nextTitle: string) => void;
}

function createStartPipelineError(error: unknown): PipelineError {
  if (isRealtimeSessionRejectedError(error)) {
    return {
      source: 'transport',
      message: error.message,
      recoverable: error.recoverable,
    };
  }

  if (isRealtimeTransportStartError(error)) {
    return {
      source: 'transport',
      message: error.message,
      recoverable: error.recoverable,
    };
  }

  return {
    source: 'transport',
    message: error instanceof Error ? error.message : 'Recording could not be started.',
    recoverable: true,
  };
}

export function useRecordingSessionController({
  settings,
  meetingTitle,
  createMeetingTitle,
  onMeetingSaved,
  onMeetingTitleReset,
}: UseRecordingSessionControllerOptions) {
  const createMeetingMutation = useCreateMeetingMutation();
  const recording = useRecordingStore((state) => state);
  const previewEngine = useMemo(
    () =>
      getRecordingEngine(
        settings.transcriptionEndpoint,
        settings.liveTranscriptionLanguage,
        settings.liveTranscriptionRoute,
      ),
    [
      settings.liveTranscriptionLanguage,
      settings.liveTranscriptionRoute,
      settings.transcriptionEndpoint,
    ],
  );
  const activeEngineRef = useRef<RecordingEngine | null>(null);
  const startInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      const currentRecording = useRecordingStore.getState();
      const activeEngine = activeEngineRef.current;
      if (activeEngine && (currentRecording.status === 'recording' || currentRecording.status === 'paused')) {
        void activeEngine.stop().catch(() => {});
      }
    };
  }, []);

  const transcriptText = useMemo(() => {
    if (recording.transcript.displayText.trim()) {
      return recording.transcript.displayText;
    }

    return recording.segments.map((segment) => `[${segment.startTime}s] ${segment.text}`).join('\n');
  }, [recording.segments, recording.transcript.displayText]);

  const showHero =
    recording.segments.length === 0 &&
    !['recording', 'paused', 'finalizing', 'saving'].includes(recording.status);

  const displayEngineMode =
    mapRealtimeEngineModeToRecordingEngineMode(recording.session?.engineMode) ??
    activeEngineRef.current?.mode ??
    previewEngine.mode;

  const startRecordingWithEngine = async (
    selectedEngine: RecordingEngine,
    title: string,
    language: string,
  ) => {
    activeEngineRef.current = selectedEngine;
    const sessionId = recording.createRealtimeSession({
      title,
      engineMode: mapRecordingEngineMode(selectedEngine.mode),
      language,
    });
    recording.setMicStatus('requesting_permission');

    await selectedEngine.start({
      sessionId,
      language,
      micDevice: settings.micDevice,
      callbacks: {
        onSegment: (segment) => recording.appendSegment(segment),
        onAsrEvent: (event) => recording.applyAsrEvent(event),
        onTick: (elapsedSeconds) => recording.updateElapsed(elapsedSeconds),
        onMicStatus: (status) => recording.setMicStatus(status),
        onVoiceState: (voiceState) => recording.setVoiceState(voiceState),
        onTransportStatus: (status) => recording.setTransportStatus(status),
        onSessionCapabilities: (capabilities) => recording.setSessionCapabilities(capabilities),
        onTransportMetrics: (metrics) => recording.setTransportMetrics(metrics),
        onWarning: (warning) => recording.setPipelineWarning(warning),
        onError: (message) => {
          recording.setTransportStatus('error');
          recording.setPipelineError({
            source: 'transport',
            message,
            recoverable: true,
          });
          recording.setSessionStatus('error');
          void selectedEngine.stop().catch(() => {}).finally(() => {
            if (activeEngineRef.current === selectedEngine) {
              activeEngineRef.current = null;
            }
          });
        },
      },
    });

    recording.setSessionStatus('running');
    if (useRecordingStore.getState().transportStatus === 'connecting') {
      recording.setTransportStatus(selectedEngine.mode === 'local-whisper-live' ? 'open' : 'idle');
    }
  };

  const handleStart = async () => {
    if (startInFlightRef.current) {
      return;
    }

    startInFlightRef.current = true;
    const nextTitle = meetingTitle.trim() || createMeetingTitle();
    const language = resolveSessionLanguage(settings.liveTranscriptionLanguage);
    recording.setPipelineError(null);
    recording.setPipelineWarning(null);

    try {
      const selectedEngine = await resolveRecordingEngineForSession({
        transcriptionEndpoint: settings.transcriptionEndpoint,
        liveTranscriptionLanguage: settings.liveTranscriptionLanguage,
        liveTranscriptionRoute: settings.liveTranscriptionRoute,
        sessionLanguage: language,
      });
      onMeetingTitleReset?.(nextTitle);
      try {
        await startRecordingWithEngine(selectedEngine, nextTitle, language);
      } catch (error) {
        const fallbackEngine =
          selectedEngine.mode === 'local-whisper-live' && isRealtimeStartFallbackError(error)
            ? resolveFallbackRecordingEngineForSession({
                transcriptionEndpoint: settings.transcriptionEndpoint,
                liveTranscriptionLanguage: settings.liveTranscriptionLanguage,
                liveTranscriptionRoute: settings.liveTranscriptionRoute,
                sessionLanguage: language,
              })
            : null;

        if (fallbackEngine) {
          recording.resetSession();
          await startRecordingWithEngine(fallbackEngine, nextTitle, language);
          return;
        }

        throw error;
      }
    } catch (error) {
      activeEngineRef.current = null;
      recording.resetSession();
      recording.setPipelineError(createStartPipelineError(error));
    } finally {
      startInFlightRef.current = false;
    }
  };

  const handlePause = () => {
    void activeEngineRef.current?.pause();
    recording.setSessionStatus('paused');
  };

  const handleResume = () => {
    void activeEngineRef.current?.resume();
    recording.setSessionStatus('running');
  };

  const handleStop = async () => {
    const activeEngine = activeEngineRef.current;
    if (!activeEngine) {
      return;
    }

    const title = recording.activeMeetingTitle || meetingTitle || createMeetingTitle();

    try {
      recording.setSessionStatus('stopping');
      const snapshot = await activeEngine.stop();
      const elapsedSeconds = Math.max(recording.elapsedSeconds, snapshot.elapsedSeconds);
      const finalOnlySegments = finalTranscriptSegmentsToLegacySegments(recording.transcript.finalSegments);

      recording.setPersistenceStatus('persisting');
      const meeting = await createMeetingMutation.mutateAsync({
        title,
        source: 'recording',
        transcriptOrigin: mapRecordingOrigin(snapshot.mode),
        segments: finalOnlySegments,
        durationSeconds: elapsedSeconds,
      });

      recording.resetSession();
      const nextTitle = createMeetingTitle();
      onMeetingTitleReset?.(nextTitle);
      onMeetingSaved(meeting.id);
    } catch (error) {
      const persistenceStatus = useRecordingStore.getState().persistenceStatus;
      recording.setPersistenceStatus('error');
      if (persistenceStatus !== 'persisting') {
        recording.setTransportStatus('error');
      }
      recording.setPipelineError({
        source:
          persistenceStatus === 'persisting'
            ? 'persistence'
            : 'transport',
        message:
          error instanceof Error ? error.message : 'Recording could not be finalized.',
        recoverable: true,
      });
      recording.setSessionStatus('error');
    } finally {
      if (activeEngineRef.current === activeEngine) {
        activeEngineRef.current = null;
      }
    }
  };

  return {
    recording,
    recordingEngine: activeEngineRef.current ?? previewEngine,
    engineLabel: getRecordingEngineLabel(displayEngineMode, settings),
    routeLabel: getLiveTranscriptionRouteLabel(settings.liveTranscriptionRoute),
    transcriptText,
    showHero,
    handleStart,
    handlePause,
    handleResume,
    handleStop,
  };
}
