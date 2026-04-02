import { useState } from 'react';
import { CheckCircle2, Edit3, Sparkles } from 'lucide-react';
import { WindowBox } from '../ui/WindowBox';

interface SummaryEditorProps {
  markdown: string;
  isSaving: boolean;
  isDirty: boolean;
  isGenerating?: boolean;
  className?: string;
  errorMessage?: string;
  infoMessage?: string;
  statusLabelOverride?: string;
  onChange: (value: string) => void;
}

type EditorMode = 'preview' | 'edit';

function renderSummaryMarkdown(markdown: string) {
  if (!markdown.trim()) {
    return (
      <div className="px-6 py-8 text-slate-500">
        <p className="text-lg font-bold text-slate-700">Nothing to preview yet</p>
        <p className="mt-3 leading-7">
          Generate a summary to start editing and previewing the final meeting notes.
        </p>
      </div>
    );
  }

  return markdown.split('\n').map((line, index) => {
    if (line.startsWith('# ')) {
      return (
        <h1
          key={index}
          className="mb-6 flex items-center gap-2 text-3xl font-extrabold text-slate-800"
        >
          <Sparkles className="text-yellow-400" size={24} />
          {line.slice(2)}
        </h1>
      );
    }

    if (line.startsWith('## ')) {
      return (
        <div key={index} className="mb-4 mt-8 border-b-2 border-pink-100 pb-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.24em] text-pink-500">
            {line.slice(3)}
          </h2>
        </div>
      );
    }

    if (line.startsWith('- ')) {
      return (
        <div key={index} className="mb-3 flex items-start gap-3 text-slate-600">
          <span className="mt-[0.72rem] h-2 w-2 shrink-0 rounded-full bg-pink-400" />
          <span className="leading-8">{line.slice(2)}</span>
        </div>
      );
    }

    if (line.startsWith('[ ] ')) {
      return (
        <div
          key={index}
          className="my-3 flex items-center gap-3 rounded-2xl border-[2px] border-yellow-200 bg-white p-4 shadow-macaron-button-yellow"
        >
          <div className="h-5 w-5 shrink-0 rounded border-[2px] border-slate-300 bg-white" />
          <span className="flex-1 text-slate-600">{line.slice(4)}</span>
        </div>
      );
    }

    if (!line.trim()) {
      return <div key={index} className="h-3" />;
    }

    return (
      <p key={index} className="mb-3 leading-8 text-slate-600">
        {line}
      </p>
    );
  });
}

export function SummaryEditor({
  markdown,
  isSaving,
  isDirty,
  isGenerating = false,
  className,
  errorMessage,
  infoMessage,
  statusLabelOverride,
  onChange,
}: SummaryEditorProps) {
  const [mode, setMode] = useState<EditorMode>('preview');
  const activeMode: EditorMode = markdown.trim() && !isGenerating ? mode : 'preview';

  const statusLabel = statusLabelOverride ?? (isSaving ? 'Saving' : isDirty ? 'Unsaved edits' : 'Synced');
  const shouldShowStatus = statusLabel !== 'Synced';

  return (
    <WindowBox
      title="AI SUMMARY.MD"
      colorClass="bg-yellow-50"
      borderColorClass="border-yellow-200"
      shadowClass="shadow-macaron-button-yellow"
      className={className}
    >
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-center justify-end gap-2 border-b-[2px] border-yellow-200 bg-yellow-50/70 px-4 py-3">
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`flex items-center gap-2 rounded-xl border-[2px] px-4 py-2 text-sm font-bold transition-all ${
              activeMode === 'preview'
                ? 'border-yellow-300 bg-white text-yellow-600 shadow-macaron-button-yellow'
                : 'border-transparent text-slate-400 hover:bg-yellow-100'
            }`}
          >
            <CheckCircle2 size={16} />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('edit')}
            disabled={isGenerating}
            className={`flex items-center gap-2 rounded-xl border-[2px] px-4 py-2 text-sm font-bold transition-all ${
              activeMode === 'edit'
                ? 'border-yellow-300 bg-white text-yellow-600 shadow-macaron-button-yellow'
                : 'border-transparent text-slate-400 hover:bg-yellow-100 disabled:hover:bg-transparent'
            }`}
          >
            <Edit3 size={16} />
            <span>Edit</span>
          </button>
        </div>

        <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
          {shouldShowStatus ? (
            <div className="mb-4 flex items-start justify-end">
              <div className="rounded-full border-[2px] border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-500">
                {statusLabel}
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border-[2px] border-red-200 bg-red-50 px-5 py-4 text-base text-red-600">
              {errorMessage}
            </div>
          ) : null}

          {infoMessage ? (
            <div className="mb-4 rounded-2xl border-[2px] border-blue-200 bg-blue-50 px-5 py-4 text-base text-blue-700">
              {infoMessage}
            </div>
          ) : null}

          <div className="relative flex-1 overflow-hidden rounded-[28px] border-[2px] border-yellow-200 bg-white">
            {activeMode === 'edit' ? (
              <div className="relative max-h-[56vh] min-h-[420px] overflow-y-auto p-5">
                <div className="pointer-events-none absolute inset-0 mt-1 opacity-20 [background-image:linear-gradient(transparent_27px,#fbbf24_28px)] [background-size:100%_28px]" />
                <textarea
                  className="relative z-10 min-h-full w-full resize-none border-none bg-transparent font-mono text-[0.98rem] leading-7 text-slate-700 outline-none"
                  value={markdown}
                  placeholder="Generate a summary to start editing."
                  onChange={(event) => onChange(event.target.value)}
                />
              </div>
            ) : (
              <div className="max-h-[56vh] min-h-[420px] overflow-y-auto px-5 pb-7 pt-5">
                {renderSummaryMarkdown(markdown)}
              </div>
            )}
          </div>
        </div>
      </div>
    </WindowBox>
  );
}
