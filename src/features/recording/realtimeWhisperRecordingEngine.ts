import { REALTIME_DEFAULT_TRANSPORT } from './realtimeConstants';
import type {
  RecordingEngine,
  RecordingEngineCallbacks,
  RecordingEngineSnapshot,
  RecordingEngineStartOptions,
} from './engineTypes';
import {
  createAudioChunkMessage,
  createSessionStartMessage,
  type RealtimeOutgoingMessage,
  type RealtimeIncomingMessage,
  type SessionRejectedMessage,
} from './realtimeProtocol';
import {
  RealtimeCapture,
  type RealtimeCaptureChunk,
  type RealtimeCaptureStartOptions,
} from './realtimeCapture';
import { RealtimeTransportClient } from './realtimeTransportClient';
import {
  RealtimeSessionRejectedError,
  RealtimeTransportStartError,
} from './realtimeStartError';
import type { TransportMetricsSnapshot } from './realtimeTypes';

interface RealtimeTransportAdapter {
  connect: () => Promise<void>;
  send: (message: RealtimeOutgoingMessage) => void;
  close: (code?: number, reason?: string) => void;
}

interface RealtimeCaptureAdapter {
  start: (options: RealtimeCaptureStartOptions) => Promise<void>;
  pause: () => RealtimeCaptureChunk[];
  resume: () => void;
  stop: () => Promise<RealtimeCaptureChunk[]>;
  dispose: () => Promise<void>;
}

interface RealtimeWhisperRecordingEngineOptions {
  transportFactory?: (handlers: {
    onOpen: () => void;
    onClose: (event: CloseEvent) => void;
    onMessage: (message: RealtimeIncomingMessage) => void;
    onError: () => void;
  }) => RealtimeTransportAdapter;
  captureFactory?: () => RealtimeCaptureAdapter;
  drainTimeoutMs?: number;
}

type EngineState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';

const MAX_DYNAMIC_DRAIN_TIMEOUT_MS = 20000;

function canUseRealtimeWebSocket() {
  return typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined';
}

export function resolveRealtimeDrainTimeoutMs(
  metrics: TransportMetricsSnapshot | null | undefined,
  baseTimeoutMs: number = REALTIME_DEFAULT_TRANSPORT.drainTimeoutMs,
) {
  if (!metrics) {
    return baseTimeoutMs;
  }

  const bufferedMs = Math.max(0, metrics.bufferedMs);
  const queueDepth = Math.max(0, metrics.queueDepth);
  const dynamicTimeoutMs = baseTimeoutMs + bufferedMs * 2 + queueDepth * 2000;

  return Math.min(MAX_DYNAMIC_DRAIN_TIMEOUT_MS, Math.max(baseTimeoutMs, dynamicTimeoutMs));
}

export class RealtimeWhisperRecordingEngine implements RecordingEngine {
  readonly mode = 'local-whisper-live' as const;

  private readonly options: RealtimeWhisperRecordingEngineOptions;
  private state: EngineState = 'idle';
  private callbacks: RecordingEngineCallbacks | null = null;
  private sessionId = '';
  private language = 'zh-CN';
  private elapsedSeconds = 0;
  private emittedCount = 0;
  private tickTimer: number | null = null;
  private transport: RealtimeTransportAdapter | null = null;
  private capture: RealtimeCaptureAdapter | null = null;
  private latestTransportMetrics: TransportMetricsSnapshot | null = null;
  private startDeferred:
    | {
        promise: Promise<void>;
        resolve: () => void;
        reject: (error: Error) => void;
      }
    | null = null;
  private endDeferred:
    | {
        promise: Promise<void>;
        resolve: () => void;
        reject: (error: Error) => void;
      }
    | null = null;

  constructor(options: RealtimeWhisperRecordingEngineOptions = {}) {
    this.options = options;
  }

  isSupported() {
    return (
      canUseRealtimeWebSocket() &&
      typeof window !== 'undefined' &&
      typeof window.AudioContext !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }

  async start(options: RecordingEngineStartOptions) {
    if (!this.isSupported()) {
      throw new Error('Realtime whisper streaming is not supported in this browser.');
    }

    if (this.state !== 'idle') {
      throw new Error('Realtime whisper streaming is already active.');
    }

    this.reset();
    this.state = 'starting';
    this.callbacks = options.callbacks;
    this.sessionId = options.sessionId;
    this.language = options.language;
    this.transport = this.createTransport();
    this.capture = this.createCapture();
    const endDeferred = this.createDeferred();
    const startDeferred = this.createDeferred();
    this.endDeferred = endDeferred;
    this.startDeferred = startDeferred;

    try {
      this.callbacks.onTransportStatus?.('connecting');
      await this.transport.connect();
      this.transport.send(
        createSessionStartMessage({
          sessionId: this.sessionId,
          language: this.language,
          engineMode: 'local-whisper-stream',
        }),
      );
      await startDeferred.promise;

      if (!this.capture) {
        throw new Error('Realtime capture is not available.');
      }

      await this.capture.start({
        sessionId: this.sessionId,
        micDevice: options.micDevice,
        onChunk: (chunk) => this.handleCaptureChunk(chunk),
        onMicStatus: (status) => this.callbacks?.onMicStatus?.(status),
        onVoiceState: (voiceState) => this.callbacks?.onVoiceState?.(voiceState),
        onError: (error) => this.handleRuntimeError(error),
      });

      this.state = 'recording';
      this.startTicking();
    } catch (error) {
      await this.abortCurrentSession();
      throw error instanceof Error
        ? error
        : new Error('Realtime whisper streaming could not be started.');
    }
  }

  pause() {
    if (this.state !== 'recording' || !this.capture || !this.transport) {
      return;
    }

    this.capture.pause();
    this.transport.send({
      type: 'session.pause',
      sessionId: this.sessionId,
    });
    this.state = 'paused';
    this.clearTickTimer();
  }

  resume() {
    if (this.state !== 'paused' || !this.capture || !this.transport) {
      return;
    }

    this.transport.send({
      type: 'session.resume',
      sessionId: this.sessionId,
    });
    this.capture.resume();
    this.state = 'recording';
    this.startTicking();
  }

  async stop(): Promise<RecordingEngineSnapshot> {
    const snapshot = {
      elapsedSeconds: this.elapsedSeconds,
      emittedCount: this.emittedCount,
      mode: this.mode,
    } satisfies RecordingEngineSnapshot;

    if (this.state === 'idle') {
      return snapshot;
    }

    this.state = 'stopping';
    this.clearTickTimer();
    const endDeferred = this.endDeferred ?? this.createDeferred();
    this.endDeferred = endDeferred;

    try {
      const capture = this.capture;
      if (capture) {
        await capture.stop();
      }

      this.callbacks?.onTransportStatus?.('draining');
      this.transport?.send({
        type: 'session.stop',
        sessionId: this.sessionId,
      });

      await Promise.race([
        endDeferred.promise,
        new Promise<void>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('Realtime whisper streaming drain timed out.'));
          }, resolveRealtimeDrainTimeoutMs(
            this.latestTransportMetrics,
            this.options.drainTimeoutMs ?? REALTIME_DEFAULT_TRANSPORT.drainTimeoutMs,
          ));
        }),
      ]);
    } finally {
      await this.disposeResources();
    }

    return snapshot;
  }

  private createTransport() {
    if (this.options.transportFactory) {
      return this.options.transportFactory({
        onOpen: () => {},
        onClose: (event) => this.handleTransportClose(event),
        onMessage: (message) => this.handleIncomingMessage(message),
        onError: () => this.handleRuntimeError(new Error('Realtime transport encountered an unexpected error.')),
      });
    }

    return new RealtimeTransportClient(
      {
        onClose: (event) => this.handleTransportClose(event),
        onMessage: (message) => this.handleIncomingMessage(message),
        onError: () => this.handleRuntimeError(new Error('Realtime transport encountered an unexpected error.')),
      },
      {},
    );
  }

  private createCapture() {
    if (this.options.captureFactory) {
      return this.options.captureFactory();
    }

    return new RealtimeCapture();
  }

  private handleCaptureChunk(chunk: RealtimeCaptureChunk) {
    this.transport?.send(
      createAudioChunkMessage({
        sessionId: this.sessionId,
        chunk: chunk.chunk,
        payloadBase64: chunk.payloadBase64,
      }),
    );
  }

  private handleIncomingMessage(message: RealtimeIncomingMessage) {
    switch (message.type) {
      case 'session.started': {
        this.callbacks?.onTransportStatus?.('open');
        this.callbacks?.onSessionCapabilities?.(message.capabilities);
        this.startDeferred?.resolve();
        this.startDeferred = null;
        return;
      }
      case 'session.rejected': {
        this.handleSessionRejected(message);
        return;
      }
      case 'transport.state': {
        this.callbacks?.onTransportStatus?.(message.status);
        return;
      }
      case 'transport.metrics': {
        this.latestTransportMetrics = {
          lastAcceptedSeq: message.lastAcceptedSeq,
          queueDepth: message.queueDepth,
          bufferedMs: message.bufferedMs,
          lastPartialAudioMs: message.lastPartialAudioMs,
          lastPartialInferenceMs: message.lastPartialInferenceMs,
          lastPartialEmitLatencyMs: message.lastPartialEmitLatencyMs,
          stalePartialDropCount: message.stalePartialDropCount,
          lastFinalizeReason: message.lastFinalizeReason,
          lastFinalAudioMs: message.lastFinalAudioMs,
          lastFinalInferenceMs: message.lastFinalInferenceMs,
          lastFinalEmitLatencyMs: message.lastFinalEmitLatencyMs,
        };
        this.callbacks?.onTransportMetrics?.(this.latestTransportMetrics);
        return;
      }
      case 'asr.event': {
        this.callbacks?.onAsrEvent?.(message.event);
        if (message.event.type === 'error' && message.event.error) {
          this.callbacks?.onWarning?.(message.event.error);
        }
        if (message.event.type === 'final') {
          this.emittedCount += 1;
        }

        if (message.event.type === 'end') {
          this.endDeferred?.resolve();
        }
        return;
      }
      case 'pong':
      default:
        return;
    }
  }

  private handleSessionRejected(message: SessionRejectedMessage) {
    this.callbacks?.onTransportStatus?.(message.transportStatus);
    const rejectionError = new RealtimeSessionRejectedError(message.reason, this.language);
    this.startDeferred?.reject(rejectionError);
    this.startDeferred = null;
  }

  private handleTransportClose(_event: CloseEvent) {
    this.callbacks?.onTransportStatus?.('closed');

    if (this.state === 'starting') {
      this.startDeferred?.reject(
        new RealtimeTransportStartError('Realtime transport closed before the session started.'),
      );
      this.startDeferred = null;
      return;
    }

    if (this.state === 'stopping') {
      this.endDeferred?.resolve();
      return;
    }

    if (this.state !== 'idle') {
      this.handleRuntimeError(new Error('Realtime transport closed unexpectedly.'));
    }
  }

  private handleRuntimeError(error: Error) {
    this.callbacks?.onError?.(error.message);

    if (this.state === 'starting') {
      this.startDeferred?.reject(
        error instanceof RealtimeTransportStartError
          ? error
          : new RealtimeTransportStartError(error.message),
      );
      this.startDeferred = null;
      return;
    }

    this.endDeferred?.reject(error);
  }

  private startTicking() {
    this.clearTickTimer();
    this.tickTimer = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.callbacks?.onTick(this.elapsedSeconds);
    }, 1000);
  }

  private clearTickTimer() {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private async abortCurrentSession() {
    try {
      if (this.transport && this.sessionId) {
        this.transport.send({
          type: 'session.abort',
          sessionId: this.sessionId,
        });
      }
    } catch {}

    await this.disposeResources();
  }

  private async disposeResources() {
    this.clearTickTimer();

    try {
      await this.capture?.dispose();
    } catch {}

    try {
      this.transport?.close();
    } catch {}

    this.reset();
  }

  private reset() {
    this.state = 'idle';
    this.callbacks = null;
    this.sessionId = '';
    this.language = 'zh-CN';
    this.elapsedSeconds = 0;
    this.emittedCount = 0;
    this.clearTickTimer();
    this.transport = null;
    this.capture = null;
    this.latestTransportMetrics = null;
    this.startDeferred = null;
    this.endDeferred = null;
  }

  private createDeferred() {
    let resolve = () => {};
    let reject = (_error: Error) => {};

    const promise = new Promise<void>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });

    return {
      promise,
      resolve,
      reject,
    };
  }
}
