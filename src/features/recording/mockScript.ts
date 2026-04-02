import type { TranscriptSegment } from '../../types/meeting';
import { createId } from '../../lib/storage';

const SCRIPT_LINES = [
  { seconds: 4, text: 'Thanks everyone for joining. Today we need to align on the lightweight StarMinute MVP.', confidence: 0.97 },
  { seconds: 10, text: 'The goal is to keep real-time transcription fast while still shipping a polished AI summary flow.', confidence: 0.96 },
  { seconds: 18, text: 'For the first release we will focus on microphone-only recording and postpone system audio mixing.', confidence: 0.95 },
  { seconds: 28, text: 'The frontend will move to Vite, React Router, Zustand and Sass modules so the structure stays simple.', confidence: 0.95 },
  { seconds: 38, text: 'On the summary side we agreed that OpenAI and Custom OpenAI are enough for the MVP provider layer.', confidence: 0.94 },
  { seconds: 50, text: 'Imported audio should still work so users can process existing recordings without joining a live call.', confidence: 0.93 },
  { seconds: 63, text: 'We also agreed to keep a lightweight editable summary view instead of rebuilding the full rich text stack.', confidence: 0.94 },
  { seconds: 77, text: 'Next week we should finish the home page, meeting detail page, settings flow and the recording state machine.', confidence: 0.92 },
  { seconds: 92, text: 'Once recording, saving and summary generation feel reliable, we can ship the first resume-ready version.', confidence: 0.93 },
];

export function buildMockRecordingScript(): TranscriptSegment[] {
  return SCRIPT_LINES.map((segment, index) => ({
    id: createId(`segment-${index}`),
    startTime: segment.seconds,
    endTime: segment.seconds + 4,
    text: segment.text,
    confidence: segment.confidence,
  }));
}

export function buildImportedAudioScript(fileName: string): TranscriptSegment[] {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const lines = [
    `Imported audio "${baseName}" was added to StarMinute for offline processing.`,
    'The discussion focused on scope control, transcript quality and a practical MVP delivery plan.',
    'The team decided to keep the lightweight version centered around recording, meeting history and AI summary generation.',
    'One action item is to wire the real backend adapters after the frontend flow is fully stable.',
    'Another action item is to polish the summary editor so manual edits feel quick and predictable.',
  ];

  return lines.map((text, index) => ({
    id: createId(`import-${index}`),
    startTime: index * 8,
    endTime: index * 8 + 5,
    text,
    confidence: 0.9,
  }));
}
