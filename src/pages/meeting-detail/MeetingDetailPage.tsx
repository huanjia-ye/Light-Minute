import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clipboard,
  LoaderCircle,
  Save,
  Sparkles,
  Square,
  Undo2,
} from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { CuteButton } from '../../components/ui/CuteButton';
import { SummaryEditor } from '../../components/summary/SummaryEditor';
import { TranscriptList } from '../../components/transcript/TranscriptList';
import { WindowBox } from '../../components/ui/WindowBox';
import { useMeetingQuery, useUpdateSummaryMutation } from '../../features/meetings/hooks';
import { useSettingsStore } from '../../features/settings/store';
import { generateMeetingSummary } from '../../features/summary/api';
import {
  clearSummaryDraft,
  loadSummaryDraft,
  saveSummaryDraft,
} from '../../features/summary/draftStorage';
import { formatDateTime, formatDuration } from '../../lib/format';

export function MeetingDetailPage() {
  const { meetingId } = useParams();
  const location = useLocation();
  const meetingQuery = useMeetingQuery(meetingId);
  const settings = useSettingsStore((state) => state.settings);
  const updateSummaryMutation = useUpdateSummaryMutation(meetingId ?? '');
  const [markdown, setMarkdown] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summaryNotice, setSummaryNotice] = useState('');
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const autoGenerateTriggeredRef = useRef(false);
  const generationAbortControllerRef = useRef<AbortController | null>(null);

  const meeting = meetingQuery.data;
  const persistedMarkdown = meeting?.summary?.markdown ?? '';
  const navigationState = location.state as
    | { autoGenerateSummary?: boolean; importedFromAudio?: boolean }
    | null;

  useEffect(() => {
    if (!meeting) {
      return;
    }

    const localDraft = loadSummaryDraft(meeting.id);
    if (localDraft && localDraft.markdown.trim() && localDraft.markdown !== persistedMarkdown) {
      setMarkdown(localDraft.markdown);
      setHasLocalDraft(true);
      setSummaryError('');
      setSummaryNotice(
        localDraft.source === 'generation'
          ? 'Recovered a locally saved generated draft. You can keep editing, sync it, or restore the saved summary.'
          : 'Recovered a locally saved draft. You can keep editing, sync it, or restore the saved summary.',
      );
      return;
    }

    setMarkdown(persistedMarkdown);
    setHasLocalDraft(false);
    if (!isGenerating) {
      setSummaryNotice('');
    }
  }, [isGenerating, meeting, persistedMarkdown]);

  const isDirty = useMemo(() => markdown !== persistedMarkdown, [markdown, persistedMarkdown]);

  const handleGenerate = useCallback(async () => {
    if (!meeting) {
      return;
    }

    generationAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    generationAbortControllerRef.current = abortController;

    setIsGenerating(true);
    setSummaryError('');
    setSummaryNotice('Generating a new local draft from the transcript.');

    try {
      const summary = await generateMeetingSummary(meeting, settings, '', {
        signal: abortController.signal,
        onProgress: (nextMarkdown) => {
          setMarkdown(nextMarkdown);
          setHasLocalDraft(true);
        },
      });
      await updateSummaryMutation.mutateAsync(summary);
      clearSummaryDraft(meeting.id);
      setHasLocalDraft(false);
      setSummaryNotice('');
      setMarkdown(summary.markdown);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setSummaryError('');
        setSummaryNotice(
          'Summary generation stopped. The partial draft is kept locally and will be restored after refresh.',
        );
      } else {
        setSummaryNotice(
          'Summary generation failed. Your last local draft is still available to continue editing.',
        );
        setSummaryError(
          error instanceof Error ? error.message : 'Summary generation failed unexpectedly.',
        );
      }
    } finally {
      if (generationAbortControllerRef.current === abortController) {
        generationAbortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }, [meeting, settings, updateSummaryMutation]);

  const handleSave = useCallback(async () => {
    if (!meeting || !isDirty) {
      return;
    }

    try {
      const now = new Date().toISOString();
      await updateSummaryMutation.mutateAsync({
        markdown,
        provider: settings.provider,
        model: settings.model,
        templateId: settings.templateId,
        prompt: '',
        generatedAt: meeting.summary?.generatedAt ?? now,
        updatedAt: now,
      });
      clearSummaryDraft(meeting.id);
      setHasLocalDraft(false);
      setSummaryError('');
      setSummaryNotice('Local draft synced to the saved meeting summary.');
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Failed to save summary.');
    }
  }, [isDirty, markdown, meeting, settings, updateSummaryMutation]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
  };

  const handleStopGeneration = useCallback(() => {
    generationAbortControllerRef.current?.abort();
  }, []);

  const handleRestoreSavedSummary = useCallback(() => {
    if (!meeting) {
      return;
    }

    generationAbortControllerRef.current?.abort();
    clearSummaryDraft(meeting.id);
    setMarkdown(persistedMarkdown);
    setHasLocalDraft(false);
    setSummaryError('');
    setSummaryNotice(
      persistedMarkdown.trim()
        ? 'Restored the last saved summary and cleared the local draft.'
        : 'Cleared the local draft and returned to an empty summary.',
    );
  }, [meeting, persistedMarkdown]);

  useEffect(() => {
    const shouldAutoGenerate = Boolean(navigationState?.autoGenerateSummary);

    if (
      !meeting ||
      !shouldAutoGenerate ||
      meeting.summary ||
      isGenerating ||
      autoGenerateTriggeredRef.current
    ) {
      return;
    }

    autoGenerateTriggeredRef.current = true;
    void handleGenerate();
  }, [handleGenerate, isGenerating, meeting, navigationState]);

  useEffect(() => {
    if (!meeting) {
      return;
    }

    if (!isDirty) {
      clearSummaryDraft(meeting.id);
      setHasLocalDraft(false);
      return;
    }

    const draftPersistTimer = window.setTimeout(() => {
      saveSummaryDraft(meeting.id, {
        markdown,
        updatedAt: new Date().toISOString(),
        source: isGenerating ? 'generation' : 'manual',
        baseSummaryMarkdown: persistedMarkdown,
      });
      setHasLocalDraft(true);
    }, 500);

    return () => {
      window.clearTimeout(draftPersistTimer);
    };
  }, [isDirty, isGenerating, markdown, meeting, persistedMarkdown]);

  useEffect(() => {
    if (!meeting || !isDirty || isGenerating || updateSummaryMutation.isPending) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      void handleSave();
    }, 1200);

    return () => {
      window.clearTimeout(autosaveTimer);
    };
  }, [handleSave, isDirty, isGenerating, markdown, meeting, updateSummaryMutation.isPending]);

  useEffect(() => {
    return () => {
      generationAbortControllerRef.current?.abort();
    };
  }, []);

  const editorStatusLabel = useMemo(() => {
    if (updateSummaryMutation.isPending) {
      return 'Saving';
    }

    if (isGenerating) {
      return 'Generating draft';
    }

    if (hasLocalDraft) {
      return 'Local draft';
    }

    return isDirty ? 'Unsaved edits' : 'Synced';
  }, [hasLocalDraft, isDirty, isGenerating, updateSummaryMutation.isPending]);

  if (meetingQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-8 pt-6 text-macaron-text">
        <WindowBox
          title="Meeting Loading"
          colorClass="bg-blue-50"
          borderColorClass="border-blue-200"
          className="min-h-[360px]"
        >
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">
                Meeting detail
              </p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-800">
                Loading meeting...
              </h1>
              <p className="mt-3 text-lg text-slate-500">
                Fetching transcript and summary workspace.
              </p>
            </div>
          </div>
        </WindowBox>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-8 pt-6 text-macaron-text">
        <WindowBox
          title="Meeting Missing"
          colorClass="bg-pink-50"
          borderColorClass="border-pink-200"
          className="min-h-[360px]"
        >
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">
                Meeting detail
              </p>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-800">
                Meeting not found
              </h1>
              <p className="mt-3 text-lg text-slate-500">
                The selected record does not exist in local storage.
              </p>
            </div>
          </div>
        </WindowBox>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-7xl flex-col px-6 pb-6 pt-6 text-macaron-text">
      <header className="mb-4 rounded-[22px] border-[2px] border-white bg-white/75 px-5 py-4 shadow-macaron-button-slate backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Sparkles size={26} className="shrink-0 text-pink-400" />
              <h1
                className="truncate text-[2rem] font-medium tracking-[-0.015em] text-slate-800 md:text-[2.3rem]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {meeting.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-0 overflow-hidden rounded-[18px] border-[2px] border-blue-200 bg-white shadow-macaron-button-blue">
            <CuteButton
              icon={isGenerating ? Square : Sparkles}
              label={isGenerating ? 'Stop generation' : 'Generate summary'}
              variant="secondary"
              onClick={isGenerating ? handleStopGeneration : handleGenerate}
              className="rounded-none border-0 border-r-[2px] border-blue-200 bg-blue-50 px-5 py-3 text-blue-700 shadow-none hover:translate-y-0 hover:bg-blue-100 active:translate-y-0"
            />
            <CuteButton
              icon={Save}
              label={updateSummaryMutation.isPending ? 'Saving...' : 'Save'}
              variant="neutral"
              onClick={handleSave}
              disabled={updateSummaryMutation.isPending || !isDirty || isGenerating}
              className="rounded-none border-0 border-r-[2px] border-blue-100 px-5 py-3 text-slate-500 shadow-none hover:translate-y-0 active:translate-y-0"
            />
            <CuteButton
              icon={Undo2}
              label={persistedMarkdown.trim() ? 'Restore saved' : 'Discard draft'}
              variant="neutral"
              onClick={handleRestoreSavedSummary}
              disabled={!hasLocalDraft || isGenerating}
              className="rounded-none border-0 border-r-[2px] border-blue-100 px-5 py-3 text-slate-500 shadow-none hover:translate-y-0 active:translate-y-0"
            />
            <CuteButton
              icon={Clipboard}
              label="Copy"
              variant="neutral"
              onClick={handleCopy}
              className="rounded-none border-0 px-5 py-3 text-slate-500 shadow-none hover:translate-y-0 active:translate-y-0"
            />
          </div>
        </div>
        {isGenerating ? (
          <div className="mt-4 flex items-center gap-3 rounded-[18px] border-[2px] border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 shadow-macaron-button-blue">
            <LoaderCircle size={18} className="animate-spin" />
            <span>Streaming summary into the editor...</span>
          </div>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="rounded-full border-[2px] border-pink-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-macaron-button-pink">
          {formatDateTime(meeting.createdAt)}
        </div>
        <div className="rounded-full border-[2px] border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-macaron-button-blue">
          {formatDuration(meeting.durationSeconds)}
        </div>
        <div className="rounded-full border-[2px] border-yellow-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-macaron-button-yellow">
          {meeting.source}
        </div>
        <div className="rounded-full border-[2px] border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-macaron-button-slate">
          {meeting.segments.length} segments
        </div>
      </div>

      <section className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.9fr)]">
        <WindowBox
          title="Live Transcript.txt"
          colorClass="bg-blue-50"
          borderColorClass="border-blue-200"
          className="h-full min-h-0"
        >
          <div className="flex h-full min-h-0 flex-col p-5">
            <TranscriptList
              segments={meeting.segments}
              emptyTitle="No transcript available"
              emptyText="This meeting does not have transcript segments yet."
              disableAutoScroll
              surface="flat"
            />
          </div>
        </WindowBox>

        <SummaryEditor
          className="h-full min-h-0"
          markdown={markdown}
          isSaving={updateSummaryMutation.isPending}
          isDirty={isDirty}
          isGenerating={isGenerating}
          errorMessage={summaryError}
          infoMessage={summaryNotice}
          statusLabelOverride={editorStatusLabel}
          onChange={setMarkdown}
        />
      </section>
    </div>
  );
}
