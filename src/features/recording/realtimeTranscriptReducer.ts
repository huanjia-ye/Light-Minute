import type { TranscriptSegment } from '../../types/meeting';
import type { AsrEvent, FinalTranscriptSegment, TranscriptDisplayState, TranscriptModel } from './realtimeTypes';

function normalizeText(text: string) {
  return text.trim();
}

function isDuplicateFinalSegment(
  existingSegment: FinalTranscriptSegment,
  nextSegment: FinalTranscriptSegment,
) {
  const normalizedExistingText = normalizeText(existingSegment.text);
  const normalizedNextText = normalizeText(nextSegment.text);

  if (!normalizedExistingText || normalizedExistingText !== normalizedNextText) {
    return false;
  }

  return (
    Math.abs(existingSegment.startMs - nextSegment.startMs) <= 250 &&
    Math.abs(existingSegment.endMs - nextSegment.endMs) <= 250
  );
}

function compareFinalSegments(left: FinalTranscriptSegment, right: FinalTranscriptSegment) {
  if (left.startMs !== right.startMs) {
    return left.startMs - right.startMs;
  }

  if (left.endMs !== right.endMs) {
    return left.endMs - right.endMs;
  }

  return 0;
}

function buildDisplayText(transcript: TranscriptModel) {
  const stableText = transcript.finalSegments
    .map((segment) => normalizeText(segment.text))
    .filter(Boolean)
    .join('\n');
  const partialText = transcript.activePartial ? normalizeText(transcript.activePartial.text) : '';

  if (stableText && partialText) {
    return `${stableText}\n${partialText}`;
  }

  return stableText || partialText;
}

function insertFinalSegment(
  finalSegments: FinalTranscriptSegment[],
  nextSegment: FinalTranscriptSegment,
) {
  const existingIndex = finalSegments.findIndex((segment) => segment.utteranceId === nextSegment.utteranceId);
  if (existingIndex >= 0) {
    return finalSegments;
  }

  if (finalSegments.some((segment) => isDuplicateFinalSegment(segment, nextSegment))) {
    return finalSegments;
  }

  const nextSegments = [...finalSegments, nextSegment];
  nextSegments.sort(compareFinalSegments);
  return nextSegments;
}

export function createEmptyTranscriptModel(): TranscriptModel {
  return {
    finalSegments: [],
    activePartial: null,
    displayText: '',
  };
}

export function createFinalTranscriptSegmentFromAsrEvent(event: AsrEvent): FinalTranscriptSegment {
  return {
    id: `${event.sessionId}:${event.utteranceId}`,
    sessionId: event.sessionId,
    groupId: event.groupId,
    utteranceId: event.utteranceId,
    startMs: event.startMs,
    endMs: event.endMs,
    text: event.text,
  };
}

export function applyAsrEventToTranscript(transcript: TranscriptModel, event: AsrEvent): TranscriptModel {
  switch (event.type) {
    case 'partial': {
      if (
        transcript.activePartial &&
        transcript.activePartial.groupId === event.groupId &&
        (
          transcript.activePartial.revision >= event.revision ||
          normalizeText(transcript.activePartial.text) === normalizeText(event.text)
        )
      ) {
        return transcript;
      }

      const nextTranscript = {
        ...transcript,
        activePartial: event,
      };

      return {
        ...nextTranscript,
        displayText: buildDisplayText(nextTranscript),
      };
    }
    case 'final': {
      const nextSegment = createFinalTranscriptSegmentFromAsrEvent(event);
      const nextTranscript = {
        ...transcript,
        activePartial:
          transcript.activePartial?.groupId === event.groupId ? null : transcript.activePartial,
        finalSegments: insertFinalSegment(transcript.finalSegments, nextSegment),
      };

      return {
        ...nextTranscript,
        displayText: buildDisplayText(nextTranscript),
      };
    }
    case 'end': {
      const nextTranscript = {
        ...transcript,
        activePartial: null,
      };

      return {
        ...nextTranscript,
        displayText: buildDisplayText(nextTranscript),
      };
    }
    case 'error':
    default:
      return transcript;
  }
}

export function appendLegacyFinalSegmentToTranscript(
  transcript: TranscriptModel,
  sessionId: string,
  segment: TranscriptSegment,
) {
  const nextSegment: FinalTranscriptSegment = {
    id: segment.id,
    sessionId,
    groupId: segment.id,
    utteranceId: segment.id,
    startMs: segment.startTime * 1000,
    endMs: segment.endTime * 1000,
    text: segment.text,
  };

  const nextTranscript = {
    ...transcript,
    finalSegments: insertFinalSegment(transcript.finalSegments, nextSegment),
    activePartial: null,
  };

  return {
    ...nextTranscript,
    displayText: buildDisplayText(nextTranscript),
  };
}

export function transcriptModelToLegacySegments(transcript: TranscriptModel): TranscriptSegment[] {
  const stableSegments = finalTranscriptSegmentsToLegacySegments(transcript.finalSegments);

  if (!transcript.activePartial || !normalizeText(transcript.activePartial.text)) {
    return stableSegments;
  }

  return [
    ...stableSegments,
    {
      id: `partial:${transcript.activePartial.sessionId}:${transcript.activePartial.utteranceId}:${transcript.activePartial.revision}`,
      startTime: Math.max(0, Math.round(transcript.activePartial.startMs / 1000)),
      endTime: Math.max(0, Math.round(transcript.activePartial.endMs / 1000)),
      text: transcript.activePartial.text,
      confidence: 0,
    },
  ];
}

export function finalTranscriptSegmentsToLegacySegments(
  finalSegments: FinalTranscriptSegment[],
): TranscriptSegment[] {
  return finalSegments.map((segment) => ({
    id: segment.id,
    startTime: Math.max(0, Math.round(segment.startMs / 1000)),
    endTime: Math.max(0, Math.round(segment.endMs / 1000)),
    text: segment.text,
    confidence: 0.9,
  }));
}

export function getTranscriptDisplayState(transcript: TranscriptModel): TranscriptDisplayState {
  if (transcript.activePartial) {
    return 'partial';
  }

  if (transcript.finalSegments.length > 0) {
    return 'stable';
  }

  return 'empty';
}
