import { createId, readStorage, sleep, writeStorage } from '../../lib/storage';
import type {
  MeetingRecord,
  MeetingSummary,
  TranscriptOrigin,
  TranscriptSegment,
} from '../../types/meeting';
import type { AppSettings } from '../../types/settings';
import { analyzeImportedAudio } from '../recording/audioImportAnalysis';

const MEETINGS_KEY = 'light-minute:meetings';
const LEGACY_MEETINGS_KEY = 'light-meetily:meetings';

export interface AudioImportProgress {
  stage: 'uploading' | 'analyzing' | 'saving' | 'opening';
  message: string;
}

interface CreateMeetingInput {
  title: string;
  source: 'recording' | 'import';
  transcriptOrigin: TranscriptOrigin;
  segments: TranscriptSegment[];
  durationSeconds: number;
  audioFileName?: string;
}

function loadMeetings() {
  const meetings = readStorage<MeetingRecord[]>(
    MEETINGS_KEY,
    readStorage<MeetingRecord[]>(LEGACY_MEETINGS_KEY, []),
  );
  return meetings.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function saveMeetings(meetings: MeetingRecord[]) {
  writeStorage(MEETINGS_KEY, meetings);
}

export async function getMeetings() {
  await sleep(150);
  return loadMeetings();
}

export async function getMeetingById(meetingId: string) {
  await sleep(120);
  return loadMeetings().find((meeting) => meeting.id === meetingId) ?? null;
}

export async function createMeeting(input: CreateMeetingInput) {
  await sleep(450);

  const nextMeeting: MeetingRecord = {
    id: createId('meeting'),
    title: input.title,
    createdAt: new Date().toISOString(),
    source: input.source,
    transcriptOrigin: input.transcriptOrigin,
    durationSeconds: input.durationSeconds,
    audioFileName: input.audioFileName,
    segments: input.segments,
    summary: null,
  };

  const meetings = loadMeetings();
  saveMeetings([nextMeeting, ...meetings]);

  return nextMeeting;
}

export async function updateMeetingSummary(meetingId: string, summary: MeetingSummary) {
  await sleep(200);

  const meetings = loadMeetings();
  const updatedMeetings = meetings.map((meeting) =>
    meeting.id === meetingId
      ? {
          ...meeting,
          summary,
        }
      : meeting,
  );

  saveMeetings(updatedMeetings);
  return updatedMeetings.find((meeting) => meeting.id === meetingId) ?? null;
}

export async function importAudioAsMeeting(
  file: File,
  settings: AppSettings,
  options?: {
    onStageChange?: (progress: AudioImportProgress) => void;
  },
) {
  options?.onStageChange?.({
    stage: 'uploading',
    message: `Preparing ${file.name} for local analysis...`,
  });

  const analysis = await analyzeImportedAudio(file, settings, {
    onStatusChange: (status) => {
      options?.onStageChange?.({
        stage: 'analyzing',
        message: status.message,
      });
    },
  });

  options?.onStageChange?.({
    stage: 'saving',
    message: 'Saving the imported transcript as a meeting...',
  });

  const meeting = await createMeeting({
    title: file.name.replace(/\.[^.]+$/, ''),
    source: 'import',
    transcriptOrigin: analysis.mode,
    segments: analysis.segments,
    durationSeconds: analysis.durationSeconds,
    audioFileName: file.name,
  });

  options?.onStageChange?.({
    stage: 'opening',
    message: 'Opening the imported meeting workspace...',
  });

  return meeting;
}
