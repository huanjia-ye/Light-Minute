import type { SummaryTemplateId } from './meeting';

export type SummaryProvider = 'openai' | 'custom-openai';
export type LiveTranscriptionLanguage = 'auto' | 'zh-CN' | 'en-US';

export interface AppSettings {
  provider: SummaryProvider;
  model: string;
  transcriptionModel: string;
  transcriptionEndpoint: string;
  transcriptionApiKey: string;
  liveTranscriptionLanguage: LiveTranscriptionLanguage;
  endpoint: string;
  apiKey: string;
  recordingsPath: string;
  micDevice: string;
  templateId: SummaryTemplateId;
  allowDemoFallbacks: boolean;
}
