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
          expect(screen.getByRole('heading', { name: /Light-Minute Sync/i })).toBeInTheDocument();
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

  it('shows realtime diagnostics and non-fatal warnings during an active session', () => {
    useSettingsStore.setState({
      settings: {
        ...defaultSettings,
        liveTranscriptionRoute: 'realtime-only',
      },
    });
    useRecordingStore.setState({
      status: 'recording',
      activeMeetingTitle: 'Diagnostics check',
      elapsedSeconds: 12,
      session: {
        sessionId: 'rt-diag',
        engineMode: 'local-whisper-stream',
        language: 'en-US',
        startedAt: new Date().toISOString(),
        status: 'running',
      },
      transportStatus: 'open',
      sessionCapabilities: {
        supportsPartials: true,
        supportsFinals: true,
        acceptedLanguage: 'en-US',
      },
      transportMetrics: {
        lastAcceptedSeq: 14,
        queueDepth: 1,
        bufferedMs: 400,
        lastPartialAudioMs: 2000,
        lastPartialInferenceMs: 4100,
        lastPartialEmitLatencyMs: 2500,
        stalePartialDropCount: 3,
        lastFinalizeReason: 'force',
        lastFinalAudioMs: 5000,
        lastFinalInferenceMs: 8600,
        lastFinalEmitLatencyMs: 3600,
      },
      lastWarning: {
        source: 'asr',
        message: 'Partial preview is temporarily unavailable. Final transcription will continue.',
        recoverable: true,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('recording-warning')).toHaveTextContent(
      'asr: Partial preview is temporarily unavailable. Final transcription will continue.',
    );
    expect(screen.getByText(/Light-Minute realtime whisper \| Realtime only/i)).toBeInTheDocument();
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Session: en-US');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Route: Realtime only');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Engine: local-whisper-stream');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Partials: On');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Queue: 1');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Buffered: 400ms');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Seq: 14');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent(
      'P: 4.1s infer / 2.0s audio / 2.5s emit',
    );
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent(
      'F: 8.6s infer / 5.0s audio / 3.6s emit',
    );
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Split: force');
    expect(screen.getByTestId('realtime-diagnostics')).toHaveTextContent('Stale partials: 3');
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


