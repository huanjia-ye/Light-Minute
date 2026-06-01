export const PARTIAL_INITIAL_TRIGGER_MS = 800;
export const PARTIAL_UPDATE_STEP_MS = 600;
export const PARTIAL_FOLLOW_UP_MARGIN_MS = 200;
export const MAX_REALTIME_UTTERANCE_MS = 5000;
export const FINAL_PROMPT_SEGMENT_LIMIT = 2;
export const FINAL_PROMPT_CHAR_LIMIT = 120;
export const FINAL_BEAM_SIZE = 3;

const KNOWN_NON_SPEECH_TOKEN_PATTERN =
  /\[\s*(music|applause|laughter|noise|silence|blank_audio|sound)\s*\]/giu;
const GENERIC_UPPERCASE_BRACKET_TOKEN_PATTERN = /\[\s*[A-Z][A-Z_\-\s]{1,31}\s*\]/gu;

function roundUpToChunkBoundary(durationMs, chunkMs = 200) {
  return Math.max(chunkMs, Math.ceil(Math.max(0, durationMs) / chunkMs) * chunkMs);
}

export function resolvePartialFollowUpStepMs(inferenceMs = 0) {
  return Math.max(
    PARTIAL_UPDATE_STEP_MS,
    roundUpToChunkBoundary(Math.max(0, inferenceMs) + PARTIAL_FOLLOW_UP_MARGIN_MS),
  );
}

export function sanitizeTranscriptText(text) {
  return String(text ?? '')
    .replace(KNOWN_NON_SPEECH_TOKEN_PATTERN, ' ')
    .replace(GENERIC_UPPERCASE_BRACKET_TOKEN_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function hasUsableTranscriptText(text) {
  const sanitized = sanitizeTranscriptText(text);

  if (!sanitized) {
    return false;
  }

  return /[\p{L}\p{N}\p{Script=Han}]/u.test(sanitized);
}

export function resolveWhisperInferenceLanguage(language) {
  switch (language) {
    case 'en-US':
      return 'en';
    case 'zh-CN':
      return 'zh';
    default:
      return null;
  }
}

export function resolveWhisperInferenceParams(language) {
  const whisperLanguage = resolveWhisperInferenceLanguage(language);

  return {
    detectLanguage: whisperLanguage ? 'false' : 'true',
    language: whisperLanguage,
  };
}

export function buildRealtimeFinalPromptText(finalTexts) {
  const normalizedSegments = (Array.isArray(finalTexts) ? finalTexts : [])
    .map((text) => sanitizeTranscriptText(text))
    .filter((text) => hasUsableTranscriptText(text))
    .slice(-FINAL_PROMPT_SEGMENT_LIMIT);

  if (normalizedSegments.length === 0) {
    return '';
  }

  while (
    normalizedSegments.length > 1 &&
    normalizedSegments.join(' ').length > FINAL_PROMPT_CHAR_LIMIT
  ) {
    normalizedSegments.shift();
  }

  const mergedPrompt = sanitizeTranscriptText(normalizedSegments.join(' '));
  if (!hasUsableTranscriptText(mergedPrompt)) {
    return '';
  }

  if (mergedPrompt.length <= FINAL_PROMPT_CHAR_LIMIT) {
    return mergedPrompt;
  }

  const truncatedPrompt = sanitizeTranscriptText(
    mergedPrompt.slice(-FINAL_PROMPT_CHAR_LIMIT),
  );

  return hasUsableTranscriptText(truncatedPrompt) ? truncatedPrompt : '';
}

export function buildWhisperInferenceRequestFields({
  language,
  profile = 'final',
  promptText = '',
}) {
  const whisperParams = resolveWhisperInferenceParams(language);
  const fields = [
    ['response_format', 'json'],
    ['temperature', '0.0'],
    ['temperature_inc', profile === 'partial' ? '0.0' : '0.2'],
    ['detect_language', whisperParams.detectLanguage],
    ['diarize', 'false'],
    ['split_on_word', 'true'],
  ];

  if (whisperParams.language) {
    fields.push(['language', whisperParams.language]);
  }

  if (profile === 'final') {
    fields.push(['beam_size', String(FINAL_BEAM_SIZE)]);
    const normalizedPromptText = buildRealtimeFinalPromptText([promptText]);
    if (normalizedPromptText) {
      fields.push(['prompt', normalizedPromptText]);
    }
  }

  return fields;
}

export function decodeAudioPayloadBase64(payloadBase64) {
  if (typeof payloadBase64 !== 'string') {
    throw new Error('Audio chunk payloadBase64 is missing.');
  }

  return Buffer.from(payloadBase64, 'base64');
}

export function buildWaveFileFromPcm16(
  pcmBytes,
  {
    sampleRate = 16000,
    channels = 1,
    bitsPerSample = 16,
  } = {},
) {
  const normalizedPcmBytes = Buffer.isBuffer(pcmBytes) ? pcmBytes : Buffer.from(pcmBytes);
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const wavBuffer = Buffer.alloc(44 + normalizedPcmBytes.length);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + normalizedPcmBytes.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(normalizedPcmBytes.length, 40);
  normalizedPcmBytes.copy(wavBuffer, 44);

  return wavBuffer;
}

export function extractTranscriptTextFromWhisperResponse(whisperResponse) {
  const text = sanitizeTranscriptText(whisperResponse?.text ?? '');
  if (hasUsableTranscriptText(text)) {
    return text;
  }

  if (!Array.isArray(whisperResponse?.segments) || whisperResponse.segments.length === 0) {
    return '';
  }

  const mergedText = sanitizeTranscriptText(
    whisperResponse.segments
      .map((segment) => sanitizeTranscriptText(segment?.text ?? ''))
      .filter(Boolean)
      .join(' '),
  );

  return hasUsableTranscriptText(mergedText) ? mergedText : '';
}

export function createFinalAsrEventsFromWhisperResponse({
  sessionId,
  utterance,
  utteranceIndexStart,
  whisperResponse,
}) {
  let nextUtteranceIndex = utteranceIndexStart;
  const events = [];
  const utteranceDurationMs = Math.max(0, utterance.endMs - utterance.startMs);

  if (Array.isArray(whisperResponse?.segments) && whisperResponse.segments.length > 0) {
    whisperResponse.segments.forEach((segment) => {
      const text = sanitizeTranscriptText(segment?.text ?? '');
      if (!hasUsableTranscriptText(text)) {
        return;
      }

      const relativeStartMs = Math.max(0, Math.round((segment?.start ?? 0) * 1000));
      const fallbackRelativeEndMs =
        segment?.end != null
          ? Math.round(segment.end * 1000)
          : utteranceDurationMs;
      const relativeEndMs = Math.max(relativeStartMs + 1, fallbackRelativeEndMs);
      const startMs = utterance.startMs + relativeStartMs;
      const endMs = Math.max(
        startMs + 1,
        utterance.startMs + Math.min(utteranceDurationMs || relativeEndMs, relativeEndMs),
      );

      events.push({
        type: 'final',
        sessionId,
        groupId: utterance.groupId,
        utteranceId: `utt-${nextUtteranceIndex}`,
        revision: 1,
        startMs,
        endMs,
        text,
      });
      nextUtteranceIndex += 1;
    });
  }

  if (events.length > 0) {
    return {
      events,
      nextUtteranceIndex,
    };
  }

  const text = extractTranscriptTextFromWhisperResponse(whisperResponse);
  if (!text) {
    return {
      events: [],
      nextUtteranceIndex,
    };
  }

  return {
    events: [
      {
        type: 'final',
        sessionId,
        groupId: utterance.groupId,
        utteranceId: `utt-${nextUtteranceIndex}`,
        revision: 1,
        startMs: utterance.startMs,
        endMs: Math.max(utterance.startMs + 1, utterance.endMs),
        text,
      },
    ],
    nextUtteranceIndex: nextUtteranceIndex + 1,
  };
}

async function readResponseTextSafely(response) {
  try {
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

function normalizeWhisperBaseUrl(baseUrl) {
  return String(baseUrl || 'http://127.0.0.1:8178').replace(/\/+$/u, '');
}

async function requestWhisperInference({
  whisperBaseUrl,
  sessionId,
  language,
  utterance,
  profile = 'final',
  promptText = '',
  signal,
}) {
  const pcmBytes = Buffer.concat(utterance.audioBuffers);
  const wavFile = buildWaveFileFromPcm16(pcmBytes);
  const formData = new FormData();

  formData.append(
    'file',
    new Blob([wavFile], { type: 'audio/wav' }),
    `${sessionId}-${utterance.startMs}.wav`,
  );
  buildWhisperInferenceRequestFields({
    language,
    profile,
    promptText,
  }).forEach(([fieldName, fieldValue]) => {
    formData.append(fieldName, fieldValue);
  });

  const response = await fetch(`${normalizeWhisperBaseUrl(whisperBaseUrl)}/inference`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const responseBody = await readResponseTextSafely(response);
    throw new Error(`The local whisper server returned ${response.status}. ${responseBody}`.trim());
  }

  return response.json();
}

export async function transcribeWithLocalWhisper({
  whisperBaseUrl,
  sessionId,
  language,
  utterance,
  utteranceIndexStart,
  promptText = '',
}) {
  const whisperResponse = await requestWhisperInference({
    whisperBaseUrl,
    sessionId,
    language,
    utterance,
    profile: 'final',
    promptText,
  });

  return createFinalAsrEventsFromWhisperResponse({
    sessionId,
    utterance,
    utteranceIndexStart,
    whisperResponse,
  });
}

export async function transcribePartialWithLocalWhisper({
  whisperBaseUrl,
  sessionId,
  language,
  utterance,
  signal,
}) {
  const whisperResponse = await requestWhisperInference({
    whisperBaseUrl,
    sessionId,
    language,
    utterance,
    profile: 'partial',
    signal,
  });

  return extractTranscriptTextFromWhisperResponse(whisperResponse);
}

function getUtteranceDurationMs(utterance) {
  return Math.max(0, utterance.endMs - utterance.startMs);
}

function getEmitLatencyMs(sessionStartedAt, audioEndMs) {
  return Math.max(0, Date.now() - sessionStartedAt - Math.max(0, audioEndMs));
}

function createUtteranceSnapshot(utterance) {
  return {
    groupId: utterance.groupId,
    startMs: utterance.startMs,
    endMs: utterance.endMs,
    audioBuffers: [...utterance.audioBuffers],
  };
}

function extractFinalTexts(events) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.type === 'final')
    .map((event) => sanitizeTranscriptText(event?.text ?? ''))
    .filter((text) => hasUsableTranscriptText(text));
}

export class RealtimeSessionProcessor {
  constructor({
    sessionId,
    language,
    emit,
    transcribeUtterance,
    transcribePartialUtterance = async () => '',
    enablePartials = true,
  }) {
    this.sessionId = sessionId;
    this.language = language;
    this.emit = emit;
    this.transcribeUtterance = transcribeUtterance;
    this.transcribePartialUtterance = transcribePartialUtterance;
    this.enablePartials = enablePartials;
    this.sessionStartedAt = Date.now();
    this.lastAcceptedSeq = -1;
    this.lastChunkEndMs = 0;
    this.nextGroupIndex = 1;
    this.nextUtteranceIndex = 1;
    this.currentUtterance = null;
    this.pendingTranscriptions = 0;
    this.pendingBufferedMs = 0;
    this.transcriptionChain = Promise.resolve();
    this.partialInFlight = false;
    this.partialAbortController = null;
    this.partialRequestGroupId = null;
    this.hasEmittedPartialPreviewWarning = false;
    this.recentFinalTexts = [];
    this.isPaused = false;
    this.isAborted = false;
    this.isStopped = false;
    this.lastPartialAudioMs = null;
    this.lastPartialInferenceMs = null;
    this.lastPartialEmitLatencyMs = null;
    this.stalePartialDropCount = 0;
    this.lastFinalizeReason = null;
    this.lastFinalAudioMs = null;
    this.lastFinalInferenceMs = null;
    this.lastFinalEmitLatencyMs = null;
  }

  acceptAudioChunk(message) {
    const nextSeq = Number(message?.chunk?.seq);
    const startMs = Number(message?.chunk?.startMs);
    const endMs = Number(message?.chunk?.endMs);
    const hasSpeech = Boolean(message?.chunk?.hasSpeech);
    const isLast = Boolean(message?.chunk?.isLast);
    const boundaryReason = message?.chunk?.boundaryReason === 'force' ? 'force' : null;

    if (!Number.isFinite(nextSeq) || nextSeq <= this.lastAcceptedSeq) {
      throw new Error('Audio chunk seq must be strictly increasing.');
    }

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      throw new Error('Audio chunk startMs/endMs is invalid.');
    }

    this.lastAcceptedSeq = nextSeq;
    this.lastChunkEndMs = endMs;

    if (this.isPaused) {
      this.emitMetrics();
      return;
    }

    const pcmBytes = decodeAudioPayloadBase64(message?.audio?.payloadBase64);
    if (pcmBytes.length % 2 !== 0) {
      throw new Error('Audio chunk PCM payload length must be even.');
    }

    if (hasSpeech && pcmBytes.length > 0) {
      this.appendToCurrentUtterance({
        startMs,
        endMs,
        pcmBytes,
      });

      if (boundaryReason === 'force') {
        this.enqueueCurrentUtterance('force');
      } else {
        this.maybeScheduleCurrentPartial();
        if (
          this.currentUtterance &&
          getUtteranceDurationMs(this.currentUtterance) >= MAX_REALTIME_UTTERANCE_MS
        ) {
          this.enqueueCurrentUtterance('force');
        }
      }
    } else if (this.currentUtterance) {
      this.enqueueCurrentUtterance('silence');
    }

    if (isLast && this.currentUtterance) {
      this.enqueueCurrentUtterance('stop');
    }

    this.emitMetrics();
  }

  async pause() {
    this.isPaused = true;
    if (this.currentUtterance) {
      this.enqueueCurrentUtterance('pause');
    }

    await this.transcriptionChain.catch(() => {});
  }

  resume() {
    this.isPaused = false;
    this.emitMetrics();
  }

  async stop() {
    if (this.isStopped) {
      return;
    }

    this.isStopped = true;
    this.emit({
      type: 'transport.state',
      sessionId: this.sessionId,
      status: 'draining',
    });

    if (this.currentUtterance) {
      this.enqueueCurrentUtterance('stop');
    }

    await this.transcriptionChain.catch(() => {});

    if (this.isAborted) {
      return;
    }

    this.emit({
      type: 'asr.event',
      event: {
        type: 'end',
        sessionId: this.sessionId,
        groupId: `end:${this.sessionId}`,
        utteranceId: `end:${this.sessionId}`,
        revision: 0,
        startMs: this.lastChunkEndMs,
        endMs: this.lastChunkEndMs,
        text: '',
      },
    });
    this.emit({
      type: 'transport.state',
      sessionId: this.sessionId,
      status: 'closed',
    });
  }

  abort() {
    this.isAborted = true;
  }

  appendToCurrentUtterance({ startMs, endMs, pcmBytes }) {
    if (!this.currentUtterance) {
      this.currentUtterance = {
        groupId: `grp-${this.nextGroupIndex}`,
        startMs,
        endMs,
        audioBuffers: [pcmBytes],
        partialRevision: 0,
        nextPartialTargetMs: PARTIAL_INITIAL_TRIGGER_MS,
        lastPartialText: '',
        finalizing: false,
      };
      this.nextGroupIndex += 1;
      return;
    }

    this.currentUtterance.endMs = endMs;
    this.currentUtterance.audioBuffers.push(pcmBytes);
  }

  enqueueCurrentUtterance(reason = 'silence') {
    const utterance = this.currentUtterance;
    if (!utterance) {
      return;
    }

    if (
      this.partialInFlight &&
      this.partialAbortController &&
      this.partialRequestGroupId === utterance.groupId
    ) {
      this.partialAbortController.abort();
      this.stalePartialDropCount += 1;
    }

    utterance.finalizing = true;
    this.currentUtterance = null;
    const utteranceDurationMs = getUtteranceDurationMs(utterance);
    this.lastFinalizeReason = reason;
    this.pendingTranscriptions += 1;
    this.pendingBufferedMs += utteranceDurationMs;

    this.transcriptionChain = this.transcriptionChain
      .then(async () => {
        if (this.isAborted) {
          return;
        }

        const inferenceStartedAt = Date.now();

        try {
          const result = await this.transcribeUtterance({
            sessionId: this.sessionId,
            language: this.language,
            utterance,
            utteranceIndexStart: this.nextUtteranceIndex,
            promptText: buildRealtimeFinalPromptText(this.recentFinalTexts),
          });
          this.lastFinalAudioMs = utteranceDurationMs;
          this.lastFinalInferenceMs = Math.max(0, Date.now() - inferenceStartedAt);
          this.lastFinalEmitLatencyMs = getEmitLatencyMs(this.sessionStartedAt, utterance.endMs);
          if (this.isAborted) {
            return;
          }

          this.nextUtteranceIndex = result.nextUtteranceIndex;
          this.recentFinalTexts = [
            ...this.recentFinalTexts,
            ...extractFinalTexts(result.events),
          ].slice(-FINAL_PROMPT_SEGMENT_LIMIT);
          result.events.forEach((event) => {
            this.emit({
              type: 'asr.event',
              event,
            });
          });
        } catch (error) {
          this.lastFinalAudioMs = utteranceDurationMs;
          this.lastFinalInferenceMs = Math.max(0, Date.now() - inferenceStartedAt);
          this.lastFinalEmitLatencyMs = null;
          if (this.isAborted) {
            return;
          }

          this.emit({
            type: 'asr.event',
            event: {
              type: 'error',
              sessionId: this.sessionId,
              groupId: utterance.groupId,
              utteranceId: `error:${this.sessionId}:${this.lastAcceptedSeq}`,
              revision: 0,
              startMs: utterance.startMs,
              endMs: utterance.endMs,
              text: '',
              error: {
                source: 'asr',
                message: error instanceof Error ? error.message : 'Realtime ASR transcription failed.',
                recoverable: true,
              },
            },
          });
        }
      })
      .finally(() => {
        this.pendingTranscriptions = Math.max(0, this.pendingTranscriptions - 1);
        this.pendingBufferedMs = Math.max(0, this.pendingBufferedMs - utteranceDurationMs);
        this.emitMetrics();
      });
  }

  maybeScheduleCurrentPartial() {
    if (
      !this.enablePartials ||
      !this.currentUtterance ||
      this.currentUtterance.finalizing ||
      this.partialInFlight ||
      this.isPaused ||
      this.isAborted ||
      this.isStopped
    ) {
      return;
    }

    const utterance = this.currentUtterance;
    if (getUtteranceDurationMs(utterance) < utterance.nextPartialTargetMs) {
      return;
    }

    const snapshot = createUtteranceSnapshot(utterance);
    const snapshotDurationMs = getUtteranceDurationMs(snapshot);
    utterance.nextPartialTargetMs = Number.POSITIVE_INFINITY;
    this.partialInFlight = true;
    const abortController = new AbortController();
    this.partialAbortController = abortController;
    this.partialRequestGroupId = utterance.groupId;

    void this.runPartialInference(utterance, snapshot, snapshotDurationMs, abortController);
  }

  async runPartialInference(utterance, snapshot, snapshotDurationMs, abortController) {
    const partialAudioMs = snapshotDurationMs;
    const inferenceStartedAt = Date.now();

    try {
      const text = sanitizeTranscriptText(
        await this.transcribePartialUtterance({
          sessionId: this.sessionId,
          language: this.language,
          utterance: snapshot,
          signal: abortController.signal,
        }),
      );
      this.lastPartialAudioMs = partialAudioMs;
      this.lastPartialInferenceMs = Math.max(0, Date.now() - inferenceStartedAt);

      if (this.isAborted) {
        return;
      }

      if (abortController.signal.aborted) {
        return;
      }

      if (utterance.finalizing) {
        this.stalePartialDropCount += 1;
        return;
      }

      if (!hasUsableTranscriptText(text) || utterance.lastPartialText === text) {
        return;
      }

      utterance.partialRevision += 1;
      utterance.lastPartialText = text;
      this.lastPartialEmitLatencyMs = getEmitLatencyMs(this.sessionStartedAt, snapshot.endMs);
      this.emit({
        type: 'asr.event',
        event: {
          type: 'partial',
          sessionId: this.sessionId,
          groupId: utterance.groupId,
          utteranceId: utterance.groupId,
          revision: utterance.partialRevision,
          startMs: snapshot.startMs,
          endMs: snapshot.endMs,
          text,
        },
      });
    } catch (error) {
      this.lastPartialAudioMs = partialAudioMs;
      this.lastPartialInferenceMs = Math.max(0, Date.now() - inferenceStartedAt);
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }

      if (!this.isAborted && !this.hasEmittedPartialPreviewWarning) {
        this.hasEmittedPartialPreviewWarning = true;
        this.emit({
          type: 'asr.event',
          event: {
            type: 'error',
            sessionId: this.sessionId,
            groupId: snapshot.groupId,
            utteranceId: `warning:${this.sessionId}:${snapshot.groupId}`,
            revision: 0,
            startMs: snapshot.startMs,
            endMs: snapshot.endMs,
            text: '',
            error: {
              source: 'asr',
              message: 'Partial preview is temporarily unavailable. Final transcription will continue.',
              recoverable: true,
            },
          },
        });
      }
    } finally {
      if (this.partialAbortController === abortController) {
        this.partialAbortController = null;
        this.partialRequestGroupId = null;
      }

      this.partialInFlight = false;
      if (this.currentUtterance === utterance && !utterance.finalizing) {
        utterance.nextPartialTargetMs =
          snapshotDurationMs + resolvePartialFollowUpStepMs(this.lastPartialInferenceMs ?? 0);
      }
      this.emitMetrics();
      this.maybeScheduleCurrentPartial();
    }
  }

  emitMetrics() {
    this.emit({
      type: 'transport.metrics',
      sessionId: this.sessionId,
      lastAcceptedSeq: this.lastAcceptedSeq,
      queueDepth: this.pendingTranscriptions + (this.currentUtterance ? 1 : 0),
      bufferedMs:
        this.pendingBufferedMs +
        (this.currentUtterance
          ? getUtteranceDurationMs(this.currentUtterance)
          : 0),
      lastPartialAudioMs: this.lastPartialAudioMs,
      lastPartialInferenceMs: this.lastPartialInferenceMs,
      lastPartialEmitLatencyMs: this.lastPartialEmitLatencyMs,
      stalePartialDropCount: this.stalePartialDropCount,
      lastFinalizeReason: this.lastFinalizeReason,
      lastFinalAudioMs: this.lastFinalAudioMs,
      lastFinalInferenceMs: this.lastFinalInferenceMs,
      lastFinalEmitLatencyMs: this.lastFinalEmitLatencyMs,
    });
  }
}
