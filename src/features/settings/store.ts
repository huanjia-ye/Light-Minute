import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getBrowserStorage } from '../../lib/browserStorage';
import type { AppSettings } from '../../types/settings';

const defaultSettings: AppSettings = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  transcriptionModel: 'whisper-1',
  transcriptionEndpoint: 'http://127.0.0.1:8178',
  transcriptionApiKey: '',
  liveTranscriptionLanguage: 'auto',
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  recordingsPath: 'C:/Recordings/light-meetily',
  micDevice: 'Default microphone',
  templateId: 'standard-meeting',
  allowDemoFallbacks: false,
};

interface SettingsStore {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    provider: settings?.provider ?? defaultSettings.provider,
    model: settings?.model ?? defaultSettings.model,
    transcriptionModel: settings?.transcriptionModel ?? defaultSettings.transcriptionModel,
    transcriptionEndpoint: settings?.transcriptionEndpoint ?? defaultSettings.transcriptionEndpoint,
    transcriptionApiKey: settings?.transcriptionApiKey ?? defaultSettings.transcriptionApiKey,
    liveTranscriptionLanguage:
      settings?.liveTranscriptionLanguage ?? defaultSettings.liveTranscriptionLanguage,
    endpoint: settings?.endpoint ?? defaultSettings.endpoint,
    apiKey: settings?.apiKey ?? defaultSettings.apiKey,
    recordingsPath: settings?.recordingsPath ?? defaultSettings.recordingsPath,
    micDevice: settings?.micDevice ?? defaultSettings.micDevice,
    templateId: settings?.templateId ?? defaultSettings.templateId,
    allowDemoFallbacks: settings?.allowDemoFallbacks ?? defaultSettings.allowDemoFallbacks,
  };
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (patch) =>
        set((state) => ({
          settings: normalizeSettings({
            ...state.settings,
            ...patch,
          }),
        })),
      resetSettings: () => set({ settings: normalizeSettings(defaultSettings) }),
    }),
    {
      name: 'light-meetily:settings',
      storage: createJSONStorage(getBrowserStorage),
      merge: (persistedState, currentState) => {
        const typedState = persistedState as Partial<SettingsStore> | undefined;

        return {
          ...currentState,
          ...typedState,
          settings: normalizeSettings(typedState?.settings),
        };
      },
    },
  ),
);

export { defaultSettings, normalizeSettings };
