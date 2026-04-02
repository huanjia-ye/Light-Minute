import { createBrowserSpeechEngine } from './browserSpeechEngine';
import { LocalWhisperRecordingEngine } from './localWhisperRecordingEngine';
import { mockRecordingEngine } from './mockEngine';
import { isLikelyLocalWhisperEndpoint } from '../../lib/openaiCompatible';
import type { LiveTranscriptionLanguage } from '../../types/settings';

export function getRecordingEngine(
  transcriptionEndpoint = '',
  liveTranscriptionLanguage: LiveTranscriptionLanguage = 'auto',
) {
  const browserSpeechEngine = createBrowserSpeechEngine(liveTranscriptionLanguage);

  if (
    liveTranscriptionLanguage === 'en-US' &&
    transcriptionEndpoint &&
    isLikelyLocalWhisperEndpoint(transcriptionEndpoint)
  ) {
    const localWhisperRecordingEngine = new LocalWhisperRecordingEngine(transcriptionEndpoint);

    if (localWhisperRecordingEngine.isSupported()) {
      return localWhisperRecordingEngine;
    }
  }

  return browserSpeechEngine.isSupported() ? browserSpeechEngine : mockRecordingEngine;
}
