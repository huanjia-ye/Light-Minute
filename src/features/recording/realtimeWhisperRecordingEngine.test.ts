import type { RealtimeIncomingMessage, RealtimeOutgoingMessage } from './realtimeProtocol';
import {
  RealtimeWhisperRecordingEngine,
  resolveRealtimeDrainTimeoutMs,
} from './realtimeWhisperRecordingEngine';
import type { RealtimeCaptureChunk, RealtimeCaptureStartOptions } from './realtimeCapture';
import {
  RealtimeSessionRejectedError,
  RealtimeTransportStartError,
} from './realtimeStartError';

class FakeTransport {
  sentMessages: RealtimeOutgoingMessage[] = [];
  private readonly handlers: {
    onOpen: () => void;
    onClose: (event: CloseEvent) => void;
    onMessage: (message: RealtimeIncomingMessage) => void;
    onError: () => void;
  };

  constructor(handlers: {
    onOpen: () => void;
    onClose: (event: CloseEvent) => void;
    onMessage: (message: RealtimeIncomingMessage) => void;
    onError: () => void;
  }) {
    this.handlers = handlers;
  }

  async connect() {
    this.handlers.onOpen();
  }

  send(message: RealtimeOutgoingMessage) {
    this.sentMessages.push(message);
  }

  close() {}

  deliver(message: RealtimeIncomingMessage) {
    this.handlers.onMessage(message);
  }

  fail() {
    this.handlers.onError();
  }

  closeUnexpectedly() {
    this.handlers.onClose(new CloseEvent('close'));
  }
}

class FakeCapture {
  startedOptions: RealtimeCaptureStartOptions | null = null;
  resumed = false;
  disposed = false;
  pauseChunk: RealtimeCaptureChunk;
  stopChunk: RealtimeCaptureChunk;

  constructor() {
    this.pauseChunk = {
      chunk: {
        sessionId: 'rt-test',
        seq: 0,
        startMs: 0,
        endMs: 120,
        hasSpeech: true,
        isLast: false,
      },
      pcmBytes: new Uint8Array([1, 2]),
      payloadBase64: 'AQI=',
    };
    this.stopChunk = {
      chunk: {
        sessionId: 'rt-test',
        seq: 1,
        startMs: 120,
        endMs: 180,
        hasSpeech: true,
        isLast: true,
      },
      pcmBytes: new Uint8Array([3, 4]),
      payloadBase64: 'AwQ=',
    };
  }

  async start(options: RealtimeCaptureStartOptions) {
    this.startedOptions = options;
  }

  pause() {
    this.startedOptions?.onChunk?.(this.pauseChunk);
    return [this.pauseChunk];
  }

  resume() {
    this.resumed = true;
  }

  async stop() {
    this.startedOptions?.onChunk?.(this.stopChunk);
    return [this.stopChunk];
  }

  async dispose() {
    this.disposed = true;
  }
}

describe('RealtimeWhisperRecordingEngine', () => {
  it('extends drain timeout when transport metrics show queued buffered audio', () => {
    expect(
      resolveRealtimeDrainTimeoutMs({
        lastAcceptedSeq: 168,
        queueDepth: 2,
        bufferedMs: 1400,
        lastPartialAudioMs: null,
        lastPartialInferenceMs: null,
        lastPartialEmitLatencyMs: null,
        stalePartialDropCount: 0,
        lastFinalizeReason: null,
        lastFinalAudioMs: null,
        lastFinalInferenceMs: null,
        lastFinalEmitLatencyMs: null,
      }),
    ).toBe(9800);
  });

  it('waits for session.started before starting capture', async () => {
    let fakeTransport: FakeTransport | null = null;
    const fakeCapture = new FakeCapture();
    const onTransportStatus = vi.fn();

    const engine = new RealtimeWhisperRecordingEngine({
      transportFactory: (handlers) => {
        fakeTransport = new FakeTransport(handlers);
        return fakeTransport;
      },
      captureFactory: () => fakeCapture,
    });

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    const startPromise = engine.start({
      sessionId: 'rt-1',
      language: 'zh-CN',
      callbacks: {
        onTick: vi.fn(),
        onTransportStatus,
      },
    });
    await Promise.resolve();

    expect(fakeTransport?.sentMessages).toHaveLength(1);
    expect(fakeTransport?.sentMessages[0].type).toBe('session.start');
    expect(fakeCapture.startedOptions).toBeNull();

    fakeTransport?.deliver({
      type: 'session.started',
      sessionId: 'rt-1',
      transportStatus: 'open',
      capabilities: {
        supportsPartials: true,
        supportsFinals: true,
        acceptedLanguage: 'zh-CN',
      },
    });

    await startPromise;

    expect(fakeCapture.startedOptions?.sessionId).toBe('rt-1');
    expect(onTransportStatus).toHaveBeenCalledWith('connecting');
    expect(onTransportStatus).toHaveBeenCalledWith('open');
  });

  it('flushes pause and stop chunks before sending control messages', async () => {
    let fakeTransport: FakeTransport | null = null;
    const fakeCapture = new FakeCapture();

    const engine = new RealtimeWhisperRecordingEngine({
      transportFactory: (handlers) => {
        fakeTransport = new FakeTransport(handlers);
        return fakeTransport;
      },
      captureFactory: () => fakeCapture,
    });

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    const startPromise = engine.start({
      sessionId: 'rt-test',
      language: 'en-US',
      callbacks: {
        onTick: vi.fn(),
        onTransportStatus: vi.fn(),
      },
    });
    await Promise.resolve();

    fakeTransport?.deliver({
      type: 'session.started',
      sessionId: 'rt-test',
      transportStatus: 'open',
      capabilities: {
        supportsPartials: true,
        supportsFinals: true,
        acceptedLanguage: 'en-US',
      },
    });
    await startPromise;

    engine.pause();
    expect(fakeTransport?.sentMessages.slice(-2).map((message) => message.type)).toEqual([
      'audio.chunk',
      'session.pause',
    ]);

    engine.resume();
    expect(fakeCapture.resumed).toBe(true);
    expect(fakeTransport?.sentMessages.at(-1)?.type).toBe('session.resume');

    const stopPromise = engine.stop();
    await Promise.resolve();
    expect(fakeTransport?.sentMessages.slice(-2).map((message) => message.type)).toEqual([
      'audio.chunk',
      'session.stop',
    ]);

    const penultimateMessage = fakeTransport?.sentMessages.at(-2);
    expect(penultimateMessage?.type).toBe('audio.chunk');
    if (penultimateMessage?.type === 'audio.chunk') {
      expect(penultimateMessage.chunk.isLast).toBe(true);
    }

    fakeTransport?.deliver({
      type: 'asr.event',
      event: {
        type: 'end',
        sessionId: 'rt-test',
        groupId: 'end:rt-test',
        utteranceId: 'end:rt-test',
        revision: 0,
        startMs: 180,
        endMs: 180,
        text: '',
      },
    });

    const snapshot = await stopPromise;
    expect(snapshot.mode).toBe('local-whisper-live');
    expect(fakeCapture.disposed).toBe(true);
  });

  it('raises a typed rejection error when the adapter rejects session.start', async () => {
    let fakeTransport: FakeTransport | null = null;

    const engine = new RealtimeWhisperRecordingEngine({
      transportFactory: (handlers) => {
        fakeTransport = new FakeTransport(handlers);
        return fakeTransport;
      },
      captureFactory: () => new FakeCapture(),
    });

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    const startPromise = engine.start({
      sessionId: 'rt-reject',
      language: 'zh-CN',
      callbacks: {
        onTick: vi.fn(),
        onTransportStatus: vi.fn(),
      },
    });
    await Promise.resolve();

    fakeTransport?.deliver({
      type: 'session.rejected',
      sessionId: 'rt-reject',
      transportStatus: 'open',
      reason: {
        code: 'unsupported_language',
        message: 'language zh-CN is not supported',
        recoverable: true,
      },
    });

    await expect(startPromise).rejects.toBeInstanceOf(RealtimeSessionRejectedError);
    await expect(startPromise).rejects.toMatchObject({
      code: 'unsupported_language',
      language: 'zh-CN',
      recoverable: true,
    });
  });

  it('raises a typed transport start error when the socket closes before session.started', async () => {
    let fakeTransport: FakeTransport | null = null;

    const engine = new RealtimeWhisperRecordingEngine({
      transportFactory: (handlers) => {
        fakeTransport = new FakeTransport(handlers);
        return fakeTransport;
      },
      captureFactory: () => new FakeCapture(),
    });

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    const startPromise = engine.start({
      sessionId: 'rt-close',
      language: 'en-US',
      callbacks: {
        onTick: vi.fn(),
        onTransportStatus: vi.fn(),
      },
    });
    await Promise.resolve();

    fakeTransport?.closeUnexpectedly();

    await expect(startPromise).rejects.toBeInstanceOf(RealtimeTransportStartError);
    await expect(startPromise).rejects.toMatchObject({
      message: 'Realtime transport closed before the session started.',
      recoverable: true,
    });
  });

  it('forwards realtime events without creating legacy segments', async () => {
    let fakeTransport: FakeTransport | null = null;
    const fakeCapture = new FakeCapture();
    const onAsrEvent = vi.fn();
    const onSegment = vi.fn();
    const onSessionCapabilities = vi.fn();
    const onTransportMetrics = vi.fn();
    const onWarning = vi.fn();

    const engine = new RealtimeWhisperRecordingEngine({
      transportFactory: (handlers) => {
        fakeTransport = new FakeTransport(handlers);
        return fakeTransport;
      },
      captureFactory: () => fakeCapture,
    });

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    const startPromise = engine.start({
      sessionId: 'rt-partial',
      language: 'en-US',
      callbacks: {
        onTick: vi.fn(),
        onTransportStatus: vi.fn(),
        onAsrEvent,
        onSegment,
        onSessionCapabilities,
        onTransportMetrics,
        onWarning,
      },
    });
    await Promise.resolve();

    fakeTransport?.deliver({
      type: 'session.started',
      sessionId: 'rt-partial',
      transportStatus: 'open',
      capabilities: {
        supportsPartials: true,
        supportsFinals: true,
        acceptedLanguage: 'en-US',
      },
    });
    await startPromise;

    expect(onSessionCapabilities).toHaveBeenCalledWith({
      supportsPartials: true,
      supportsFinals: true,
      acceptedLanguage: 'en-US',
    });

    fakeTransport?.deliver({
      type: 'transport.metrics',
      sessionId: 'rt-partial',
      lastAcceptedSeq: 12,
      queueDepth: 1,
      bufferedMs: 400,
      lastPartialAudioMs: 2000,
      lastPartialInferenceMs: 4100,
      lastPartialEmitLatencyMs: 2500,
      stalePartialDropCount: 3,
      lastFinalizeReason: 'force',
      lastFinalAudioMs: 5000,
      lastFinalInferenceMs: 8600,
      lastFinalEmitLatencyMs: 3600,
    });

    expect(onTransportMetrics).toHaveBeenCalledWith({
      lastAcceptedSeq: 12,
      queueDepth: 1,
      bufferedMs: 400,
      lastPartialAudioMs: 2000,
      lastPartialInferenceMs: 4100,
      lastPartialEmitLatencyMs: 2500,
      stalePartialDropCount: 3,
      lastFinalizeReason: 'force',
      lastFinalAudioMs: 5000,
      lastFinalInferenceMs: 8600,
      lastFinalEmitLatencyMs: 3600,
    });

    fakeTransport?.deliver({
      type: 'asr.event',
      event: {
        type: 'partial',
        sessionId: 'rt-partial',
        groupId: 'grp-1',
        utteranceId: 'grp-1',
        revision: 2,
        startMs: 0,
        endMs: 900,
        text: 'partial preview',
      },
    });

    expect(onAsrEvent).toHaveBeenCalledWith({
      type: 'partial',
      sessionId: 'rt-partial',
      groupId: 'grp-1',
      utteranceId: 'grp-1',
      revision: 2,
      startMs: 0,
      endMs: 900,
      text: 'partial preview',
    });
    expect(onSegment).not.toHaveBeenCalled();

    fakeTransport?.deliver({
      type: 'asr.event',
      event: {
        type: 'final',
        sessionId: 'rt-partial',
        groupId: 'grp-1',
        utteranceId: 'utt-1',
        revision: 1,
        startMs: 0,
        endMs: 900,
        text: 'frozen final',
      },
    });

    expect(onAsrEvent).toHaveBeenCalledWith({
      type: 'final',
      sessionId: 'rt-partial',
      groupId: 'grp-1',
      utteranceId: 'utt-1',
      revision: 1,
      startMs: 0,
      endMs: 900,
      text: 'frozen final',
    });
    expect(onSegment).not.toHaveBeenCalled();

    fakeTransport?.deliver({
      type: 'asr.event',
      event: {
        type: 'error',
        sessionId: 'rt-partial',
        groupId: 'grp-1',
        utteranceId: 'warning:rt-partial:grp-1',
        revision: 0,
        startMs: 0,
        endMs: 900,
        text: '',
        error: {
          source: 'asr',
          message: 'Partial preview is temporarily unavailable. Final transcription will continue.',
          recoverable: true,
        },
      },
    });

    expect(onWarning).toHaveBeenCalledWith({
      source: 'asr',
      message: 'Partial preview is temporarily unavailable. Final transcription will continue.',
      recoverable: true,
    });

    const stopPromise = engine.stop();
    await Promise.resolve();
    fakeTransport?.deliver({
      type: 'asr.event',
      event: {
        type: 'end',
        sessionId: 'rt-partial',
        groupId: 'end:rt-partial',
        utteranceId: 'end:rt-partial',
        revision: 0,
        startMs: 180,
        endMs: 180,
        text: '',
      },
    });
    await stopPromise;
  });
});
