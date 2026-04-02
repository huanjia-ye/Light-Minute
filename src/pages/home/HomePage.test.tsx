import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { HomePage } from './HomePage';
import { MeetingDetailPage } from '../meeting-detail/MeetingDetailPage';
import { useRecordingStore } from '../../features/recording/store';
import { defaultSettings, useSettingsStore } from '../../features/settings/store';

describe('home page', () => {
  beforeEach(() => {
    queryClient.clear();
    useRecordingStore.getState().resetSession();
    useSettingsStore.setState({ settings: defaultSettings });
  });

  it(
    'renders and completes the mock recording flow into meeting detail',
    async () => {
      const user = userEvent.setup();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /capture your/i,
        }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /start recording/i }));

      await waitFor(
        () => {
          expect(useRecordingStore.getState().segments.length).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );

      await user.click(screen.getByRole('button', { name: /stop & save/i }));

      await waitFor(
        () => {
          expect(screen.getByRole('heading', { name: /StarMinute Sync/i })).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    },
    12000,
  );

  it('switches recording controls between pause and resume states', async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /start recording/i }));

    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop & save/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /pause/i }));

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it(
    'imports an audio file into the same meeting detail flow',
    async () => {
      useSettingsStore.setState({
        settings: {
          ...defaultSettings,
          endpoint: '',
          transcriptionEndpoint: '',
          allowDemoFallbacks: true,
        },
      });

      const file = new File(['fake-audio'], 'customer-sync.wav', { type: 'audio/wav' });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const input = container.querySelector('#audioImport') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(screen.getByRole('heading', { name: 'customer-sync' })).toBeInTheDocument();
        },
        { timeout: 4000 },
      );
    },
    12000,
  );
});
