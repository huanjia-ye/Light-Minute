import { defaultSettings } from '../settings/store';
import { generateMeetingSummary } from './api';

const baseMeeting = {
  id: 'meeting-stream',
  title: 'Streaming summary',
  createdAt: new Date().toISOString(),
  source: 'recording' as const,
  transcriptOrigin: 'api' as const,
  durationSeconds: 12,
  segments: [
    {
      id: 'segment-1',
      startTime: 0,
      endTime: 6,
      text: 'We agreed to keep the editor simple today and ship streaming output first.',
      confidence: 0.95,
    },
    {
      id: 'segment-2',
      startTime: 6,
      endTime: 12,
      text: 'Next week we should add richer formatting after autosave and stop generation are stable.',
      confidence: 0.94,
    },
  ],
  summary: null,
};

describe('summary api', () => {
  it('streams demo fallback markdown progressively before resolving', async () => {
    const progressUpdates: string[] = [];

    const summaryPromise = generateMeetingSummary(baseMeeting, defaultSettings, '', {
      onProgress: (markdown) => {
        progressUpdates.push(markdown);
      },
    });

    const summary = await summaryPromise;

    expect(progressUpdates.length).toBeGreaterThan(1);
    expect(progressUpdates[0].length).toBeGreaterThan(0);
    expect(progressUpdates[0].length).toBeLessThan(progressUpdates.at(-1)?.length ?? 0);
    expect(progressUpdates.at(-1)).toBe(summary.markdown);
    expect(summary.markdown).toContain('## Overview');
  });

  it('supports aborting a streaming summary request', async () => {
    const abortController = new AbortController();

    const summaryPromise = generateMeetingSummary(baseMeeting, defaultSettings, '', {
      onProgress: vi.fn(),
      signal: abortController.signal,
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 120);
    });
    abortController.abort();

    await expect(summaryPromise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
