import {
  ChevronRight,
  FolderKanban,
  Home,
  Info,
  Settings2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMeetingsQuery } from '../../features/meetings/hooks';
import { useRecordingStore } from '../../features/recording/store';
import { CuteButton } from '../ui/CuteButton';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/meetings', label: 'Meeting', icon: FolderKanban },
  { to: '/import', label: 'Import Audio', icon: Upload },
];

function getNavButtonClass(isActive: boolean) {
  return `inline-flex w-full items-center justify-center gap-2 rounded-lg border-[2px] px-4 py-2 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-1 active:shadow-none ${
    isActive
      ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-macaron-button-blue'
      : 'border-slate-200 bg-white text-slate-500 shadow-macaron-button-slate hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 hover:shadow-macaron-button-slate'
  }`;
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const meetingsQuery = useMeetingsQuery();
  const status = useRecordingStore((state) => state.status);
  const activeMeetingTitle = useRecordingStore((state) => state.activeMeetingTitle);

  const recentMeetings = useMemo(() => {
    const meetings = meetingsQuery.data ?? [];
    return meetings.slice(0, 10);
  }, [meetingsQuery.data]);

  return (
    <div className="flex min-h-screen items-start text-macaron-text">
      <aside className="sticky top-0 relative z-10 flex h-dvh min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r-[2px] border-pink-200 bg-white/80 p-6 shadow-[4px_0px_10px_0px_rgba(0,0,0,0.02)] backdrop-blur-md">
        <div
          className="mb-8 flex cursor-pointer items-center gap-3 group"
          onClick={() => navigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigate('/');
            }
          }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border-[2px] border-blue-300 bg-gradient-to-br from-pink-300 to-blue-300 text-white shadow-macaron-button-blue transition-transform group-hover:rotate-12">
            <Sparkles size={20} />
          </div>
          <h1 className="mt-1 font-serif text-xl font-extrabold italic tracking-tight text-slate-800">
            Light-Minute
          </h1>
        </div>

        <div className="mb-6 space-y-3">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => getNavButtonClass(isActive)}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} className={isActive ? 'animate-pulse' : undefined} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        <div className="mb-6 min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Recent Notes
            </h3>
            <button
              className="text-slate-400 transition-colors hover:text-pink-500"
              type="button"
              onClick={() => navigate('/meetings')}
              aria-label="Open meetings list"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {recentMeetings.length > 0 ? (
              recentMeetings.map((meeting, index) => {
                const isActive = location.pathname === `/meetings/${meeting.id}`;
                const cardStyles = [
                  'border-pink-100 hover:border-pink-300 hover:shadow-macaron-button-pink',
                  'border-blue-100 hover:border-blue-300 hover:shadow-macaron-button-blue',
                  'border-yellow-100 hover:border-yellow-300 hover:shadow-macaron-button-yellow',
                ];

                return (
                  <button
                    key={meeting.id}
                    type="button"
                    className={`w-full rounded-xl border-[2px] bg-white p-3 text-left transition-all ${
                      isActive
                        ? 'border-blue-300 bg-blue-50 shadow-macaron-button-blue'
                        : cardStyles[index % cardStyles.length]
                    }`}
                    onClick={() => navigate(`/meetings/${meeting.id}`)}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          index % 3 === 0
                            ? 'bg-pink-400'
                            : index % 3 === 1
                              ? 'bg-blue-400'
                              : 'bg-yellow-400'
                        }`}
                      />
                      <h4 className="truncate text-sm font-bold text-slate-700">{meeting.title}</h4>
                    </div>
                    <p className="ml-4 text-xs text-slate-400">
                      {meeting.summary ? 'Summary ready' : 'Transcript only'}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border-[2px] border-dashed border-pink-200 bg-white p-4 text-sm text-slate-500">
                Start a new call to see recent notes here.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t-[2px] border-dashed border-pink-200 pt-4">
          {status === 'recording' || status === 'paused' ? (
            <div className="rounded-xl border-[2px] border-pink-100 bg-pink-50 p-3 text-sm text-slate-600 shadow-macaron-button-pink">
              <p className="font-bold text-slate-700">{status === 'recording' ? 'Recording now' : 'Paused session'}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {activeMeetingTitle || 'Current meeting'}
              </p>
            </div>
          ) : null}

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              getNavButtonClass(isActive)
            }
          >
            {({ isActive }) => (
              <>
                <Settings2 size={18} className={isActive ? 'animate-pulse' : undefined} />
                <span>Settings</span>
              </>
            )}
          </NavLink>

          <CuteButton
            icon={Info}
            label="About"
            variant="nav"
            className="w-full justify-center"
          />
        </div>
      </aside>

      <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
