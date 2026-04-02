import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TranscriptSegment } from '../../types/meeting';
import { formatTimestamp } from '../../lib/format';

interface TranscriptListProps {
  segments: TranscriptSegment[];
  emptyTitle: string;
  emptyText: string;
  footerNote?: string;
  disableAutoScroll?: boolean;
  surface?: 'card' | 'flat';
}

const transcriptPalettes = [
  {
    speaker: 'LILIAN',
    labelClass: 'text-pink-500',
    bubbleClass: 'border-pink-200 bg-pink-50',
  },
  {
    speaker: 'ALEX',
    labelClass: 'text-blue-600',
    bubbleClass: 'border-blue-200 bg-blue-50',
  },
  {
    speaker: 'SAM',
    labelClass: 'text-green-600',
    bubbleClass: 'border-green-200 bg-green-50',
  },
];

export function TranscriptList({
  segments,
  emptyTitle,
  emptyText,
  footerNote,
  disableAutoScroll = false,
  surface = 'card',
}: TranscriptListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 148,
    getItemKey: (index) => segments[index]?.id ?? index,
    overscan: 5,
  });

  useEffect(() => {
    if (disableAutoScroll || segments.length === 0) {
      return;
    }

    virtualizer.scrollToIndex(segments.length - 1, { align: 'end' });
  }, [disableAutoScroll, segments.length, virtualizer]);

  if (segments.length === 0) {
    return (
      <div
        className={`flex min-h-[320px] flex-col items-center justify-center rounded-[26px] border-[2px] ${
          surface === 'card' ? 'border-pink-100 bg-white shadow-macaron-button-slate' : 'border-transparent bg-transparent'
        } px-6 py-10 text-center`}
      >
        <h3 className="text-2xl font-extrabold tracking-tight text-slate-700">{emptyTitle}</h3>
        <p className="mt-3 max-w-md text-base leading-relaxed text-slate-500">{emptyText}</p>
        {footerNote ? <p className="mt-4 text-sm text-slate-400">{footerNote}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-1 flex-col border-[2px] ${
        surface === 'card'
          ? 'overflow-hidden rounded-[26px] border-pink-100 bg-white shadow-macaron-button-slate'
          : 'overflow-visible rounded-none border-transparent bg-transparent'
      }`}
    >
      <div className="max-h-[56vh] flex-1 overflow-y-auto py-4 pl-1 pr-5" ref={parentRef}>
        <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const segment = segments[virtualItem.index];
            const palette = transcriptPalettes[virtualItem.index % transcriptPalettes.length];

            return (
              <div
                key={segment.id}
                className="absolute left-0 top-0 -ml-8 w-[calc(100%+2rem)] pb-4"
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
                  <div className="pt-1 text-right">
                    <span className="font-mono text-sm font-bold text-slate-400">
                      {formatTimestamp(segment.startTime).replace(/^\[|\]$/g, '')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`mb-2 text-xs font-bold uppercase tracking-[0.22em] ${palette.labelClass}`}
                    >
                      {palette.speaker}
                    </p>
                    <div
                      className={`inline-block max-w-[21rem] rounded-[24px] rounded-tl-none border-[1.5px] px-5 py-4 text-[1.05rem] leading-8 text-slate-700 shadow-sm ${palette.bubbleClass}`}
                    >
                      {segment.text}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {footerNote ? (
        <p className="border-t-[2px] border-pink-100 px-6 py-4 text-sm text-slate-500">{footerNote}</p>
      ) : null}
    </div>
  );
}
