import { create } from 'zustand';
import type { TranscriptSegment } from '../../types/meeting';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'finalizing' | 'saving' | 'error';

interface RecordingStore {
  status: RecordingStatus;
  activeMeetingTitle: string;
  elapsedSeconds: number;
  segments: TranscriptSegment[];
  errorMessage: string;
  startSession: (title: string) => void;
  appendSegment: (segment: TranscriptSegment) => void;
  setStatus: (status: RecordingStatus, errorMessage?: string) => void;
  updateElapsed: (elapsedSeconds: number) => void;
  resetSession: () => void;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  status: 'idle',
  activeMeetingTitle: '',
  elapsedSeconds: 0,
  segments: [],
  errorMessage: '',
  startSession: (title) =>
    set({
      status: 'recording',
      activeMeetingTitle: title,
      elapsedSeconds: 0,
      segments: [],
      errorMessage: '',
    }),
  appendSegment: (segment) =>
    set((state) => ({
      segments: [...state.segments, segment],
    })),
  setStatus: (status, errorMessage = '') =>
    set({
      status,
      errorMessage,
    }),
  updateElapsed: (elapsedSeconds) =>
    set({
      elapsedSeconds,
    }),
  resetSession: () =>
    set({
      status: 'idle',
      activeMeetingTitle: '',
      elapsedSeconds: 0,
      segments: [],
      errorMessage: '',
    }),
}));
