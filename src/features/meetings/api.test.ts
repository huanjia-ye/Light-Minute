import { defaultSettings } from '../settings/store';
import { createMeeting, getMeetingById, getMeetings, importAudioAsMeeting, updateMeetingSummary } from './api';

describe('meetings api', () => {
  it('creates and retrieves meetings from local storage', async () => {
    const meeting = await createMeeting({
      title: 'Demo sync',
      source: 'recording',
      transcriptOrigin: 'browser-speech',
      segments: [
        {
          id: 'segment-1',
          startTime: 0,
          endTime: 4,
          text: 'Demo transcript line.',
          confidence: 0.95,
        },
      ],
      durationSeconds: 4,
    });

    const meetings = await getMeetings();
    const fromById = await getMeetingById(meeting.id);

    expect(meetings).toHaveLength(1);
    expect(meetings[0].title).toBe('Demo sync');
    expect(fromById?.id).toBe(meeting.id);
  });

  it('imports audio and persists generated summary', async () => {
    const file = new File(['fake-audio'], 'product-sync.wav', { type: 'audio/wav' });
    const imported = await importAudioAsMeeting(file, {
      ...defaultSettings,
      apiKey: '',
      endpoint: '',
      transcriptionApiKey: '',
      transcriptionEndpoint: '',
      allowDemoFallbacks: true,
    });

    const updated = await updateMeetingSummary(imported.id, {
      markdown: '# product-sync\n\n## Overview\nImported summary.',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      templateId: 'project-sync',
      prompt: 'Keep it concise',
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(imported.source).toBe('import');
    expect(imported.transcriptOrigin).toBe('mock');
    expect(imported.audioFileName).toBe('product-sync.wav');
    expect(updated?.summary?.provider).toBe('openai');
    expect(updated?.summary?.markdown).toContain('Overview');
  });
});
