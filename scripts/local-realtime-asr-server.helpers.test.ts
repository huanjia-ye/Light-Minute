// @vitest-environment node

import {
  buildRealtimeFinalPromptText,
  buildWhisperInferenceRequestFields,
  buildWaveFileFromPcm16,
  createFinalAsrEventsFromWhisperResponse,
  FINAL_BEAM_SIZE,
  FINAL_PROMPT_CHAR_LIMIT,
  MAX_REALTIME_UTTERANCE_MS,
  PARTIAL_INITIAL_TRIGGER_MS,
  PARTIAL_FOLLOW_UP_MARGIN_MS,
  PARTIAL_UPDATE_STEP_MS,
  RealtimeSessionProcessor,
  resolvePartialFollowUpStepMs,
  resolveWhisperInferenceLanguage,
  resolveWhisperInferenceParams,
  sanitizeTranscriptText,
} from './local-realtime-asr-server.helpers.mjs';

function createChunk(
  seq: number,
  startMs: number,
  endMs: number,
  hasSpeech = true,
  isLast = false,
  boundaryReason: 'force' | null = null,
) {
  return {
    chunk: {
      seq,
      startMs,
      endMs,
      hasSpeech,
      isLast,
      boundaryReason,
    },
    audio: {
      payloadBase64: Buffer.from([1, 0, 2, 0]).toString('base64'),
    },
  };
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe('local realtime ASR adapter helpers', () => {
  it('sanitizes transcript text consistently', () => {
    expect(sanitizeTranscriptText('  hello   [noise]   world  ')).toBe('hello world');
    expect(sanitizeTranscriptText(' [SOUND] hello [SOUND EFFECT] ')).toBe('hello');
  });

  it('maps app language codes to whisper inference parameters', () => {
    expect(resolveWhisperInferenceLanguage('en-US')).toBe('en');
    expect(resolveWhisperInferenceLanguage('zh-CN')).toBe('zh');
    expect(resolveWhisperInferenceParams('en-US')).toEqual({
      detectLanguage: 'false',
      language: 'en',
    });
    expect(resolveWhisperInferenceParams('zh-CN')).toEqual({
      detectLanguage: 'false',
      language: 'zh',
    });
  });

  it('builds separate partial and final whisper request fields', () => {
    expect(
      buildWhisperInferenceRequestFields({
        language: 'en-US',
        profile: 'partial',
      }),
    ).toEqual([
      ['response_format', 'json'],
      ['temperature', '0.0'],
      ['temperature_inc', '0.0'],
      ['detect_language', 'false'],
      ['diarize', 'false'],
      ['split_on_word', 'true'],
      ['language', 'en'],
    ]);

    expect(
      buildWhisperInferenceRequestFields({
        language: 'zh-CN',
        profile: 'final',
        promptText: 'previous stable final',
      }),
    ).toEqual([
      ['response_format', 'json'],
      ['temperature', '0.0'],
      ['temperature_inc', '0.2'],
      ['detect_language', 'false'],
      ['diarize', 'false'],
      ['split_on_word', 'true'],
      ['language', 'zh'],
      ['beam_size', String(FINAL_BEAM_SIZE)],
      ['prompt', 'previous stable final'],
    ]);
  });

  it('caps realtime final prompt text to recent usable text only', () => {
    const overlongSegment = `prefix ${'a'.repeat(FINAL_PROMPT_CHAR_LIMIT + 20)}`;
    const promptText = buildRealtimeFinalPromptText([
      'older context that should be dropped first',
      '[noise]',
      'newest useful context',
      overlongSegment,
    ]);

    expect(promptText).toContain('a');
    expect(promptText).not.toContain('older context');
    expect(promptText.length).toBeLessThanOrEqual(FINAL_PROMPT_CHAR_LIMIT);
  });

  it('expands partial follow-up step when inference is slower than the fixed 600ms cadence', () => {
    expect(resolvePartialFollowUpStepMs(0)).toBe(PARTIAL_UPDATE_STEP_MS);
    expect(resolvePartialFollowUpStepMs(950)).toBe(1200);
    expect(resolvePartialFollowUpStepMs(1200)).toBe(1400);
    expect(resolvePartialFollowUpStepMs(1200)).toBeGreaterThan(
      PARTIAL_UPDATE_STEP_MS + PARTIAL_FOLLOW_UP_MARGIN_MS,
    );
  });

  it('builds a valid wav wrapper from pcm16 bytes', () => {
    const pcmBytes = Buffer.from([0, 0, 255, 127, 0, 128]);
    const wavFile = buildWaveFileFromPcm16(pcmBytes);

    expect(wavFile.subarray(0, 4).toString()).toBe('RIFF');
    expect(wavFile.subarray(8, 12).toString()).toBe('WAVE');
    expect(wavFile.readUInt32LE(40)).toBe(pcmBytes.length);
    expect(wavFile.subarray(44)).toEqual(pcmBytes);
  });

  it('maps whisper segments into split final ASR events with a shared groupId', () => {
    const result = createFinalAsrEventsFromWhisperResponse({
      sessionId: 'rt-1',
      utterance: {
        groupId: 'grp-9',
        startMs: 1200,
        endMs: 3200,
        audioBuffers: [],
      },
      utteranceIndexStart: 7,
      whisperResponse: {
        segments: [
          {
            start: 0,
            end: 0.6,
            text: ' first ',
          },
          {
            start: 0.6,
            end: 1.2,
            text: '[noise]',
          },
          {
            start: 1.2,
            end: 1.9,
            text: 'second',
          },
        ],
      },
    });

    expect(result.events).toEqual([
      {
        type: 'final',
        sessionId: 'rt-1',
        groupId: 'grp-9',
        utteranceId: 'utt-7',
        revision: 1,
        startMs: 1200,
        endMs: 1800,
        text: 'first',
      },
      {
        type: 'final',
        sessionId: 'rt-1',
        groupId: 'grp-9',
        utteranceId: 'utt-8',
        revision: 1,
        startMs: 2400,
        endMs: 3100,
        text: 'second',
      },
    ]);
    expect(result.nextUtteranceIndex).toBe(9);
  });

  it('starts the first partial only after the 800ms threshold', async () => {
    const partialTranscriber = vi.fn(async () => 'preview');
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-threshold',
      language: 'en-US',
      emit: vi.fn(),
      transcribeUtterance: vi.fn(async ({ utteranceIndexStart }) => ({
        events: [],
        nextUtteranceIndex: utteranceIndexStart,
      })),
      transcribePartialUtterance: partialTranscriber,
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    expect(partialTranscriber).not.toHaveBeenCalled();

    processor.acceptAudioChunk(createChunk(3, 600, PARTIAL_INITIAL_TRIGGER_MS));
    await flushMicrotasks();

    expect(partialTranscriber).toHaveBeenCalledTimes(1);
    expect(partialTranscriber.mock.calls[0][0].utterance).toMatchObject({
      groupId: 'grp-1',
      startMs: 0,
      endMs: PARTIAL_INITIAL_TRIGGER_MS,
    });
  });

  it('increments partial revision after each threshold-crossing partial', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const firstPartial = createDeferred<string>();
    const secondPartial = createDeferred<string>();
    const partialTranscriber = vi
      .fn()
      .mockImplementationOnce(() => firstPartial.promise)
      .mockImplementationOnce(() => secondPartial.promise);
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-partials',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance: vi.fn(async ({ utteranceIndexStart }) => ({
        events: [],
        nextUtteranceIndex: utteranceIndexStart,
      })),
      transcribePartialUtterance: partialTranscriber,
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    processor.acceptAudioChunk(createChunk(3, 600, 800));

    processor.acceptAudioChunk(createChunk(4, 800, 1000));
    processor.acceptAudioChunk(createChunk(5, 1000, 1200));
    processor.acceptAudioChunk(createChunk(6, 1200, PARTIAL_INITIAL_TRIGGER_MS + PARTIAL_UPDATE_STEP_MS));

    firstPartial.resolve('hello');
    await flushMicrotasks();
    secondPartial.resolve('hello world');
    await flushMicrotasks();

    const partialEvents = emittedMessages
      .filter(
        (message) =>
          message.type === 'asr.event' && (message.event as { type?: string })?.type === 'partial',
      )
      .map((message) => {
        const event = (message as { event: { revision: number; text: string } }).event;
        return {
          revision: event.revision,
          text: event.text,
        };
      });

    expect(partialTranscriber).toHaveBeenCalledTimes(2);
    expect(partialEvents).toEqual([
      {
        revision: 1,
        text: 'hello',
      },
      {
        revision: 2,
        text: 'hello world',
      },
    ]);
  });

  it('does not emit duplicate partial text for the same group', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-dedup',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance: vi.fn(async ({ utteranceIndexStart }) => ({
        events: [],
        nextUtteranceIndex: utteranceIndexStart,
      })),
      transcribePartialUtterance: vi
        .fn()
        .mockResolvedValueOnce('steady text')
        .mockResolvedValueOnce('steady text'),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    processor.acceptAudioChunk(createChunk(3, 600, 800));
    await flushMicrotasks();

    processor.acceptAudioChunk(createChunk(4, 800, 1000));
    processor.acceptAudioChunk(createChunk(5, 1000, 1200));
    processor.acceptAudioChunk(createChunk(6, 1200, 1400));
    await flushMicrotasks();

    const partialEvents = emittedMessages.filter(
      (message) =>
        message.type === 'asr.event' && (message.event as { type?: string })?.type === 'partial',
    );

    expect(partialEvents).toHaveLength(1);
    expect((partialEvents[0] as { event: { text: string } }).event.text).toBe('steady text');
  });

  it('emits one non-fatal warning when partial preview inference fails', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-preview-warning',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance: vi.fn(async ({ utteranceIndexStart }) => ({
        events: [],
        nextUtteranceIndex: utteranceIndexStart,
      })),
      transcribePartialUtterance: vi
        .fn()
        .mockRejectedValueOnce(new Error('partial failed'))
        .mockRejectedValueOnce(new Error('partial failed again')),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    processor.acceptAudioChunk(createChunk(3, 600, 800));
    await flushMicrotasks();

    processor.acceptAudioChunk(createChunk(4, 800, 1000));
    processor.acceptAudioChunk(createChunk(5, 1000, 1200));
    processor.acceptAudioChunk(createChunk(6, 1200, 1400));
    await flushMicrotasks();

    const warningEvents = emittedMessages
      .filter(
        (message) =>
          message.type === 'asr.event' && (message.event as { type?: string })?.type === 'error',
      )
      .map((message) => (message as { event: { error?: { message: string } } }).event.error?.message);

    expect(warningEvents).toEqual([
      'Partial preview is temporarily unavailable. Final transcription will continue.',
    ]);
  });

  it('drops stale partial results once the utterance is finalizing', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const partialDeferred = createDeferred<string>();
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-stale',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance: vi.fn(async ({ sessionId, utteranceIndexStart, utterance }) => ({
        events: [
          {
            type: 'final',
            sessionId,
            groupId: utterance.groupId,
            utteranceId: `utt-${utteranceIndexStart}`,
            revision: 1,
            startMs: utterance.startMs,
            endMs: utterance.endMs,
            text: 'frozen final',
          },
        ],
        nextUtteranceIndex: utteranceIndexStart + 1,
      })),
      transcribePartialUtterance: vi.fn(() => partialDeferred.promise),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    processor.acceptAudioChunk(createChunk(3, 600, 800));
    processor.acceptAudioChunk(createChunk(4, 800, 1000, false));

    partialDeferred.resolve('late partial');
    await processor.stop();
    await flushMicrotasks();

    const asrEvents = emittedMessages
      .filter((message) => message.type === 'asr.event')
      .map((message) => (message as { event: { type: string; text: string } }).event);

    expect(asrEvents.find((event) => event.type === 'partial')).toBeUndefined();
    expect(asrEvents.find((event) => event.type === 'final')?.text).toBe('frozen final');
  });

  it('reports finalize reason and stale partial drops in transport metrics', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const partialDeferred = createDeferred<string>();
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-metrics',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance: vi.fn(async ({ utteranceIndexStart }) => ({
        events: [],
        nextUtteranceIndex: utteranceIndexStart,
      })),
      transcribePartialUtterance: vi.fn(() => partialDeferred.promise),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    processor.acceptAudioChunk(createChunk(3, 600, 800));
    processor.acceptAudioChunk(createChunk(4, 800, 1000, false));

    partialDeferred.resolve('late partial');
    await processor.stop();
    await flushMicrotasks();

    const metricEvents = emittedMessages.filter(
      (message) => message.type === 'transport.metrics',
    ) as Array<{
      lastFinalizeReason: string | null;
      stalePartialDropCount: number;
      lastPartialAudioMs: number | null;
      lastFinalAudioMs: number | null;
      lastFinalInferenceMs: number | null;
    }>;

    expect(metricEvents.at(-1)).toMatchObject({
      lastFinalizeReason: 'silence',
      stalePartialDropCount: 1,
      lastPartialAudioMs: PARTIAL_INITIAL_TRIGGER_MS,
      lastFinalAudioMs: 800,
    });
    expect(metricEvents.at(-1)?.lastFinalInferenceMs).not.toBeNull();
  });

  it('finalizes the current utterance immediately when a chunk carries a force boundary reason', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const transcribeUtterance = vi.fn(async ({ sessionId, utteranceIndexStart, utterance }) => ({
      events: [
        {
          type: 'final',
          sessionId,
          groupId: utterance.groupId,
          utteranceId: `utt-${utteranceIndexStart}`,
          revision: 1,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
          text: `${utterance.startMs}-${utterance.endMs}`,
        },
      ],
      nextUtteranceIndex: utteranceIndexStart + 1,
    }));
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-force-boundary',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance,
      transcribePartialUtterance: vi.fn(async () => 'preview'),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400, true, false, 'force'));
    processor.acceptAudioChunk(createChunk(2, 400, 600));

    await processor.stop();

    expect(transcribeUtterance).toHaveBeenCalledTimes(2);
    expect(transcribeUtterance.mock.calls[0][0].utterance).toMatchObject({
      startMs: 0,
      endMs: 400,
    });
    expect(transcribeUtterance.mock.calls[1][0].utterance).toMatchObject({
      startMs: 400,
      endMs: 600,
    });

    const finalTexts = emittedMessages
      .filter(
        (message) =>
          message.type === 'asr.event' && (message.event as { type?: string })?.type === 'final',
      )
      .map((message) => (message as { event: { text: string } }).event.text);
    expect(finalTexts).toEqual(['0-400', '400-600']);
  });

  it('discards paused chunks and resumes transcription on later speech only', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const transcribeUtterance = vi.fn(async ({ sessionId, utteranceIndexStart, utterance }) => ({
      events: [
        {
          type: 'final',
          sessionId,
          groupId: utterance.groupId,
          utteranceId: `utt-${utteranceIndexStart}`,
          revision: 1,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
          text: `${utterance.startMs}-${utterance.endMs}`,
        },
      ],
      nextUtteranceIndex: utteranceIndexStart + 1,
    }));
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-pause',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance,
      transcribePartialUtterance: vi.fn(async () => 'preview'),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    await processor.pause();

    processor.acceptAudioChunk(createChunk(1, 200, 400));
    processor.acceptAudioChunk(createChunk(2, 400, 600));

    processor.resume();
    processor.acceptAudioChunk(createChunk(3, 600, 800));
    await processor.stop();

    expect(transcribeUtterance).toHaveBeenCalledTimes(2);
    expect(transcribeUtterance.mock.calls[0][0].utterance).toMatchObject({
      startMs: 0,
      endMs: 200,
    });
    expect(transcribeUtterance.mock.calls[1][0].utterance).toMatchObject({
      startMs: 600,
      endMs: 800,
    });

    const finalTexts = emittedMessages
      .filter(
        (message) => message.type === 'asr.event' && (message.event as { type?: string })?.type === 'final',
      )
      .map((message) => (message as { event: { text: string } }).event.text);
    expect(finalTexts).toEqual(['0-200', '600-800']);
  });

  it('passes recent final-only context into the next final transcription', async () => {
    const transcribeUtterance = vi
      .fn()
      .mockImplementationOnce(async ({ sessionId, utteranceIndexStart, utterance, promptText }) => ({
        events: [
          {
            type: 'final',
            sessionId,
            groupId: utterance.groupId,
            utteranceId: `utt-${utteranceIndexStart}`,
            revision: 1,
            startMs: utterance.startMs,
            endMs: utterance.endMs,
            text: 'first stable final',
          },
        ],
        nextUtteranceIndex: utteranceIndexStart + 1,
        observedPromptText: promptText,
      }))
      .mockImplementationOnce(async ({ sessionId, utteranceIndexStart, utterance, promptText }) => ({
        events: [
          {
            type: 'final',
            sessionId,
            groupId: utterance.groupId,
            utteranceId: `utt-${utteranceIndexStart}`,
            revision: 1,
            startMs: utterance.startMs,
            endMs: utterance.endMs,
            text: 'second stable final',
          },
        ],
        nextUtteranceIndex: utteranceIndexStart + 1,
        observedPromptText: promptText,
      }));
    const partialTranscriber = vi.fn(async ({ promptText }) => promptText ?? 'preview');
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-prompt',
      language: 'en-US',
      emit: vi.fn(),
      transcribeUtterance,
      transcribePartialUtterance: partialTranscriber,
    });

    processor.acceptAudioChunk(createChunk(0, 0, 200));
    processor.acceptAudioChunk(createChunk(1, 200, 400, false));
    processor.acceptAudioChunk(createChunk(2, 400, 600));
    processor.acceptAudioChunk(createChunk(3, 600, 800, false));

    await processor.stop();

    expect(transcribeUtterance).toHaveBeenCalledTimes(2);
    expect(transcribeUtterance.mock.calls[0][0].promptText).toBe('');
    expect(transcribeUtterance.mock.calls[1][0].promptText).toBe('first stable final');
    expect(partialTranscriber.mock.calls.every((call) => call[0].promptText == null)).toBe(true);
  });

  it('emits split finals before end and keeps their groupId shared', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-final-order',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance: vi.fn(async ({ sessionId, utteranceIndexStart, utterance }) => ({
        events: [
          {
            type: 'final',
            sessionId,
            groupId: utterance.groupId,
            utteranceId: `utt-${utteranceIndexStart}`,
            revision: 1,
            startMs: utterance.startMs,
            endMs: utterance.startMs + 400,
            text: 'first split',
          },
          {
            type: 'final',
            sessionId,
            groupId: utterance.groupId,
            utteranceId: `utt-${utteranceIndexStart + 1}`,
            revision: 1,
            startMs: utterance.startMs + 400,
            endMs: utterance.endMs,
            text: 'second split',
          },
        ],
        nextUtteranceIndex: utteranceIndexStart + 2,
      })),
      transcribePartialUtterance: vi.fn(async () => 'preview'),
    });

    processor.acceptAudioChunk(createChunk(0, 0, 400));
    processor.acceptAudioChunk(createChunk(1, 400, 800, false));
    await processor.stop();

    const asrEvents = emittedMessages
      .filter((message) => message.type === 'asr.event')
      .map((message) => (message as { event: { type: string; groupId: string; text: string } }).event);

    expect(asrEvents.map((event) => event.type)).toEqual(['final', 'final', 'end']);
    expect(asrEvents[0]?.groupId).toBe(asrEvents[1]?.groupId);
    expect(asrEvents[0]?.text).toBe('first split');
    expect(asrEvents[1]?.text).toBe('second split');
  });

  it('forces finalization for long continuous speech even without silence chunks', async () => {
    const emittedMessages: Array<Record<string, unknown>> = [];
    const transcribeUtterance = vi.fn(async ({ sessionId, utteranceIndexStart, utterance }) => ({
      events: [
        {
          type: 'final',
          sessionId,
          groupId: utterance.groupId,
          utteranceId: `utt-${utteranceIndexStart}`,
          revision: 1,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
          text: `${utterance.startMs}-${utterance.endMs}`,
        },
      ],
      nextUtteranceIndex: utteranceIndexStart + 1,
    }));
    const processor = new RealtimeSessionProcessor({
      sessionId: 'rt-force-split',
      language: 'en-US',
      emit: (message: Record<string, unknown>) => {
        emittedMessages.push(message);
      },
      transcribeUtterance,
      transcribePartialUtterance: vi.fn(async () => 'preview'),
    });

    let startMs = 0;
    let seq = 0;
    while (startMs < MAX_REALTIME_UTTERANCE_MS + 600) {
      processor.acceptAudioChunk(createChunk(seq, startMs, startMs + 200));
      startMs += 200;
      seq += 1;
    }

    await processor.stop();

    expect(transcribeUtterance).toHaveBeenCalledTimes(2);
    expect(transcribeUtterance.mock.calls[0][0].utterance).toMatchObject({
      startMs: 0,
      endMs: MAX_REALTIME_UTTERANCE_MS,
    });
    expect(transcribeUtterance.mock.calls[1][0].utterance).toMatchObject({
      startMs: MAX_REALTIME_UTTERANCE_MS,
      endMs: MAX_REALTIME_UTTERANCE_MS + 600,
    });

    const finalTexts = emittedMessages
      .filter(
        (message) => message.type === 'asr.event' && (message.event as { type?: string })?.type === 'final',
      )
      .map((message) => (message as { event: { text: string } }).event.text);
    expect(finalTexts).toEqual([
      `0-${MAX_REALTIME_UTTERANCE_MS}`,
      `${MAX_REALTIME_UTTERANCE_MS}-${MAX_REALTIME_UTTERANCE_MS + 600}`,
    ]);
  });
});
