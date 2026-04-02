import type { ChangeEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio2,
  FolderOpen,
  LoaderCircle,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CuteButton } from '../../components/ui/CuteButton';
import { WindowBox } from '../../components/ui/WindowBox';
import { useImportAudioMutation } from '../../features/meetings/hooks';
import type { AudioImportProgress } from '../../features/meetings/api';
import { normalizeSettings, useSettingsStore } from '../../features/settings/store';

type UploadScreenState =
  | 'idle'
  | 'ready'
  | AudioImportProgress['stage']
  | 'error';

const stageOrder: UploadScreenState[] = ['uploading', 'analyzing', 'saving', 'opening'];

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getStageTitle(state: UploadScreenState) {
  switch (state) {
    case 'ready':
      return 'Ready to upload';
    case 'uploading':
      return 'Uploading audio';
    case 'analyzing':
      return 'Analyzing recording';
    case 'saving':
      return 'Saving meeting';
    case 'opening':
      return 'Opening workspace';
    case 'error':
      return 'Import failed';
    default:
      return 'Upload your recording';
  }
}

export function ImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rawSettings = useSettingsStore((state) => state.settings);
  const settings = useMemo(() => normalizeSettings(rawSettings), [rawSettings]);
  const importAudioMutation = useImportAudioMutation(settings);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadScreenState>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Supports MP3, WAV, M4A up to your browser upload limit.',
  );
  const [errorMessage, setErrorMessage] = useState('');

  const activeStageIndex = useMemo(() => stageOrder.indexOf(status), [status]);

  const runImport = async (file: File) => {
    setSelectedFile(file);
    setStatus('uploading');
    setErrorMessage('');
    setStatusMessage(`Preparing ${file.name} for local analysis...`);

    try {
      const meeting = await importAudioMutation.mutateAsync({
        file,
        onStageChange: (progress) => {
          setStatus(progress.stage);
          setStatusMessage(progress.message);
        },
      });

      setStatus('opening');
      setStatusMessage('Opening the imported meeting workspace...');

      const shouldAutoGenerateSummary = Boolean(
        settings.apiKey.trim() || settings.transcriptionApiKey.trim(),
      );

      window.setTimeout(() => {
        navigate(`/meetings/${meeting.id}`, {
          state: {
            autoGenerateSummary: shouldAutoGenerateSummary,
            importedFromAudio: true,
          },
        });
      }, 500);
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Audio import failed unexpectedly.',
      );
      setStatusMessage('Light-Minute could not finish importing this file.');
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    event.target.value = '';
    await runImport(file);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-5 pb-8 pt-5 text-macaron-text">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event);
        }}
      />

      <div className="flex flex-1 items-center justify-center">
        <WindowBox
          title="Import Audio"
          colorClass="bg-blue-50"
          borderColorClass="border-blue-200"
          className="w-full max-w-[640px]"
        >
          <div className="p-4 md:p-6">
            <div className="rounded-[26px] border-[2px] border-dashed border-blue-200 bg-white px-6 py-9 text-center shadow-macaron-button-blue">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] border-[2px] border-blue-200 bg-blue-50 text-blue-500 shadow-macaron-button-blue">
                {status === 'error' ? (
                  <AlertTriangle size={24} />
                ) : status === 'opening' ? (
                  <CheckCircle2 size={24} />
                ) : activeStageIndex >= 0 ? (
                  <LoaderCircle size={24} className="animate-spin" />
                ) : (
                  <Upload size={24} />
                )}
              </div>

              <h1 className="mt-5 text-[2.6rem] font-bold tracking-[-0.04em] text-slate-800">
                {getStageTitle(status)}
              </h1>
              <p className="mx-auto mt-3 max-w-lg text-[1.05rem] leading-8 text-slate-500">
                {statusMessage}
              </p>

              {selectedFile ? (
                <div className="mx-auto mt-6 max-w-md rounded-[18px] border-[2px] border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-macaron-button-slate">
                  <div className="flex items-center gap-3">
                    <FileAudio2 size={18} className="shrink-0 text-blue-500" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-700">
                        {selectedFile.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mx-auto mt-7 grid max-w-xl gap-3 md:grid-cols-4">
                {stageOrder.map((stage, index) => {
                  const isActive = activeStageIndex === index;
                  const isComplete = activeStageIndex > index;

                  return (
                    <div
                      key={stage}
                      className={`rounded-[18px] border-[2px] px-4 py-2.5 text-sm font-bold transition-all ${
                        isActive
                          ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-macaron-button-blue'
                          : isComplete
                            ? 'border-green-200 bg-green-50 text-green-700 shadow-[2px_2px_0px_0px_#bbf7d0]'
                            : 'border-slate-200 bg-white text-slate-400 shadow-macaron-button-slate'
                      }`}
                    >
                      {stage === 'uploading'
                        ? 'Uploading'
                        : stage === 'analyzing'
                          ? 'Analyzing'
                          : stage === 'saving'
                            ? 'Saving'
                            : 'Opening'}
                    </div>
                  );
                })}
              </div>

              {errorMessage ? (
                <div className="mx-auto mt-7 max-w-2xl rounded-[22px] border-[2px] border-red-200 bg-red-50 px-5 py-4 text-left text-red-600 shadow-macaron-button-slate">
                  <p className="font-bold">Import error</p>
                  <p className="mt-2 text-sm leading-7">{errorMessage}</p>
                </div>
              ) : null}

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <CuteButton
                  icon={FolderOpen}
                  label={
                    selectedFile && status !== 'idle' && status !== 'ready'
                      ? 'Choose another file'
                      : 'Browse Files'
                  }
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                />
                <CuteButton
                  label="Open settings"
                  variant="neutral"
                  onClick={() => navigate('/settings')}
                />
              </div>
            </div>
          </div>
        </WindowBox>
      </div>
    </div>
  );
}
