import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { MeetingDetailPage } from './MeetingDetailPage';
import { defaultSettings, useSettingsStore } from '../../features/settings/store';
import * as summaryApi from '../../features/summary/api';

describe('meeting detail page', () => {
  beforeEach(() => {
    queryClient.clear();
    useSettingsStore.setState({ settings: defaultSettings });
    vi.restoreAllMocks();
  });

  it(
    'streams and auto-saves a generated summary',
    async () => {
      const meeting = {
        id: 'meeting-summary',
        title: 'Summary meeting',
        createdAt: new Date().toISOString(),
        source: 'recording' as const,
        transcriptOrigin: 'api' as const,
        durationSeconds: 8,
        segments: [
          {
            id: 'segment-1',
            startTime: 0,
            endTime: 4,
            text: 'We agreed to keep the MVP focused on transcript speed and summary quality.',
            confidence: 0.95,
          },
          {
            id: 'segment-2',
            startTime: 5,
            endTime: 8,
            text: 'Next week the team should connect the real backend adapters.',
            confidence: 0.94,
          },
        ],
        summary: null,
      };

      window.localStorage.setItem('light-meetily:meetings', JSON.stringify([meeting]));

      const user = userEvent.setup();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/meetings/${meeting.id}`]}>
            <Routes>
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Summary meeting')).toBeInTheDocument();
        expect(screen.getByText('2 segments')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /generate summary/i }));

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /stop generation/i })).toBeInTheDocument();
          expect(screen.getByText('Generating draft')).toBeInTheDocument();
        },
        { timeout: 4000 },
      );

      await waitFor(
        () => {
          const savedMeetings = JSON.parse(
            window.localStorage.getItem('light-meetily:meetings') ?? '[]',
          );
          expect(savedMeetings[0]?.summary?.markdown).toContain('## Overview');
          expect(screen.queryByText('Synced')).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      const savedMeetings = JSON.parse(window.localStorage.getItem('light-meetily:meetings') ?? '[]');
      expect(savedMeetings[0]?.summary?.markdown).toContain('## Overview');

      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');
      await user.click(screen.getByRole('button', { name: /^copy$/i }));
      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('## Overview'));
    },
    12000,
  );

  it(
    'auto-generates a summary when navigated from an imported audio flow',
    async () => {
      const meeting = {
        id: 'meeting-auto-summary',
        title: 'Imported meeting',
        createdAt: new Date().toISOString(),
        source: 'import' as const,
        transcriptOrigin: 'api' as const,
        durationSeconds: 10,
        segments: [
          {
            id: 'segment-1',
            startTime: 0,
            endTime: 4,
            text: 'The imported audio should immediately open a meeting and start generating a summary.',
            confidence: 0.94,
          },
        ],
        summary: null,
      };

      window.localStorage.setItem('light-meetily:meetings', JSON.stringify([meeting]));

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter
            initialEntries={[
              {
                pathname: `/meetings/${meeting.id}`,
                state: { autoGenerateSummary: true, importedFromAudio: true },
              },
            ]}
          >
            <Routes>
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(
        () => {
          expect(screen.getByText('Overview')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    },
    12000,
  );

  it(
    'stops generation and auto-saves the current draft',
    async () => {
      vi.spyOn(summaryApi, 'generateMeetingSummary').mockImplementation(
        async (meeting, settings, customPrompt, options = {}) => {
          let markdown = '';
          const chunks = [
            `# ${meeting.title}\n\n`,
            '## Overview\n',
            'Partial draft content before stopping.\n',
            '## Follow-up Notes\nThis chunk should never be reached.\n',
          ];
          const delays = [220, 220, 220, 900];

          for (const [index, chunk] of chunks.entries()) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, delays[index]);
            });

            if (options.signal?.aborted) {
              throw new DOMException('The operation was aborted.', 'AbortError');
            }

            markdown += chunk;
            options.onProgress?.(markdown);
          }

          return {
            markdown,
            provider: settings.provider,
            model: settings.model,
            templateId: settings.templateId,
            prompt: customPrompt,
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        },
      );

      const meeting = {
        id: 'meeting-stop-summary',
        title: 'Stop summary meeting',
        createdAt: new Date().toISOString(),
        source: 'recording' as const,
        transcriptOrigin: 'api' as const,
        durationSeconds: 16,
        segments: [
          {
            id: 'segment-1',
            startTime: 0,
            endTime: 8,
            text: 'We agreed to keep the first version reliable and stream summary text into the editor as it arrives.',
            confidence: 0.95,
          },
          {
            id: 'segment-2',
            startTime: 8,
            endTime: 16,
            text: 'The team should stop generation midway if needed and keep the partial draft for later editing.',
            confidence: 0.94,
          },
        ],
        summary: null,
      };

      window.localStorage.setItem('light-meetily:meetings', JSON.stringify([meeting]));

      const user = userEvent.setup();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/meetings/${meeting.id}`]}>
            <Routes>
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Stop summary meeting')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /generate summary/i }));

      await waitFor(
        () => {
          expect(screen.getByText('Generating draft')).toBeInTheDocument();
          expect(screen.getByRole('button', { name: /stop generation/i })).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      await waitFor(
        () => {
          expect(screen.getByText('Partial draft content before stopping.')).toBeInTheDocument();
          expect(screen.getByRole('button', { name: /stop generation/i })).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      await user.click(screen.getByRole('button', { name: /stop generation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate summary/i })).toBeInTheDocument();
      });

      await waitFor(
        () => {
          const savedMeetings = JSON.parse(
            window.localStorage.getItem('light-meetily:meetings') ?? '[]',
          );
          expect(savedMeetings[0]?.summary?.markdown.length).toBeGreaterThan(0);
          expect(screen.queryByText('Synced')).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      const savedMeetings = JSON.parse(window.localStorage.getItem('light-meetily:meetings') ?? '[]');
      expect(savedMeetings[0]?.summary?.markdown.length).toBeGreaterThan(0);
      expect(savedMeetings[0]?.summary?.markdown).not.toContain('## Follow-up Notes');
    },
    12000,
  );

  it('recovers a local draft and restores the saved summary on demand', async () => {
    const meeting = {
      id: 'meeting-recover-summary',
      title: 'Recover summary meeting',
      createdAt: new Date().toISOString(),
      source: 'recording' as const,
      transcriptOrigin: 'api' as const,
      durationSeconds: 9,
      segments: [
        {
          id: 'segment-1',
          startTime: 0,
          endTime: 9,
          text: 'The team reviewed the existing summary and wanted to keep a draft across reloads.',
          confidence: 0.95,
        },
      ],
      summary: {
        markdown: '# Recover summary meeting\n\n## Overview\nSaved summary content.',
        provider: 'openai' as const,
        model: 'gpt-4.1-mini',
        templateId: 'standard-meeting' as const,
        prompt: '',
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    window.localStorage.setItem('light-meetily:meetings', JSON.stringify([meeting]));
    window.localStorage.setItem(
      `light-meetily:summary-draft:${meeting.id}`,
      JSON.stringify({
        markdown: '# Recover summary meeting\n\n## Overview\nRecovered local draft content.',
        updatedAt: new Date().toISOString(),
        source: 'manual',
        baseSummaryMarkdown: meeting.summary.markdown,
      }),
    );

    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/meetings/${meeting.id}`]}>
          <Routes>
            <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Recover summary meeting').length).toBeGreaterThan(0);
      expect(screen.getByText('Local draft')).toBeInTheDocument();
      expect(screen.getByText(/recovered a locally saved draft/i)).toBeInTheDocument();
      expect(screen.getByText('Recovered local draft content.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /restore saved/i }));

      await waitFor(() => {
        expect(screen.getByText('Saved summary content.')).toBeInTheDocument();
        expect(screen.queryByText('Synced')).not.toBeInTheDocument();
        expect(screen.queryByText('Recovered local draft content.')).not.toBeInTheDocument();
      });

    expect(window.localStorage.getItem(`light-meetily:summary-draft:${meeting.id}`)).toBeNull();
  });

  it(
    'forces preview-only mode during generation until the user stops it',
    async () => {
      vi.spyOn(summaryApi, 'generateMeetingSummary').mockImplementation(
        async (meeting, settings, customPrompt, options = {}) => {
          let markdown = '';
          const chunks = [
            `# ${meeting.title}\n\n`,
            '## Overview\n',
            'Streaming draft content.\n',
            '## Follow-up Notes\nThis chunk should never be reached.\n',
          ];
          const delays = [200, 200, 200, 900];

          for (const [index, chunk] of chunks.entries()) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, delays[index]);
            });

            if (options.signal?.aborted) {
              throw new DOMException('The operation was aborted.', 'AbortError');
            }

            markdown += chunk;
            options.onProgress?.(markdown);
          }

          return {
            markdown,
            provider: settings.provider,
            model: settings.model,
            templateId: settings.templateId,
            prompt: customPrompt,
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        },
      );

      const meeting = {
        id: 'meeting-preview-lock',
        title: 'Preview lock meeting',
        createdAt: new Date().toISOString(),
        source: 'recording' as const,
        transcriptOrigin: 'api' as const,
        durationSeconds: 12,
        segments: [
          {
            id: 'segment-1',
            startTime: 0,
            endTime: 12,
            text: 'The editor should lock to preview mode during summary generation and only allow editing after stop.',
            confidence: 0.95,
          },
        ],
        summary: {
          markdown: '# Preview lock meeting\n\n## Overview\nExisting saved summary.',
          provider: 'openai' as const,
          model: 'gpt-4.1-mini',
          templateId: 'standard-meeting' as const,
          prompt: '',
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      window.localStorage.setItem('light-meetily:meetings', JSON.stringify([meeting]));

      const user = userEvent.setup();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/meetings/${meeting.id}`]}>
            <Routes>
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText('Preview lock meeting').length).toBeGreaterThan(0);
        expect(screen.getByText('Existing saved summary.')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /generate summary/i }));

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /stop generation/i })).toBeInTheDocument();
          expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
          expect(screen.getByRole('button', { name: /^edit$/i })).toBeDisabled();
        },
        { timeout: 3000 },
      );

      await user.click(screen.getByRole('button', { name: /stop generation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate summary/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    },
    12000,
  );
});
