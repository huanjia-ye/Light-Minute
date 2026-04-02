export function normalizeApiBase(endpoint: string) {
  return endpoint.replace(/\/+$/, '');
}

export function resolveChatCompletionsUrl(endpoint: string) {
  const base = normalizeApiBase(endpoint);

  if (base.endsWith('/chat/completions')) {
    return base;
  }

  return `${base}/chat/completions`;
}

export function resolveAudioTranscriptionsUrl(endpoint: string) {
  const base = normalizeApiBase(endpoint);

  if (base.endsWith('/audio/transcriptions')) {
    return base;
  }

  return `${base}/audio/transcriptions`;
}

export function isLikelyLocalWhisperEndpoint(endpoint: string) {
  const base = normalizeApiBase(endpoint).toLowerCase();
  return (
    base.includes('127.0.0.1:8178') ||
    base.includes('localhost:8178') ||
    base.endsWith('/inference')
  );
}

export function resolveLocalWhisperInferenceUrl(endpoint: string) {
  const base = normalizeApiBase(endpoint);

  if (base.endsWith('/inference')) {
    return base;
  }

  return `${base}/inference`;
}

export function resolveBrowserLocalWhisperInferenceUrl(endpoint: string) {
  if (
    typeof window !== 'undefined' &&
    isLikelyLocalWhisperEndpoint(endpoint) &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname.toLowerCase())
  ) {
    return '/__light_whisper/inference';
  }

  return resolveLocalWhisperInferenceUrl(endpoint);
}

export function resolveDirectLocalWhisperInferenceUrl() {
  return 'http://127.0.0.1:8178/inference';
}

export function canUseBrowserLocalParakeetUrl() {
  return (
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname.toLowerCase())
  );
}

export function resolveBrowserLocalParakeetTranscriptionUrl() {
  return canUseBrowserLocalParakeetUrl() ? '/__light_parakeet/transcribe' : null;
}

export function resolveDirectLocalParakeetTranscriptionUrl() {
  return 'http://127.0.0.1:8179/transcribe';
}

export function getProviderLabel(provider: 'openai' | 'custom-openai') {
  return provider === 'custom-openai' ? 'Custom OpenAI' : 'OpenAI';
}
