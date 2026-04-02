import { useEffect, useState } from 'react';
import { Mic, RefreshCcw, Save, Settings2, Sparkles } from 'lucide-react';
import { defaultSettings, useSettingsStore } from '../../features/settings/store';
import type { AppSettings } from '../../types/settings';
import { WindowBox } from '../../components/ui/WindowBox';
import { CuteButton } from '../../components/ui/CuteButton';

async function loadMicrophoneOptions() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return ['Default microphone', 'USB microphone', 'Built-in microphone'];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => device.label || `Microphone ${index + 1}`);

    return audioInputs.length ? audioInputs : ['Default microphone'];
  } catch {
    return ['Default microphone', 'USB microphone', 'Built-in microphone'];
  }
}

type SettingsTab = 'general' | 'recording' | 'summary';

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'recording', label: 'Recordings', icon: Mic },
  { id: 'summary', label: 'Summary', icon: Sparkles },
];

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [microphones, setMicrophones] = useState<string[]>(['Default microphone']);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    loadMicrophoneOptions().then(setMicrophones);
  }, []);

  const handleSave = () => {
    updateSettings(draft);
  };

  const handleReset = () => {
    resetSettings();
    setDraft(defaultSettings);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-8 pt-6 text-macaron-text">
      <div className="mb-6">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-800">Settings</h1>
      </div>

      <WindowBox
        title="Preferences"
        colorClass="bg-green-50"
        borderColorClass="border-green-200"
        shadowClass="shadow-macaron-window-green"
        className="min-h-[720px] flex-1"
      >
        <div className="flex h-full flex-col bg-slate-50/50">
          <div className="flex flex-wrap gap-2 border-b-[2px] border-green-100 bg-white p-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-xl border-[2px] px-4 py-2.5 text-sm font-bold transition-all ${
                    active
                      ? 'border-green-300 bg-green-50 text-green-700 shadow-[2px_2px_0px_0px_#bbf7d0]'
                      : 'border-transparent bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="recordingsPath">
                    Default recordings path
                  </label>
                  <input
                    id="recordingsPath"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.recordingsPath}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, recordingsPath: event.target.value }))
                    }
                  />
                </div>
              </div>
            )}

            {activeTab === 'recording' && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="micDevice">
                    Microphone
                  </label>
                  <select
                    id="micDevice"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.micDevice}
                    onChange={(event) => setDraft((current) => ({ ...current, micDevice: event.target.value }))}
                  >
                    {microphones.map((microphone) => (
                      <option key={microphone} value={microphone}>
                        {microphone}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="transcriptionModel">
                    Upload transcription model
                  </label>
                  <input
                    id="transcriptionModel"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.transcriptionModel}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        transcriptionModel: event.target.value,
                      }))
                    }
                  />
                  <p className="mt-3 text-sm text-slate-500">
                    Used only when local upload analysis falls back to an OpenAI-compatible /audio/transcriptions endpoint.
                  </p>
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="liveTranscriptionLanguage">
                    Live transcription language
                  </label>
                  <select
                    id="liveTranscriptionLanguage"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.liveTranscriptionLanguage}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        liveTranscriptionLanguage: event.target.value as AppSettings['liveTranscriptionLanguage'],
                      }))
                    }
                  >
                    <option value="auto">Auto (use browser language)</option>
                    <option value="zh-CN">Chinese</option>
                    <option value="en-US">English</option>
                  </select>
                  <p className="mt-3 text-sm text-slate-500">
                    Live recording now prefers browser speech recognition for auto and Chinese. English can still use the built-in local whisper path.
                  </p>
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate md:col-span-2">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="transcriptionEndpoint">
                    Local or upload transcription endpoint
                  </label>
                  <input
                    id="transcriptionEndpoint"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.transcriptionEndpoint}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        transcriptionEndpoint: event.target.value,
                      }))
                    }
                    placeholder="Leave empty to reuse the summary endpoint"
                  />
                  <p className="mt-3 text-sm text-slate-500">
                    Defaults to the built-in light-Meetily local engines: Parakeet for multilingual upload analysis and whisper for English-leaning live chunks.
                  </p>
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate md:col-span-2">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="transcriptionApiKey">
                    Upload transcription API key
                  </label>
                  <input
                    id="transcriptionApiKey"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    type="password"
                    value={draft.transcriptionApiKey}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        transcriptionApiKey: event.target.value,
                      }))
                    }
                    placeholder="Leave empty to reuse the summary API key"
                  />
                </div>

                <label className="flex items-center justify-between gap-6 rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate md:col-span-2">
                  <div>
                    <p className="text-lg font-bold text-slate-800">Allow demo fallback for uploads</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Only use placeholder transcript text when a real transcription API is not configured.
                    </p>
                  </div>
                  <input
                    id="allowDemoFallbacks"
                    type="checkbox"
                    checked={draft.allowDemoFallbacks}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        allowDemoFallbacks: event.target.checked,
                      }))
                    }
                  />
                </label>
              </div>
            )}

            {activeTab === 'summary' && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="provider">
                    Summary provider
                  </label>
                  <select
                    id="provider"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.provider}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        provider: event.target.value as AppSettings['provider'],
                      }))
                    }
                  >
                    <option value="openai">OpenAI</option>
                    <option value="custom-openai">Custom OpenAI</option>
                  </select>
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="model">
                    Model
                  </label>
                  <input
                    id="model"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.model}
                    onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                  />
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate md:col-span-2">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="endpoint">
                    Summary endpoint
                  </label>
                  <input
                    id="endpoint"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.endpoint}
                    onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
                  />
                  <p className="mt-3 text-sm text-slate-500">
                    Keep the OpenAI base URL or provide an OpenAI-compatible endpoint.
                  </p>
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="apiKey">
                    Summary API key
                  </label>
                  <input
                    id="apiKey"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    type="password"
                    value={draft.apiKey}
                    onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                  />
                </div>

                <div className="rounded-[24px] border-[2px] border-slate-200 bg-white p-6 shadow-macaron-button-slate">
                  <label className="mb-3 block text-lg font-bold text-slate-800" htmlFor="templateId">
                    Summary template
                  </label>
                  <select
                    id="templateId"
                    className="w-full rounded-[18px] border-[2px] border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none focus:border-green-300"
                    value={draft.templateId}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        templateId: event.target.value as AppSettings['templateId'],
                      }))
                    }
                  >
                    <option value="standard-meeting">Standard meeting</option>
                    <option value="project-sync">Project sync</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t-[2px] border-green-100 bg-white p-4">
            <CuteButton icon={RefreshCcw} label="Reset" variant="neutral" onClick={handleReset} />
            <CuteButton icon={Save} label="Save settings" variant="primary" onClick={handleSave} />
          </div>
        </div>
      </WindowBox>
    </div>
  );
}
