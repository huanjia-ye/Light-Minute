import { useMemo, useState } from 'react';
import { ArrowRight, Search, Sparkles, Waves } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CuteButton } from '../../components/ui/CuteButton';
import { WindowBox } from '../../components/ui/WindowBox';
import { useMeetingsQuery } from '../../features/meetings/hooks';
import { formatDateTime, formatDuration } from '../../lib/format';

function getSummaryStateLabel(hasSummary: boolean) {
  return hasSummary ? 'summary ready' : 'summary pending';
}

export function MeetingsPage() {
  const navigate = useNavigate();
  const meetingsQuery = useMeetingsQuery();
  const [searchValue, setSearchValue] = useState('');

  const filteredMeetings = useMemo(() => {
    const meetings = meetingsQuery.data ?? [];
    const normalizedSearch = searchValue.trim().toLowerCase();

    if (!normalizedSearch) {
      return meetings;
    }

    return meetings.filter((meeting) =>
      `${meeting.title} ${meeting.summary?.markdown ?? ''}`.toLowerCase().includes(normalizedSearch),
    );
  }, [meetingsQuery.data, searchValue]);

  const summaryCount = useMemo(
    () => filteredMeetings.filter((meeting) => Boolean(meeting.summary)).length,
    [filteredMeetings],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-8 pt-6 text-macaron-text">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">
            Meeting notes
          </p>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight text-slate-800">
            Saved meetings
          </h1>
          <p className="mt-4 max-w-3xl text-xl leading-relaxed text-slate-500">
            Review transcript, duration, source, and summary state for completed calls.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-full border-[2px] border-pink-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-macaron-button-pink">
            {filteredMeetings.length} meetings
          </div>
          <div className="rounded-full border-[2px] border-yellow-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-macaron-button-yellow">
            {summaryCount} summaries ready
          </div>
        </div>
      </header>

      <WindowBox
        title="Recent Notes"
        colorClass="bg-pink-50"
        borderColorClass="border-pink-200"
        className="mb-6"
      >
        <div className="flex flex-col gap-5 p-6">
          <label className="block" htmlFor="meetingSearch">
            <span className="mb-3 block text-lg font-bold text-slate-800">Search meetings</span>
            <span className="flex items-center gap-3 rounded-[20px] border-[2px] border-pink-100 bg-white px-4 py-3 shadow-macaron-button-pink">
              <Search size={18} className="text-slate-400" />
              <input
                id="meetingSearch"
                className="w-full border-none bg-transparent text-base text-slate-700 outline-none"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search by title or summary text"
              />
            </span>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] border-[2px] border-blue-100 bg-white p-4 shadow-macaron-button-blue">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Transcripts</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-800">
                {filteredMeetings.reduce((count, meeting) => count + meeting.segments.length, 0)}
              </p>
              <p className="mt-2 text-sm text-slate-500">Segments available across this filtered list.</p>
            </div>
            <div className="rounded-[22px] border-[2px] border-yellow-100 bg-white p-4 shadow-macaron-button-yellow">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Summaries</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-800">{summaryCount}</p>
              <p className="mt-2 text-sm text-slate-500">Meetings already paired with an AI summary.</p>
            </div>
            <div className="rounded-[22px] border-[2px] border-green-100 bg-white p-4 shadow-[2px_2px_0px_0px_#bbf7d0]">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Duration</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-800">
                {formatDuration(
                  filteredMeetings.reduce((count, meeting) => count + meeting.durationSeconds, 0),
                )}
              </p>
              <p className="mt-2 text-sm text-slate-500">Total conversation time captured so far.</p>
            </div>
          </div>
        </div>
      </WindowBox>

      <WindowBox
        title="Meeting Index"
        colorClass="bg-blue-50"
        borderColorClass="border-blue-200"
        className="min-h-[480px] flex-1"
      >
        <div className="flex h-full flex-col p-6">
          {filteredMeetings.length > 0 ? (
            <div className="space-y-4 overflow-y-auto pr-2">
              {filteredMeetings.map((meeting, index) => {
                const accentClass =
                  index % 3 === 0
                    ? 'border-pink-100 shadow-macaron-button-pink'
                    : index % 3 === 1
                      ? 'border-blue-100 shadow-macaron-button-blue'
                      : 'border-yellow-100 shadow-macaron-button-yellow';

                return (
                  <article
                    key={meeting.id}
                    className={`rounded-[24px] border-[2px] bg-white p-5 transition-all hover:-translate-y-0.5 ${accentClass}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              index % 3 === 0
                                ? 'bg-pink-400'
                                : index % 3 === 1
                                  ? 'bg-blue-400'
                                  : 'bg-yellow-400'
                            }`}
                          />
                          <h2 className="truncate text-2xl font-extrabold tracking-tight text-slate-800">
                            {meeting.title}
                          </h2>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-500">
                          {formatDateTime(meeting.createdAt)} | {meeting.source} |{' '}
                          {meeting.segments.length} segments | {formatDuration(meeting.durationSeconds)}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <div className="flex items-center gap-2 rounded-full border-[2px] border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                            <Waves size={14} />
                            <span>{meeting.transcriptOrigin}</span>
                          </div>
                          <div className="flex items-center gap-2 rounded-full border-[2px] border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                            <Sparkles size={14} />
                            <span>{getSummaryStateLabel(Boolean(meeting.summary))}</span>
                          </div>
                        </div>
                      </div>

                      <CuteButton
                        icon={ArrowRight}
                        label="Open detail"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => navigate(`/meetings/${meeting.id}`)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div className="max-w-md rounded-[24px] border-[2px] border-dashed border-pink-200 bg-white/90 px-8 py-10 shadow-macaron-button-pink">
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-slate-400">
                  No matching meetings
                </p>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-800">
                  Nothing matches that filter yet
                </h2>
                <p className="mt-3 text-base leading-7 text-slate-500">
                  Try another keyword or create a new meeting from the home page.
                </p>
              </div>
            </div>
          )}
        </div>
      </WindowBox>
    </div>
  );
}
