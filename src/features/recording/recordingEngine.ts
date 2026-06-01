import { createBrowserSpeechEngine } from './browserSpeechEngine';
import { LocalWhisperRecordingEngine } from './localWhisperRecordingEngine';
import { mockRecordingEngine } from './mockEngine';
import { isLikelyLocalWhisperEndpoint } from '../../lib/openaiCompatible';
import { fetchRealtimeCapabilities } from './realtimeTransportClient';
import { RealtimeWhisperRecordingEngine } from './realtimeWhisperRecordingEngine';
import type { RecordingEngine } from './engineTypes';
import type {
  LiveTranscriptionLanguage,
  LiveTranscriptionRoutePolicy,
} from '../../types/settings';

export function resolveSessionLanguage(
  liveTranscriptionLanguage: LiveTranscriptionLanguage = 'auto',
) {
  if (liveTranscriptionLanguage !== 'auto') {
    return liveTranscriptionLanguage;
  }

  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language || 'zh-CN' : 'zh-CN';
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

function createBrowserSpeechEngineIfSupported(
  liveTranscriptionLanguage: LiveTranscriptionLanguage,
) {
  const browserSpeechEngine = createBrowserSpeechEngine(liveTranscriptionLanguage);
  return browserSpeechEngine.isSupported() ? browserSpeechEngine : null;
}

function createRealtimeWhisperEngineIfSupported() {
  const realtimeWhisperRecordingEngine = new RealtimeWhisperRecordingEngine();
  return realtimeWhisperRecordingEngine.isSupported() ? realtimeWhisperRecordingEngine : null;
}

function createLocalWhisperChunkEngineIfSupported(
  transcriptionEndpoint: string,
  sessionLanguage: string,
) {
  if (
    sessionLanguage !== 'en-US' ||
    !transcriptionEndpoint ||
    !isLikelyLocalWhisperEndpoint(transcriptionEndpoint)
  ) {
    return null;
  }

  const localWhisperRecordingEngine = new LocalWhisperRecordingEngine(transcriptionEndpoint);
  return localWhisperRecordingEngine.isSupported() ? localWhisperRecordingEngine : null;
}

export function getRecordingEngine(
  transcriptionEndpoint = '',
  liveTranscriptionLanguage: LiveTranscriptionLanguage = 'auto',
  liveTranscriptionRoute: LiveTranscriptionRoutePolicy = 'prefer-realtime',
) {
  const sessionLanguage = resolveSessionLanguage(liveTranscriptionLanguage);

  if (liveTranscriptionRoute === 'realtime-only') {
    return createRealtimeWhisperEngineIfSupported() ?? mockRecordingEngine;
  }

  if (liveTranscriptionRoute === 'fallback-only') {
    return (
      resolveFallbackRecordingEngineForSession({
        transcriptionEndpoint,
        liveTranscriptionLanguage,
        liveTranscriptionRoute,
        sessionLanguage,
      }) ?? mockRecordingEngine
    );
  }

  return (
    createLocalWhisperChunkEngineIfSupported(transcriptionEndpoint, sessionLanguage) ??
    createBrowserSpeechEngineIfSupported(liveTranscriptionLanguage) ??
    mockRecordingEngine
  );
}

interface ResolveRecordingEngineForSessionOptions {
  transcriptionEndpoint?: string;
  liveTranscriptionLanguage?: LiveTranscriptionLanguage;
  liveTranscriptionRoute?: LiveTranscriptionRoutePolicy;
  sessionLanguage: string;
}

async function canUseRealtimeLanguage(sessionLanguage: string) {
  try {
    const capabilities = await fetchRealtimeCapabilities();
    return capabilities.supportedLanguages.includes(sessionLanguage);
  } catch {
    return false;
  }
}

export function resolveFallbackRecordingEngineForSession({
  transcriptionEndpoint = '',
  liveTranscriptionLanguage = 'auto',
  liveTranscriptionRoute = 'prefer-realtime',
  sessionLanguage,
}: ResolveRecordingEngineForSessionOptions): RecordingEngine | null {
  if (liveTranscriptionRoute === 'realtime-only') {
    return null;
  }

  return (
    createLocalWhisperChunkEngineIfSupported(transcriptionEndpoint, sessionLanguage) ??
    createBrowserSpeechEngineIfSupported(liveTranscriptionLanguage)
  );
}

function buildUnavailableRecordingRouteMessage(
  liveTranscriptionRoute: LiveTranscriptionRoutePolicy,
  sessionLanguage: string,
) {
  if (liveTranscriptionRoute === 'realtime-only') {
    return `Realtime-only mode is enabled, but local realtime whisper is unavailable for ${sessionLanguage}.`;
  }

  return `Fallback-only mode is enabled, but no fallback transcription engine is available for ${sessionLanguage}.`;
}

export async function resolveRecordingEngineForSession({
  transcriptionEndpoint = '',
  liveTranscriptionLanguage = 'auto',
  liveTranscriptionRoute = 'prefer-realtime',
  sessionLanguage,
}: ResolveRecordingEngineForSessionOptions): Promise<RecordingEngine> {
  const fallbackEngine = resolveFallbackRecordingEngineForSession({
    transcriptionEndpoint,
    liveTranscriptionLanguage,
    liveTranscriptionRoute,
    sessionLanguage,
  });

  if (liveTranscriptionRoute === 'fallback-only') {
    if (fallbackEngine) {
      return fallbackEngine;
    }

    throw new Error(buildUnavailableRecordingRouteMessage(liveTranscriptionRoute, sessionLanguage));
  }

  const realtimeWhisperRecordingEngine = createRealtimeWhisperEngineIfSupported();
  if (
    realtimeWhisperRecordingEngine &&
    await canUseRealtimeLanguage(sessionLanguage)
  ) {
    return realtimeWhisperRecordingEngine;
  }

  if (liveTranscriptionRoute === 'realtime-only') {
    throw new Error(buildUnavailableRecordingRouteMessage(liveTranscriptionRoute, sessionLanguage));
  }

  return (
    fallbackEngine ?? mockRecordingEngine
  );
}
