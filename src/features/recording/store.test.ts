import { useRecordingStore } from './store';

describe('recording store', () => {
  beforeEach(() => {
    useRecordingStore.getState().resetSession();
  });

  it('allows nullable runtime fields to be explicitly cleared', () => {
    useRecordingStore.getState().createRealtimeSession({
      title: 'Runtime check',
      sessionId: 'rt-clear',
      language: 'en-US',
    });
    useRecordingStore.getState().setSessionCapabilities({
      supportsPartials: true,
      supportsFinals: true,
      acceptedLanguage: 'en-US',
    });
    useRecordingStore.getState().setTransportMetrics({
      lastAcceptedSeq: 4,
      queueDepth: 1,
      bufferedMs: 200,
      lastPartialAudioMs: 800,
      lastPartialInferenceMs: 120,
      lastPartialEmitLatencyMs: 90,
      stalePartialDropCount: 1,
      lastFinalizeReason: 'silence',
      lastFinalAudioMs: 1000,
      lastFinalInferenceMs: 240,
      lastFinalEmitLatencyMs: 180,
    });
    useRecordingStore.getState().setPipelineError({
      source: 'transport',
      message: 'connect failed',
      recoverable: true,
    });
    useRecordingStore.getState().setPipelineWarning({
      source: 'asr',
      message: 'preview unavailable',
      recoverable: true,
    });

    useRecordingStore.getState().setPipelineError(null);
    useRecordingStore.getState().setPipelineWarning(null);
    useRecordingStore.getState().setSessionCapabilities(null);
    useRecordingStore.getState().setTransportMetrics(null);
    useRecordingStore.getState().setSessionStatus('running');

    const state = useRecordingStore.getState();
    expect(state.lastError).toBeNull();
    expect(state.lastWarning).toBeNull();
    expect(state.errorMessage).toBe('');
    expect(state.sessionCapabilities).toBeNull();
    expect(state.transportMetrics).toBeNull();
    expect(state.status).toBe('recording');
  });
});
