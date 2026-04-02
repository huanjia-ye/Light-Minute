import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Mic, Mic2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RecordingControls } from '../../components/recording/RecordingControls';
import { TranscriptList } from '../../components/transcript/TranscriptList';
import { CuteButton } from '../../components/ui/CuteButton';
import { WindowBox } from '../../components/ui/WindowBox';
import { useCreateMeetingMutation, useImportAudioMutation } from '../../features/meetings/hooks';
import { getRecordingEngine } from '../../features/recording/recordingEngine';
import { useRecordingStore } from '../../features/recording/store';
import { normalizeSettings, useSettingsStore } from '../../features/settings/store';
import { formatDuration } from '../../lib/format';
import { sleep } from '../../lib/storage';

const OPEN_IMPORT_EVENT = 'light-minute:open-import';

function createMeetingTitle() {
  const now = new Date();
  return `Light-Minute Sync ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

function getStatusLabel(status: ReturnType<typeof useRecordingStore.getState>['status']) {
  switch (status) {
    case 'recording':
      return 'Recording';
    case 'paused':
      return 'Paused';
    case 'finalizing':
      return 'Finalizing';
    case 'saving':
      return 'Saving';
    case 'error':
      return 'Error';
    default:
      return 'Ready';
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const createMeetingMutation = useCreateMeetingMutation();
  const audioImportInputRef = useRef<HTMLInputElement | null>(null);
  const rawSettings = useSettingsStore((state) => state.settings);
  const settings = useMemo(() => normalizeSettings(rawSettings), [rawSettings]);
  const recordingEngine = useMemo(
    () => getRecordingEngine(settings.transcriptionEndpoint, settings.liveTranscriptionLanguage),
    [settings.liveTranscriptionLanguage, settings.transcriptionEndpoint],
  );
  const importAudioMutation = useImportAudioMutation(settings);
  const [meetingTitle, setMeetingTitle] = useState(createMeetingTitle());
  const recording = useRecordingStore((state) => state);

  const transcriptText = useMemo(
    () => recording.segments.map((segment) => `[${segment.startTime}s] ${segment.text}`).join('\n'),
    [recording.segments],
  );

  const showHero =
    recording.segments.length === 0 &&
    !['recording', 'paused', 'finalizing', 'saving'].includes(recording.status);

  const handleStart = () => {
    const nextTitle = meetingTitle.trim() || createMeetingTitle();

    setMeetingTitle(nextTitle);
    recording.startSession(nextTitle);

    try {
      recordingEngine.start({
        onSegment: (segment) => recording.appendSegment(segment),
        onTick: (elapsedSeconds) => recording.updateElapsed(elapsedSeconds),
        onError: (message) => {
          recording.setStatus('error', message);
          recordingEngine.stop();
        },
      });
    } catch (error) {
      recording.resetSession();
      recording.setStatus(
        'error',
        error instanceof Error ? error.message : 'Recording could not be started.',
      );
    }
  };

  const handlePause = () => {
    recordingEngine.pause();
    recording.setStatus('paused');
  };

  const handleResume = () => {
    recordingEngine.resume();
    recording.setStatus('recording');
  };

  const handleStop = async () => {
    const title = recording.activeMeetingTitle || meetingTitle || createMeetingTitle();
    const segments = [...recording.segments];
    const snapshot = await recordingEngine.stop();
    const elapsedSeconds = Math.max(recording.elapsedSeconds, snapshot.elapsedSeconds);

    recording.setStatus('finalizing');
    await sleep(850);
    recording.setStatus('saving');

    try {
      const meeting = await createMeetingMutation.mutateAsync({
        title,
        source: 'recording',
        transcriptOrigin:
          snapshot.mode === 'local-whisper-live' ? 'local-whisper' : snapshot.mode,
        segments,
        durationSeconds: elapsedSeconds,
      });

      recording.resetSession();
      setMeetingTitle(createMeetingTitle());
      navigate(`/meetings/${meeting.id}`);
    } catch (error) {
      recording.setStatus(
        'error',
        error instanceof Error ? error.message : 'Meeting could not be saved.',
      );
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    recording.setStatus('idle');

    try {
      const meeting = await importAudioMutation.mutateAsync({ file });
      const shouldAutoGenerateSummary = Boolean(
        settings.apiKey.trim() || settings.transcriptionApiKey.trim(),
      );
      event.target.value = '';
      navigate(`/meetings/${meeting.id}`, {
        state: {
          autoGenerateSummary: shouldAutoGenerateSummary,
          importedFromAudio: true,
        },
      });
    } catch (error) {
      event.target.value = '';
      recording.setStatus(
        'error',
        error instanceof Error ? error.message : 'Audio import failed.',
      );
    }
  };

  const handleCopyTranscript = async () => {
    if (!transcriptText) {
      return;
    }

    await navigator.clipboard.writeText(transcriptText);
  };

  useEffect(() => {
    const openImport = () => {
      audioImportInputRef.current?.click();
    };

    window.addEventListener(OPEN_IMPORT_EVENT, openImport);
    return () => {
      window.removeEventListener(OPEN_IMPORT_EVENT, openImport);
    };
  }, []);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-5 pb-8 pt-5 text-macaron-text">
      <input
        ref={audioImportInputRef}
        id="audioImport"
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleImport}
      />

      {showHero ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="relative z-10 mb-16 text-center">
            <h1 className="text-[3.4rem] font-bold tracking-[-0.05em] text-slate-800 md:text-[4.3rem]">
              Capture your{' '}
              <span className="bg-gradient-to-r from-pink-400 to-blue-400 bg-clip-text text-transparent">
                brilliant ideas
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[1.15rem] leading-8 text-slate-500">
              Real-time transcription and AI summaries. Tap the mic to start your next great
              meeting.
            </p>
            {recording.status === 'error' && recording.errorMessage ? (
              <div className="mx-auto mt-6 inline-flex max-w-xl items-center rounded-full border-[2px] border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 shadow-macaron-button-slate">
                {recording.errorMessage}
              </div>
            ) : null}
          </div>

          <div className="relative mt-2 flex h-56 w-full flex-col items-center justify-center">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[12rem] w-[12rem] -translate-x-1/2 -translate-y-[40%] rounded-full bg-pink-200 opacity-55 blur-[42px]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[14rem] w-[14rem] -translate-x-[45%] -translate-y-[45%] rounded-full bg-blue-200 opacity-45 blur-[52px]" />

            <div className="group relative flex items-center justify-center">
              <div className="absolute inset-[-18px] rounded-full border-[1.5px] border-pink-200 animate-[spin_10s_linear_infinite]" />
              <div className="absolute inset-[-38px] rounded-full border-[1.5px] border-blue-200 opacity-50 animate-[spin_15s_linear_infinite_reverse]" />

              <button
                onClick={handleStart}
                className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full border-[4px] border-pink-300 bg-pink-100 text-pink-500 shadow-[0_7px_0_0_#fbcfe8] transition-all duration-300 hover:scale-[1.02] hover:bg-pink-200 active:translate-y-[7px] active:shadow-none"
                type="button"
                aria-label="Start recording"
              >
                <Mic size={42} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <input
                id="meetingTitle"
                className="w-full min-w-0 border-none bg-transparent px-0 py-0 text-[2.7rem] font-bold tracking-[-0.05em] text-slate-800 outline-none placeholder:text-slate-400 md:text-[3.1rem]"
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <CuteButton
                icon={Clipboard}
                label="Copy"
                variant="neutral"
                disabled={!recording.segments.length}
                onClick={handleCopyTranscript}
              />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 rounded-full border-[2px] border-pink-200 bg-white px-4 py-2.5 shadow-macaron-button-slate">
              <span className="h-3 w-3 rounded-full bg-orange-500" />
              <span className="text-lg font-bold text-slate-700">
                {getStatusLabel(recording.status)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-lg text-slate-700">
                {formatDuration(recording.elapsedSeconds)}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full border-[2px] border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-macaron-button-slate">
                <Mic2 size={14} />
                <span>{settings.micDevice}</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border-[2px] border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-macaron-button-slate">
                <Sparkles size={14} />
                <span>
                  {recordingEngine.mode === 'local-whisper-live'
                    ? 'Light-Minute live whisper'
                    : recordingEngine.mode === 'browser-speech'
                      ? `live speech ${settings.liveTranscriptionLanguage === 'auto' ? '(auto)' : `(${settings.liveTranscriptionLanguage})`}`
                      : 'demo mode'}{' '}
                  | {settings.provider}
                </span>
              </div>
            </div>
          </div>

          {recording.status === 'error' && recording.errorMessage ? (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border-[2px] border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
              <span>{recording.errorMessage}</span>
              <CuteButton
                label="Open settings"
                variant="neutral"
                onClick={() => navigate('/settings')}
              />
            </div>
          ) : null}

          <div className="flex-1">
            <WindowBox
              title="Live Transcript.txt"
              colorClass="bg-blue-50"
              borderColorClass="border-blue-200"
              className="min-h-[500px]"
            >
              <div className="flex h-full flex-col p-5">
                <div className="mb-4">
                  <h2 className="text-[2.25rem] font-bold tracking-[-0.03em] text-slate-800">
                    Live transcript
                  </h2>
                </div>

                <TranscriptList
                  segments={recording.segments}
                  emptyTitle="Welcome to Light-Minute!"
                  emptyText="Start recording to see live transcription."
                  surface="flat"
                />
              </div>
            </WindowBox>
          </div>
        </>
      )}

      {!showHero ? (
        <div className="fixed bottom-10 left-0 right-0 z-20 flex justify-center">
          <RecordingControls
            status={recording.status}
            elapsedSeconds={recording.elapsedSeconds}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
          />
        </div>
      ) : null}
    </div>
  );
}
