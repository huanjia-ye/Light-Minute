import { REALTIME_DEFAULT_AUDIO_FORMAT, REALTIME_PROTOCOL_VERSION } from './realtimeConstants';
import type {
  AsrEvent,
  AudioChunk,
  RealtimeEngineMode,
  RealtimeSessionCapabilities,
  TransportMetricsSnapshot,
  TransportStatus,
} from './realtimeTypes';

export interface SessionStartMessage {
  type: 'session.start';
  protocolVersion: typeof REALTIME_PROTOCOL_VERSION;
  session: {
    sessionId: string;
    language: string;
    engineMode: RealtimeEngineMode;
  };
  audioFormat: {
    encoding: typeof REALTIME_DEFAULT_AUDIO_FORMAT.encoding;
    sampleRate: typeof REALTIME_DEFAULT_AUDIO_FORMAT.sampleRate;
    channels: typeof REALTIME_DEFAULT_AUDIO_FORMAT.channels;
    clientChunkMs: typeof REALTIME_DEFAULT_AUDIO_FORMAT.clientChunkMs;
  };
  options: {
    enablePartials: boolean;
  };
}

export interface AudioChunkMessage {
  type: 'audio.chunk';
  sessionId: string;
  chunk: AudioChunk;
  audio: {
    payloadBase64: string;
  };
}

export interface SessionPauseMessage {
  type: 'session.pause';
  sessionId: string;
}

export interface SessionResumeMessage {
  type: 'session.resume';
  sessionId: string;
}

export interface SessionStopMessage {
  type: 'session.stop';
  sessionId: string;
}

export interface SessionAbortMessage {
  type: 'session.abort';
  sessionId: string;
}

export interface PingMessage {
  type: 'ping';
  sessionId: string;
  timestamp: number;
}

export interface SessionStartedMessage {
  type: 'session.started';
  sessionId: string;
  transportStatus: Extract<TransportStatus, 'open'>;
  capabilities: RealtimeSessionCapabilities;
}

export interface SessionRejectedMessage {
  type: 'session.rejected';
  sessionId: string;
  transportStatus: Extract<TransportStatus, 'open'>;
  reason: {
    code: 'unsupported_language' | 'model_unavailable' | 'backend_unavailable' | 'bad_request';
    message: string;
    recoverable: boolean;
  };
}

export interface TransportStateMessage {
  type: 'transport.state';
  sessionId: string;
  status: TransportStatus;
}

export interface TransportMetricsMessage {
  type: 'transport.metrics';
  sessionId: string;
  lastAcceptedSeq: TransportMetricsSnapshot['lastAcceptedSeq'];
  queueDepth: TransportMetricsSnapshot['queueDepth'];
  bufferedMs: TransportMetricsSnapshot['bufferedMs'];
  lastPartialAudioMs: TransportMetricsSnapshot['lastPartialAudioMs'];
  lastPartialInferenceMs: TransportMetricsSnapshot['lastPartialInferenceMs'];
  lastPartialEmitLatencyMs: TransportMetricsSnapshot['lastPartialEmitLatencyMs'];
  stalePartialDropCount: TransportMetricsSnapshot['stalePartialDropCount'];
  lastFinalizeReason: TransportMetricsSnapshot['lastFinalizeReason'];
  lastFinalAudioMs: TransportMetricsSnapshot['lastFinalAudioMs'];
  lastFinalInferenceMs: TransportMetricsSnapshot['lastFinalInferenceMs'];
  lastFinalEmitLatencyMs: TransportMetricsSnapshot['lastFinalEmitLatencyMs'];
}

export interface AsrEventEnvelopeMessage {
  type: 'asr.event';
  event: AsrEvent;
}

export interface PongMessage {
  type: 'pong';
  sessionId: string;
  timestamp: number;
}

export type RealtimeOutgoingMessage =
  | SessionStartMessage
  | AudioChunkMessage
  | SessionPauseMessage
  | SessionResumeMessage
  | SessionStopMessage
  | SessionAbortMessage
  | PingMessage;

export type RealtimeIncomingMessage =
  | SessionStartedMessage
  | SessionRejectedMessage
  | TransportStateMessage
  | TransportMetricsMessage
  | AsrEventEnvelopeMessage
  | PongMessage;

export function createSessionStartMessage(input: {
  sessionId: string;
  language: string;
  engineMode: RealtimeEngineMode;
  enablePartials?: boolean;
}): SessionStartMessage {
  return {
    type: 'session.start',
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    session: {
      sessionId: input.sessionId,
      language: input.language,
      engineMode: input.engineMode,
    },
    audioFormat: { ...REALTIME_DEFAULT_AUDIO_FORMAT },
    options: {
      enablePartials: input.enablePartials ?? true,
    },
  };
}

export function createAudioChunkMessage(input: {
  sessionId: string;
  chunk: AudioChunk;
  payloadBase64: string;
}): AudioChunkMessage {
  return {
    type: 'audio.chunk',
    sessionId: input.sessionId,
    chunk: input.chunk,
    audio: {
      payloadBase64: input.payloadBase64,
    },
  };
}

export function createPingMessage(sessionId: string): PingMessage {
  return {
    type: 'ping',
    sessionId,
    timestamp: Date.now(),
  };
}

export function parseRealtimeIncomingMessage(rawMessage: string): RealtimeIncomingMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as Partial<RealtimeIncomingMessage> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }

    switch (parsed.type) {
      case 'session.started':
      case 'session.rejected':
      case 'transport.state':
      case 'transport.metrics':
      case 'asr.event':
      case 'pong':
        return parsed as RealtimeIncomingMessage;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
