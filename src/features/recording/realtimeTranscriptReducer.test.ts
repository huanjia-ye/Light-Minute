import { applyAsrEventToTranscript, createEmptyTranscriptModel, transcriptModelToLegacySegments } from './realtimeTranscriptReducer';

describe('realtime transcript reducer', () => {
  it('replaces partials only when revision increases', () => {
    const base = createEmptyTranscriptModel();
    const partialV1 = applyAsrEventToTranscript(base, {
      type: 'partial',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'utt-1',
      revision: 1,
      startMs: 0,
      endMs: 500,
      text: 'hello',
    });
    const partialV0 = applyAsrEventToTranscript(partialV1, {
      type: 'partial',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'utt-1',
      revision: 1,
      startMs: 0,
      endMs: 400,
      text: 'ignored',
    });

    expect(partialV0.activePartial?.text).toBe('hello');
  });

  it('inserts final segments in timestamp order instead of append order', () => {
    const base = createEmptyTranscriptModel();
    const next = applyAsrEventToTranscript(
      applyAsrEventToTranscript(base, {
        type: 'final',
        sessionId: 'rt-1',
        groupId: 'grp-2',
        utteranceId: 'utt-2',
        revision: 2,
        startMs: 1000,
        endMs: 1400,
        text: 'second',
      }),
      {
        type: 'final',
        sessionId: 'rt-1',
        groupId: 'grp-1',
        utteranceId: 'utt-1',
        revision: 1,
        startMs: 0,
        endMs: 800,
        text: 'first',
      },
    );

    expect(next.finalSegments.map((segment) => segment.text)).toEqual(['first', 'second']);
  });

  it('clears active partial on end and keeps only final segments for persistence', () => {
    const partial = applyAsrEventToTranscript(createEmptyTranscriptModel(), {
      type: 'partial',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'utt-1',
      revision: 1,
      startMs: 0,
      endMs: 500,
      text: 'tail',
    });
    const ended = applyAsrEventToTranscript(partial, {
      type: 'end',
      sessionId: 'rt-1',
      groupId: 'end',
      utteranceId: 'end',
      revision: 0,
      startMs: 500,
      endMs: 500,
      text: '',
    });

    expect(ended.activePartial).toBeNull();
    expect(transcriptModelToLegacySegments(ended)).toEqual([]);
  });

  it('clears the active partial when a split final shares the same groupId', () => {
    const partial = applyAsrEventToTranscript(createEmptyTranscriptModel(), {
      type: 'partial',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'grp-1',
      revision: 2,
      startMs: 0,
      endMs: 1600,
      text: 'partial utterance',
    });

    const finalized = applyAsrEventToTranscript(partial, {
      type: 'final',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'utt-9',
      revision: 1,
      startMs: 0,
      endMs: 800,
      text: 'final split',
    });

    expect(finalized.activePartial).toBeNull();
    expect(finalized.finalSegments.map((segment) => segment.text)).toEqual(['final split']);
  });

  it('ignores duplicate partial text for the same group', () => {
    const partial = applyAsrEventToTranscript(createEmptyTranscriptModel(), {
      type: 'partial',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'grp-1',
      revision: 1,
      startMs: 0,
      endMs: 800,
      text: 'steady text',
    });

    const duplicateText = applyAsrEventToTranscript(partial, {
      type: 'partial',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'grp-1',
      revision: 2,
      startMs: 0,
      endMs: 1200,
      text: 'steady text',
    });

    expect(duplicateText).toBe(partial);
  });

  it('dedupes repeated final text when timing is effectively identical', () => {
    const withFirstFinal = applyAsrEventToTranscript(createEmptyTranscriptModel(), {
      type: 'final',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'utt-1',
      revision: 1,
      startMs: 33000,
      endMs: 37800,
      text: 'I usually wake up around 7 am',
    });

    const withDuplicateFinal = applyAsrEventToTranscript(withFirstFinal, {
      type: 'final',
      sessionId: 'rt-1',
      groupId: 'grp-2',
      utteranceId: 'utt-2',
      revision: 1,
      startMs: 33040,
      endMs: 37820,
      text: 'I usually wake up around 7 am',
    });

    expect(withDuplicateFinal.finalSegments).toHaveLength(1);
    expect(withDuplicateFinal.finalSegments[0]?.text).toBe('I usually wake up around 7 am');
  });

  it('keeps separate final segments when the repeated text has different timing', () => {
    const withFirstFinal = applyAsrEventToTranscript(createEmptyTranscriptModel(), {
      type: 'final',
      sessionId: 'rt-1',
      groupId: 'grp-1',
      utteranceId: 'utt-1',
      revision: 1,
      startMs: 33000,
      endMs: 33800,
      text: 'Hi',
    });

    const withSecondFinal = applyAsrEventToTranscript(withFirstFinal, {
      type: 'final',
      sessionId: 'rt-1',
      groupId: 'grp-2',
      utteranceId: 'utt-2',
      revision: 1,
      startMs: 34500,
      endMs: 35200,
      text: 'Hi',
    });

    expect(withSecondFinal.finalSegments).toHaveLength(2);
  });
});
