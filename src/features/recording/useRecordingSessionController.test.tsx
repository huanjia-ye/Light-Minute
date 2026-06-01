import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '../settings/store';
import { useRecordingStore } from './store';
import { useRecordingSessionController } from './useRecordingSessionController';
import {
  RealtimeSessionRejectedError,
  RealtimeTransportStartError,
} from './realtimeStartError';
import type { RecordingEngine, RecordingEngineMode } from './engineTypes';

const recordingEngineMocks = vi.hoisted(() => ({
  getRecordingEngine: vi.fn(),
  resolveRecordingEngineForSession: vi.fn(),
  resolveFallbackRecordingEngineForSession: vi.fn(),
  resolveSessionLanguage: vi.fn((language: string) => (language === 'auto' ? 'zh-CN' : language)),
}));

const meetingHooksMocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}));

vi.mock('./recordingEngine', () => ({
  getRecordingEngine: recordingEngineMocks.getRecordingEngine,
  resolveRecordingEngineForSession: recordingEngineMocks.resolveRecordingEngineForSession,
  resolveFallbackRecordingEngineForSession: recordingEngineMocks.resolveFallbackRecordingEngineForSession,
  resolveSessionLanguage: recordingEngineMocks.resolveSessionLanguage,
}));

vi.mock('../meetings/hooks', () => ({
  useCreateMeetingMutation: () => ({
    mutateAsync: meetingHooksMocks.mutateAsync,
  }),
}));

function createRecordingEngineMock(mode: RecordingEngineMode): RecordingEngine & {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  return {
    mode,
    isSupported: () => true,
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn().mockResolvedValue({
      elapsedSeconds: 0,
      emittedCount: 0,
      mode,
    }),
  };
}

function ControllerHarness({
  onMeetingSaved = vi.fn(),
}: {
  onMeetingSaved?: (meetingId: string) => void;
}) {
  const [meetingTitle, setMeetingTitle] = useState('Design sync');
  const controller = useRecordingSessionController({
    settings: {
      ...defaultSettings,
      liveTranscriptionLanguage: 'zh-CN',
      transcriptionEndpoint: 'http://127.0.0.1:8178',
    },
    meetingTitle,
    createMeetingTitle: () => 'Auto generated title',
    onMeetingSaved,
    onMeetingTitleReset: setMeetingTitle,
  });

  return (
    <div>
      <div data-testid="status">{controller.recording.status}</div>
      <div data-testid="engine-label">{controller.engineLabel}</div>
      <div data-testid="transcript">{controller.transcriptText}</div>
      <button type="button" onClick={() => void controller.handleStart()}>
        Start
      </button>
      <button type="button" onClick={() => void controller.handleStop()}>
        Stop
      </button>
    </div>
  );
}

describe('useRecordingSessionController', () => {
  beforeEach(() => {
    useRecordingStore.getState().resetSession();
    meetingHooksMocks.mutateAsync.mockReset();
    recordingEngineMocks.getRecordingEngine.mockReset();
    recordingEngineMocks.resolveRecordingEngineForSession.mockReset();
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReset();
    recordingEngineMocks.resolveSessionLanguage.mockReset();
    recordingEngineMocks.resolveSessionLanguage.mockImplementation((language: string) =>
      language === 'auto' ? 'zh-CN' : language,
    );
  });

  it('falls back to a real engine when realtime session start is rejected', async () => {
    const user = userEvent.setup();
    const previewEngine = createRecordingEngineMock('browser-speech');
    const realtimeEngine = createRecordingEngineMock('local-whisper-live');
    const fallbackEngine = createRecordingEngineMock('browser-speech');

    realtimeEngine.start.mockRejectedValueOnce(
      new RealtimeSessionRejectedError(
        {
          code: 'unsupported_language',
          message: 'language zh-CN is not supported',
          recoverable: true,
        },
        'zh-CN',
      ),
    );
    fallbackEngine.start.mockImplementation(async ({ callbacks }) => {
      callbacks.onMicStatus?.('ready');
      callbacks.onVoiceState?.('silence');
      callbacks.onTick(1);
    });

    recordingEngineMocks.getRecordingEngine.mockReturnValue(previewEngine);
    recordingEngineMocks.resolveRecordingEngineForSession.mockResolvedValue(realtimeEngine);
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReturnValue(fallbackEngine);

    render(<ControllerHarness />);

    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(fallbackEngine.start).toHaveBeenCalledTimes(1);
    });

    expect(realtimeEngine.start).toHaveBeenCalledTimes(1);
    expect(recordingEngineMocks.resolveFallbackRecordingEngineForSession).toHaveBeenCalledWith({
      transcriptionEndpoint: 'http://127.0.0.1:8178',
      liveTranscriptionLanguage: 'zh-CN',
      liveTranscriptionRoute: 'prefer-realtime',
      sessionLanguage: 'zh-CN',
    });
    expect(useRecordingStore.getState().status).toBe('recording');
    expect(useRecordingStore.getState().session?.engineMode).toBe('browser-speech-fallback');
    expect(useRecordingStore.getState().lastError).toBeNull();
    expect(screen.getByTestId('engine-label')).toHaveTextContent('live speech (zh-CN)');
  });

  it('falls back to a real engine when realtime transport startup fails', async () => {
    const user = userEvent.setup();
    const previewEngine = createRecordingEngineMock('browser-speech');
    const realtimeEngine = createRecordingEngineMock('local-whisper-live');
    const fallbackEngine = createRecordingEngineMock('browser-speech');

    realtimeEngine.start.mockRejectedValueOnce(
      new RealtimeTransportStartError('Realtime transport connection timed out.'),
    );
    fallbackEngine.start.mockImplementation(async ({ callbacks }) => {
      callbacks.onMicStatus?.('ready');
      callbacks.onVoiceState?.('silence');
    });

    recordingEngineMocks.getRecordingEngine.mockReturnValue(previewEngine);
    recordingEngineMocks.resolveRecordingEngineForSession.mockResolvedValue(realtimeEngine);
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReturnValue(fallbackEngine);

    render(<ControllerHarness />);

    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(fallbackEngine.start).toHaveBeenCalledTimes(1);
    });

    expect(realtimeEngine.start).toHaveBeenCalledTimes(1);
    expect(useRecordingStore.getState().status).toBe('recording');
    expect(useRecordingStore.getState().lastError).toBeNull();
  });

  it('does not auto-fallback when realtime-only mode is enabled', async () => {
    const user = userEvent.setup();
    const previewEngine = createRecordingEngineMock('local-whisper-live');

    function RealtimeOnlyHarness() {
      const [meetingTitle, setMeetingTitle] = useState('Design sync');
      const controller = useRecordingSessionController({
        settings: {
          ...defaultSettings,
          liveTranscriptionLanguage: 'zh-CN',
          liveTranscriptionRoute: 'realtime-only',
          transcriptionEndpoint: 'http://127.0.0.1:8178',
        },
        meetingTitle,
        createMeetingTitle: () => 'Auto generated title',
        onMeetingSaved: vi.fn(),
        onMeetingTitleReset: setMeetingTitle,
      });

      return (
        <button type="button" onClick={() => void controller.handleStart()}>
          Start realtime only
        </button>
      );
    }

    recordingEngineMocks.getRecordingEngine.mockReturnValue(previewEngine);
    recordingEngineMocks.resolveRecordingEngineForSession.mockRejectedValue(
      new Error('Realtime-only mode is enabled, but local realtime whisper is unavailable for zh-CN.'),
    );
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReturnValue(null);

    render(<RealtimeOnlyHarness />);

    await user.click(screen.getByRole('button', { name: 'Start realtime only' }));

    await waitFor(() => {
      expect(useRecordingStore.getState().status).toBe('error');
    });

    expect(recordingEngineMocks.resolveFallbackRecordingEngineForSession).not.toHaveBeenCalled();
    expect(useRecordingStore.getState().lastError?.message).toContain('Realtime-only mode is enabled');
  });

  it('persists final transcript segments on stop and resets the session', async () => {
    const user = userEvent.setup();
    const onMeetingSaved = vi.fn();
    const previewEngine = createRecordingEngineMock('browser-speech');
    const selectedEngine = createRecordingEngineMock('browser-speech');

    selectedEngine.start.mockImplementation(async ({ sessionId, callbacks }) => {
      callbacks.onMicStatus?.('ready');
      callbacks.onVoiceState?.('speech');
      callbacks.onTick(3);
      callbacks.onAsrEvent?.({
        type: 'final',
        sessionId,
        groupId: 'grp-1',
        utteranceId: 'utt-1',
        revision: 1,
        startMs: 0,
        endMs: 2400,
        text: 'hello world',
      });
    });
    selectedEngine.stop.mockResolvedValue({
      elapsedSeconds: 5,
      emittedCount: 1,
      mode: 'browser-speech',
    });
    meetingHooksMocks.mutateAsync.mockResolvedValue({
      id: 'meeting-123',
    });

    recordingEngineMocks.getRecordingEngine.mockReturnValue(previewEngine);
    recordingEngineMocks.resolveRecordingEngineForSession.mockResolvedValue(selectedEngine);
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReturnValue(null);

    render(<ControllerHarness onMeetingSaved={onMeetingSaved} />);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => {
      expect(useRecordingStore.getState().status).toBe('recording');
    });

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() => {
      expect(meetingHooksMocks.mutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(meetingHooksMocks.mutateAsync).toHaveBeenCalledWith({
      title: 'Design sync',
      source: 'recording',
      transcriptOrigin: 'browser-speech',
      segments: [
        {
          id: expect.any(String),
          startTime: 0,
          endTime: 2,
          text: 'hello world',
          confidence: 0.9,
        },
      ],
      durationSeconds: 5,
    });
    expect(onMeetingSaved).toHaveBeenCalledWith('meeting-123');
    expect(useRecordingStore.getState().status).toBe('idle');
    expect(useRecordingStore.getState().transcript.finalSegments).toEqual([]);
  });

  it('does not persist active partial previews when no final arrives before stop', async () => {
    const user = userEvent.setup();
    const previewEngine = createRecordingEngineMock('local-whisper-live');
    const selectedEngine = createRecordingEngineMock('local-whisper-live');

    selectedEngine.start.mockImplementation(async ({ sessionId, callbacks }) => {
      callbacks.onMicStatus?.('ready');
      callbacks.onVoiceState?.('speech');
      callbacks.onAsrEvent?.({
        type: 'partial',
        sessionId,
        groupId: 'grp-preview',
        utteranceId: 'grp-preview',
        revision: 1,
        startMs: 0,
        endMs: 1200,
        text: 'preview only',
      });
    });
    selectedEngine.stop.mockResolvedValue({
      elapsedSeconds: 4,
      emittedCount: 0,
      mode: 'local-whisper-live',
    });
    meetingHooksMocks.mutateAsync.mockResolvedValue({
      id: 'meeting-preview-only',
    });

    recordingEngineMocks.getRecordingEngine.mockReturnValue(previewEngine);
    recordingEngineMocks.resolveRecordingEngineForSession.mockResolvedValue(selectedEngine);
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReturnValue(null);

    render(<ControllerHarness />);

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => {
      expect(useRecordingStore.getState().status).toBe('recording');
    });

    expect(screen.getByTestId('transcript')).toHaveTextContent('preview only');

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() => {
      expect(meetingHooksMocks.mutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(meetingHooksMocks.mutateAsync).toHaveBeenCalledWith({
      title: 'Design sync',
      source: 'recording',
      transcriptOrigin: 'local-whisper',
      segments: [],
      durationSeconds: 4,
    });
  });

  it('keeps non-fatal realtime warnings in warning state instead of switching to error', async () => {
    const user = userEvent.setup();
    const previewEngine = createRecordingEngineMock('local-whisper-live');
    const selectedEngine = createRecordingEngineMock('local-whisper-live');

    selectedEngine.start.mockImplementation(async ({ callbacks }) => {
      callbacks.onMicStatus?.('ready');
      callbacks.onVoiceState?.('speech');
      callbacks.onSessionCapabilities?.({
        supportsPartials: true,
        supportsFinals: true,
        acceptedLanguage: 'en-US',
      });
      callbacks.onTransportMetrics?.({
        lastAcceptedSeq: 7,
        queueDepth: 1,
        bufferedMs: 400,
        lastPartialAudioMs: 800,
        lastPartialInferenceMs: 160,
        lastPartialEmitLatencyMs: 120,
        stalePartialDropCount: 0,
        lastFinalizeReason: null,
        lastFinalAudioMs: null,
        lastFinalInferenceMs: null,
        lastFinalEmitLatencyMs: null,
      });
      callbacks.onWarning?.({
        source: 'asr',
        message: 'Partial preview is temporarily unavailable. Final transcription will continue.',
        recoverable: true,
      });
      callbacks.onAsrEvent?.({
        type: 'partial',
        sessionId: 'rt-warning',
        groupId: 'grp-warning',
        utteranceId: 'grp-warning',
        revision: 1,
        startMs: 0,
        endMs: 800,
        text: 'preview still visible',
      });
    });

    recordingEngineMocks.getRecordingEngine.mockReturnValue(previewEngine);
    recordingEngineMocks.resolveRecordingEngineForSession.mockResolvedValue(selectedEngine);
    recordingEngineMocks.resolveFallbackRecordingEngineForSession.mockReturnValue(null);

    render(<ControllerHarness />);

    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(useRecordingStore.getState().status).toBe('recording');
    });

    expect(useRecordingStore.getState().lastError).toBeNull();
    expect(useRecordingStore.getState().lastWarning).toEqual({
      source: 'asr',
      message: 'Partial preview is temporarily unavailable. Final transcription will continue.',
      recoverable: true,
    });
    expect(useRecordingStore.getState().sessionCapabilities).toEqual({
      supportsPartials: true,
      supportsFinals: true,
      acceptedLanguage: 'en-US',
    });
    expect(useRecordingStore.getState().transportMetrics).toEqual({
      lastAcceptedSeq: 7,
      queueDepth: 1,
      bufferedMs: 400,
      lastPartialAudioMs: 800,
      lastPartialInferenceMs: 160,
      lastPartialEmitLatencyMs: 120,
      stalePartialDropCount: 0,
      lastFinalizeReason: null,
      lastFinalAudioMs: null,
      lastFinalInferenceMs: null,
      lastFinalEmitLatencyMs: null,
    });
    expect(screen.getByTestId('transcript')).toHaveTextContent('preview still visible');
  });
});
