import {
  resolveBrowserLocalParakeetTranscriptionUrl,
  resolveDirectLocalParakeetTranscriptionUrl,
  isLikelyLocalWhisperEndpoint,
  resolveAudioTranscriptionsUrl,
  resolveBrowserLocalWhisperInferenceUrl,
  resolveDirectLocalWhisperInferenceUrl,
  resolveLocalWhisperInferenceUrl,
} from '../../lib/openaiCompatible';
import { createId } from '../../lib/storage';
import type { TranscriptSegment } from '../../types/meeting';
import type { AppSettings } from '../../types/settings';
import { normalizeSettings } from '../settings/store';
import { buildImportedAudioScript } from './mockScript';
import { hasUsableTranscriptText, sanitizeTranscriptText } from './transcriptSanitizer';

interface AudioTranscriptionResponse {
  text?: string;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
    confidence?: number;
  }>;
}

export interface AudioImportAnalysisStatus {
  stage: 'local-parakeet' | 'local-whisper' | 'api' | 'mock';
  message: string;
}

function describeLocalRuntimeError(error: unknown, runtimeLabel: string) {
  if (!(error instanceof Error)) {
    return `The ${runtimeLabel} could not be reached.`;
  }

  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return `The ${runtimeLabel} could not be reached.`;
  }

  return `The ${runtimeLabel} could not be reached. ${error.message}`;
}

function splitTranscriptIntoSegments(transcript: string, durationSeconds: number | null) {
  const lines = transcript
    .split(/(?<=[.!?。！？])\s+/u)
    .map((line) => sanitizeTranscriptText(line))
    .filter((line) => hasUsableTranscriptText(line));

  if (lines.length === 0) {
    return [];
  }

  const totalDuration = Math.max(durationSeconds ?? lines.length * 4, lines.length * 4);
  const sliceLength = totalDuration / lines.length;

  return lines.map((line, index) => {
    const startTime = Math.round(index * sliceLength);
    const endTime = Math.round((index + 1) * sliceLength);

    return {
      id: createId(`segment-import-${index}`),
      startTime,
      endTime,
      text: line,
      confidence: 0.92,
    } satisfies TranscriptSegment;
  });
}

function mapApiSegments(
  segments: AudioTranscriptionResponse['segments'],
  fallbackText: string,
  durationSeconds: number | null,
) {
  if (!segments?.length) {
    return splitTranscriptIntoSegments(fallbackText, durationSeconds);
  }

  return segments
    .filter((segment) => hasUsableTranscriptText(segment.text ?? ''))
    .map((segment, index) => ({
      id: createId(`segment-import-${index}`),
      startTime: Math.max(0, Math.round(segment.start ?? index * 4)),
      endTime: Math.max(
        Math.round((segment.start ?? index * 4) + 1),
        Math.round(segment.end ?? (segment.start ?? index * 4) + 4),
      ),
      text: sanitizeTranscriptText(segment.text ?? ''),
      confidence: segment.confidence ?? 0.92,
    }));
}

async function readAudioDuration(file: File) {
  if (typeof window === 'undefined') {
    return null;
  }

  return new Promise<number | null>((resolve) => {
    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    }, 50);

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    audio.onerror = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    audio.src = objectUrl;
  });
}

async function requestVerboseTranscription(url: string, file: File, settings: AppSettings) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', settings.transcriptionModel);
  formData.append('response_format', 'verbose_json');

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: formData,
  });
}

async function requestBasicTranscription(url: string, file: File, settings: AppSettings) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', settings.transcriptionModel);

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: formData,
  });
}

async function requestLocalWhisperTranscription(url: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('response_format', 'json');
  formData.append('temperature', '0.0');
  formData.append('temperature_inc', '0.2');
  formData.append('detect_language', 'true');
  formData.append('diarize', 'false');
  formData.append('split_on_word', 'true');

  return fetch(url, {
    method: 'POST',
    body: formData,
  });
}

async function requestLocalParakeetTranscription(url: string, file: File) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
}

async function readResponseTextSafely(response: Response) {
  try {
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

function buildApiError(status: number, body: string) {
  if (status === 401) {
    return 'Audio transcription failed because the API key was rejected.';
  }

  if (status === 404) {
    return 'The configured endpoint does not expose /audio/transcriptions.';
  }

  if (status === 413) {
    return 'The uploaded recording is too large for the current transcription endpoint.';
  }

  return `Audio transcription failed (${status}). ${body}`.trim();
}

function buildLocalWhisperError(status: number, body: string) {
  if (status === 404) {
    return 'The Light-Minute whisper server did not expose /inference.';
  }

  return `Local Light-Minute transcription failed (${status}). ${body}`.trim();
}

export async function analyzeImportedAudio(
  file: File,
  settings: AppSettings,
  options?: {
    onStatusChange?: (status: AudioImportAnalysisStatus) => void;
  },
) {
  const normalizedSettings = normalizeSettings(settings);
  const durationSeconds = await readAudioDuration(file);
  const apiKey =
    normalizedSettings.transcriptionApiKey.trim() || normalizedSettings.apiKey.trim();
  const endpoint =
    normalizedSettings.transcriptionEndpoint.trim() || normalizedSettings.endpoint.trim();
  const localParakeetUrls = Array.from(
    new Set(
      [
        resolveBrowserLocalParakeetTranscriptionUrl(),
        resolveDirectLocalParakeetTranscriptionUrl(),
      ].filter(Boolean),
    ),
  ) as string[];
  const localWhisperUrls = Array.from(
    new Set(
      (
        endpoint && isLikelyLocalWhisperEndpoint(endpoint)
          ? [
              typeof window === 'undefined'
                ? resolveLocalWhisperInferenceUrl(endpoint)
                : resolveBrowserLocalWhisperInferenceUrl(endpoint),
              resolveDirectLocalWhisperInferenceUrl(),
            ]
          : typeof window !== 'undefined' &&
                ['localhost', '127.0.0.1'].includes(window.location.hostname.toLowerCase())
            ? ['/__light_whisper/inference', resolveDirectLocalWhisperInferenceUrl()]
            : []
      ).filter(Boolean),
    ),
  ) as string[];
  let localParakeetErrorMessage = '';
  let localWhisperErrorMessage = '';

  for (const localParakeetUrl of localParakeetUrls) {
    options?.onStatusChange?.({
      stage: 'local-parakeet',
      message: 'Analyzing audio with the optional Light-Minute local Parakeet runtime...',
    });

    try {
      const response = await requestLocalParakeetTranscription(localParakeetUrl, file);

      if (response.ok) {
        const payload = (await response.json()) as AudioTranscriptionResponse;
        const transcriptText = sanitizeTranscriptText(payload.text ?? '');
        const segments = mapApiSegments(payload.segments, transcriptText, durationSeconds);

        if (segments.length) {
          return {
            segments,
            durationSeconds: durationSeconds ?? segments[segments.length - 1]?.endTime ?? 0,
            mode: 'local-parakeet' as const,
          };
        }

        localParakeetErrorMessage =
          'The optional Light-Minute Parakeet upload service returned no usable transcript text.';
        continue;
      }

      const body = await readResponseTextSafely(response);
      localParakeetErrorMessage =
        response.status === 404
          ? 'The optional Light-Minute Parakeet upload service did not expose /transcribe.'
          : `The optional Light-Minute Parakeet upload service failed (${response.status}). ${body}`.trim();
    } catch (error) {
      localParakeetErrorMessage = describeLocalRuntimeError(
        error,
        'Light-Minute local Parakeet upload service',
      );
    }

    if (localParakeetErrorMessage) {
      continue;
    }
  }

  if (localWhisperUrls.length > 0) {
    options?.onStatusChange?.({
      stage: 'local-whisper',
      message: 'Falling back to the optional Light-Minute whisper runtime...',
    });

    for (const localWhisperUrl of localWhisperUrls) {
      let response: Response | null = null;

      try {
        response = await requestLocalWhisperTranscription(localWhisperUrl, file);
      } catch (error) {
        localWhisperErrorMessage = describeLocalRuntimeError(
          error,
          'Light-Minute whisper server',
        );
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        localWhisperErrorMessage = buildLocalWhisperError(response.status, body);
        continue;
      }

      const payload = (await response.json()) as AudioTranscriptionResponse;
      const transcriptText = sanitizeTranscriptText(payload.text ?? '');
      const segments = mapApiSegments(payload.segments, transcriptText, durationSeconds);

      if (segments.length) {
        return {
          segments,
          durationSeconds: durationSeconds ?? segments[segments.length - 1]?.endTime ?? 0,
          mode: 'local-whisper' as const,
        };
      }

      localWhisperErrorMessage =
        'The Light-Minute whisper server returned no usable transcript text for this recording.';
    }

    if (!apiKey && !normalizedSettings.allowDemoFallbacks && localWhisperErrorMessage) {
      const reasons = [localParakeetErrorMessage, localWhisperErrorMessage]
        .filter(Boolean)
        .join(' ');

      throw new Error(
        `The optional Light-Minute local transcription runtime is not reachable. Start the app with npm run dev:local, then try importing again.${reasons ? ` ${reasons}` : ''}`,
      );
    }
  }

  if (!apiKey) {
    if (!normalizedSettings.allowDemoFallbacks) {
      const reasons = [localParakeetErrorMessage, localWhisperErrorMessage]
        .filter(Boolean)
        .join(' ');

      throw new Error(
        `Upload analysis needs either the optional Light-Minute local transcription runtime or a real transcription API. Add it in Settings or enable demo fallback explicitly.${reasons ? ` ${reasons}` : ''}`,
      );
    }

    options?.onStatusChange?.({
      stage: 'mock',
      message: 'Using demo transcript fallback because no real transcription runtime is available.',
    });

    const segments = buildImportedAudioScript(file.name);
    return {
      segments,
      durationSeconds: durationSeconds ?? segments[segments.length - 1]?.endTime ?? 0,
      mode: 'mock' as const,
    };
  }

  const resolvedSettings = {
    ...normalizedSettings,
    apiKey,
    endpoint,
  };
  options?.onStatusChange?.({
    stage: 'api',
    message: 'Sending audio to the configured transcription API...',
  });
  const url = resolveAudioTranscriptionsUrl(endpoint);
  let response = await requestVerboseTranscription(url, file, resolvedSettings);

  if (!response.ok && response.status < 500) {
    response = await requestBasicTranscription(url, file, resolvedSettings);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(buildApiError(response.status, body));
  }

  const payload = (await response.json()) as AudioTranscriptionResponse;
  const transcriptText = sanitizeTranscriptText(payload.text ?? '');
  const segments = mapApiSegments(payload.segments, transcriptText, durationSeconds);

  if (!segments.length) {
    throw new Error('The transcription endpoint returned no usable transcript text.');
  }

  return {
    segments,
    durationSeconds: durationSeconds ?? segments[segments.length - 1]?.endTime ?? 0,
    mode: 'api' as const,
  };
}
