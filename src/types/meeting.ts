
export type MeetingSource = 'recording' | 'import';

export type SummaryTemplateId = 'standard-meeting' | 'project-sync';

export type TranscriptOrigin =
  | 'browser-speech'
  | 'api'
  | 'local-whisper'
  | 'local-parakeet'
  | 'mock';

//转写片段
export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

//摘要结构
export interface MeetingSummary {
  markdown: string;
  provider: 'openai' | 'custom-openai';
  model: string;
  templateId: SummaryTemplateId;
  prompt: string;
  generatedAt: string;
  updatedAt: string;
}

//完整会议记录
export interface MeetingRecord {
  id: string;
  title: string;
  createdAt: string;
  source: MeetingSource;
  transcriptOrigin: TranscriptOrigin;
  durationSeconds: number;
  audioFileName?: string;
  segments: TranscriptSegment[];
  summary: MeetingSummary | null;
}
