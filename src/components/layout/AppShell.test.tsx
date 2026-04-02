import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { AppShell } from './AppShell';

describe('app shell', () => {
  beforeEach(() => {
    queryClient.clear();
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

    expect(screen.getByText('StarMinute')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^meeting$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import audio/i })).toBeInTheDocument();
    expect(screen.getByText('Shell content')).toBeInTheDocument();
  });
});
