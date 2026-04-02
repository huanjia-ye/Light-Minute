import { defaultSettings, normalizeSettings } from './store';

describe('settings normalization', () => {
  it('fills newly added settings fields when older saved data is missing them', () => {
    const normalized = normalizeSettings({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      transcriptionModel: 'whisper-1',
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'demo-key',
      recordingsPath: 'C:/Recordings/light-meetily',
      micDevice: 'Default microphone',
      templateId: 'standard-meeting',
    });

    expect(normalized.transcriptionEndpoint).toBe(defaultSettings.transcriptionEndpoint);
    expect(normalized.transcriptionApiKey).toBe(defaultSettings.transcriptionApiKey);
    expect(normalized.liveTranscriptionLanguage).toBe(defaultSettings.liveTranscriptionLanguage);
    expect(normalized.allowDemoFallbacks).toBe(defaultSettings.allowDemoFallbacks);
  });
});
