import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { AppShell } from './AppShell';
import { useRecordingStore } from '../../features/recording/store';

describe('app shell', () => {
  beforeEach(() => {
    queryClient.clear();
    useRecordingStore.getState().resetSession();
  });

  it('renders the shell without entering a store selector loop', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>Shell content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Light-Minute')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^meeting$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import audio/i })).toBeInTheDocument();
    expect(screen.getByText('Shell content')).toBeInTheDocument();
  });

  it('surfaces recording errors in the shell status card', () => {
    useRecordingStore.setState({
      status: 'error',
      errorMessage: 'Local realtime whisper backend is not reachable.',
      lastError: {
        source: 'transport',
        message: 'Local realtime whisper backend is not reachable.',
        recoverable: true,
      },
      transportStatus: 'error',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>Shell content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Recording error')).toBeInTheDocument();
    expect(screen.getByText('Local realtime whisper backend is not reachable.')).toBeInTheDocument();
    expect(screen.getByText('transport')).toBeInTheDocument();
  });

  it('surfaces non-fatal recording warnings without switching into error mode', () => {
    useRecordingStore.setState({
      status: 'recording',
      activeMeetingTitle: 'Design sync',
      transportStatus: 'open',
      sessionCapabilities: {
        supportsPartials: true,
        supportsFinals: true,
        acceptedLanguage: 'en-US',
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
            <Route element={<AppShell />}>
              <Route index element={<div>Shell content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Recording now')).toBeInTheDocument();
    expect(screen.getByText('open · en-US')).toBeInTheDocument();
    expect(
      screen.getByText('asr: Partial preview is temporarily unavailable. Final transcription will continue.'),
    ).toBeInTheDocument();
  });
});


