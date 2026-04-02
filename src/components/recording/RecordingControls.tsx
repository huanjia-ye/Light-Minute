import { Mic, Pause, Play, Save, Square } from 'lucide-react';
import type { RecordingStatus } from '../../features/recording/store';

interface RecordingControlsProps {
  status: RecordingStatus;
  elapsedSeconds: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

export function RecordingControls({
  status,
  elapsedSeconds,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordingControlsProps) {
  const isIdle = status === 'idle' || status === 'error';
  const isPaused = status === 'paused';
  const isBusy = status === 'finalizing' || status === 'saving';
  const isActive = status === 'recording' || status === 'paused' || isBusy;
  const timerLabel = isBusy ? 'Saving' : isActive ? formatDuration(elapsedSeconds) : 'Ready';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-4 rounded-full border-[2px] border-slate-600 bg-slate-700 px-4 py-3 text-white shadow-[0_8px_20px_-5px_rgba(0,0,0,0.14)]">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isPaused ? 'bg-yellow-300' : isActive ? 'bg-red-400 animate-pulse' : 'bg-slate-300'}`} />
          <span className="font-mono text-sm">{timerLabel}</span>
        </div>

        <div className="h-6 w-px bg-slate-500" />

        {isIdle ? (
          <button
            className={`flex items-center gap-2 rounded-full border-[2px] px-4 py-2 font-bold transition-all ${isBusy ? 'border-slate-300 bg-slate-400 text-white' : 'border-pink-300 bg-pink-100 text-pink-700 shadow-macaron-button-pink hover:bg-pink-200'}`}
            type="button"
            onClick={onStart}
            disabled={isBusy}
          >
            <Mic size={18} />
            <span>Start recording</span>
          </button>
        ) : (
          <>
            <button
              className={`flex items-center gap-2 rounded-full border-[2px] px-4 py-2 font-bold transition-all ${isBusy ? 'border-slate-300 bg-slate-200 text-slate-400' : 'border-slate-300 bg-white text-slate-700 shadow-macaron-button-slate hover:border-pink-200 hover:bg-pink-50'}`}
              type="button"
              disabled={isBusy}
              onClick={isPaused ? onResume : onPause}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            <button
              className={`flex items-center gap-2 rounded-full border-[2px] px-4 py-2 font-bold transition-all ${isBusy ? 'border-yellow-300 bg-yellow-100 text-yellow-700' : 'border-red-300 bg-red-500 text-white hover:bg-red-600'}`}
              type="button"
              disabled={isBusy}
              onClick={onStop}
            >
              {isBusy ? <Save size={18} /> : <Square size={18} />}
              <span>{isBusy ? 'Saving...' : 'Stop & save'}</span>
            </button>
          </>
        )}

        <div className="mx-1 flex items-end gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`w-1 rounded-full transition-all duration-200 ${
                isPaused ? 'bg-yellow-300' : isActive ? 'bg-pink-300' : 'bg-slate-400'
              }`}
              style={{
                height: isActive ? `${12 + index * 6}px` : '4px',
                opacity: isPaused ? 0.8 : 1,
              }}
            />
          ))}
        </div>
      </div>

      {isBusy ? (
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Finalizing transcript and saving meeting...
        </p>
      ) : null}
    </div>
  );
}
