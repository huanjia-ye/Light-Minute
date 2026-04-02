import { render, screen } from '@testing-library/react';
import { TranscriptList } from './TranscriptList';

const measureElement = vi.fn();

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(({ count }: { count: number }) => ({
    getTotalSize: () => count * 148,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * 148,
      })),
    measureElement,
    scrollToIndex: vi.fn(),
  })),
}));

describe('TranscriptList', () => {
  beforeEach(() => {
    measureElement.mockClear();
  });

  it('registers rendered rows for measurement so long transcript bubbles can grow safely', () => {
    render(
      <TranscriptList
        segments={[
          {
            id: 'segment-1',
            startTime: 387,
            endTime: 392,
            text: 'A much longer transcript segment that wraps into multiple lines and should be measured.',
            confidence: 0.96,
          },
          {
            id: 'segment-2',
            startTime: 393,
            endTime: 395,
            text: 'A short reply.',
            confidence: 0.94,
          },
        ]}
        emptyTitle="Empty"
        emptyText="Nothing yet"
        disableAutoScroll
      />,
    );

    const rows = document.querySelectorAll('div[data-index]');

    expect(screen.getByText(/much longer transcript segment/i)).toBeInTheDocument();
    expect(screen.getByText(/a short reply/i)).toBeInTheDocument();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-index', '0');
    expect(rows[1]).toHaveAttribute('data-index', '1');
    expect(measureElement).toHaveBeenCalledTimes(2);
  });
});
