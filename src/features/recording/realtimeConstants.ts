import type { RealtimeProtocolVersion, RealtimeSupportedLanguage } from './realtimeTypes';

export const REALTIME_PROTOCOL_VERSION: RealtimeProtocolVersion = 'v1';

export const REALTIME_SUPPORTED_LANGUAGES: RealtimeSupportedLanguage[] = ['zh-CN', 'en-US'];

export const REALTIME_DEFAULT_MODEL_ID = 'whisper-small-multilingual';

export const REALTIME_DEFAULT_AUDIO_FORMAT = {
  encoding: 'pcm_s16le',
  sampleRate: 16000,
  channels: 1,
  clientChunkMs: 200,
} as const;

export const REALTIME_DEFAULT_CAPTURE = {
  frameMs: 20,
  calibrationMs: 300,
  speechStartMs: 120,
  silenceEndMs: 500,
  prerollMs: 300,
  hangoverMs: 500,
  maxUtteranceMs: 5000,
} as const;

export const REALTIME_DEFAULT_TRANSPORT = {
  connectTimeoutMs: 3000,
  heartbeatIntervalMs: 5000,
  drainTimeoutMs: 3000,
  queueLimitChunks: 10,
  queueLimitMs: 2000,
} as const;
