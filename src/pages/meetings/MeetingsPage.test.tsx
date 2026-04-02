import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { MeetingDetailPage } from '../meeting-detail/MeetingDetailPage';
import { MeetingsPage } from './MeetingsPage';
import { defaultSettings, useSettingsStore } from '../../features/settings/store';

describe('meetings page', () => {
  beforeEach(() => {
    queryClient.clear();
    useSettingsStore.setState({ settings: defaultSettings });
  });

  it(
    'filters meetings and opens a detail page',
    async () => {
      const meetings = [
        {
          id: 'meeting-alpha',
          title: 'Alpha sync',
          createdAt: new Date().toISOString(),
          source: 'recording',
          transcriptOrigin: 'browser-speech',
          durationSeconds: 12,
          segments: [
            {
              id: 'segment-1',
              startTime: 0,
              endTime: 5,
              text: 'We should ship the alpha review tomorrow.',
              confidence: 0.93,
            },
          ],
          summary: null,
        },
        {
          id: 'meeting-beta',
          title: 'Beta retro',
          createdAt: new Date().toISOString(),
          source: 'import',
          transcriptOrigin: 'api',
          durationSeconds: 30,
          segments: [
            {
              id: 'segment-2',
              startTime: 0,
              endTime: 5,
              text: 'Retro notes and bug triage.',
              confidence: 0.92,
            },
          ],
          summary: {
            markdown: '# Beta retro\n\n## Overview\nA concise retro.',
            provider: 'openai',
            model: 'gpt-4.1-mini',
            templateId: 'project-sync',
            prompt: '',
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      window.localStorage.setItem('light-meetily:meetings', JSON.stringify(meetings));

      const user = userEvent.setup();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/meetings']}>
            <Routes>
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Alpha sync')).toBeInTheDocument();
        expect(screen.getByText('Beta retro')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/search meetings/i), 'retro');

      expect(screen.queryByText('Alpha sync')).not.toBeInTheDocument();
      expect(screen.getByText('Beta retro')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /open detail/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Beta retro' })).toBeInTheDocument();
      });
    },
    12000,
  );
});
