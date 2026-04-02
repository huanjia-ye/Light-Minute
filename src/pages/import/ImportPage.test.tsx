import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { MeetingDetailPage } from '../meeting-detail/MeetingDetailPage';
import { ImportPage } from './ImportPage';
import { defaultSettings, useSettingsStore } from '../../features/settings/store';

describe('import page', () => {
  beforeEach(() => {
    queryClient.clear();
    useSettingsStore.setState({
      settings: {
        ...defaultSettings,
        apiKey: '',
        endpoint: '',
        transcriptionApiKey: '',
        transcriptionEndpoint: '',
        allowDemoFallbacks: true,
      },
    });
  });

  it(
    'shows staged import progress and opens the meeting detail page',
    async () => {
      const file = new File(['fake-audio'], 'upload-check.wav', { type: 'audio/wav' });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/import']}>
            <Routes>
              <Route path="/import" element={<ImportPage />} />
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/preparing upload-check\.wav/i)).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(screen.getByRole('heading', { name: 'upload-check' })).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    },
    12000,
  );
});
