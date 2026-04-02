import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings, useSettingsStore } from '../../features/settings/store';
import { SettingsPage } from './SettingsPage';

describe('settings page', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: defaultSettings });
  });

  it('saves and resets summary settings', async () => {
    const user = userEvent.setup();

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /default recordings path/i })).toBeInTheDocument();
    });

    await user.clear(screen.getByRole('textbox', { name: /default recordings path/i }));
    await user.type(screen.getByRole('textbox', { name: /default recordings path/i }), 'D:/Meetings');

    await user.click(screen.getByRole('button', { name: /summary/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /summary provider/i }), 'custom-openai');
    await user.clear(screen.getByRole('textbox', { name: /model/i }));
    await user.type(screen.getByRole('textbox', { name: /model/i }), 'gpt-4.1');
    await user.clear(screen.getByRole('textbox', { name: /endpoint/i }));
    await user.type(screen.getByRole('textbox', { name: /endpoint/i }), 'https://api.example.com/v1');
    await user.type(screen.getByLabelText(/api key/i), 'demo-key');
    await user.selectOptions(screen.getByRole('combobox', { name: /summary template/i }), 'project-sync');

    await user.click(screen.getByRole('button', { name: /recordings/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /microphone/i }), 'USB microphone');
    await user.clear(screen.getByRole('textbox', { name: /upload transcription model/i }));
    await user.type(screen.getByRole('textbox', { name: /upload transcription model/i }), 'whisper-1');
    await user.selectOptions(screen.getByRole('combobox', { name: /live transcription language/i }), 'zh-CN');
    await user.clear(screen.getByRole('textbox', { name: /local or upload transcription endpoint/i }));
    await user.type(
      screen.getByRole('textbox', { name: /local or upload transcription endpoint/i }),
      'https://audio.example.com/v1',
    );
    await user.type(screen.getByLabelText(/upload transcription api key/i), 'transcribe-key');
    await user.click(screen.getByRole('checkbox', { name: /allow demo fallback for uploads/i }));
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(useSettingsStore.getState().settings).toMatchObject({
      provider: 'custom-openai',
      model: 'gpt-4.1',
      endpoint: 'https://api.example.com/v1',
      apiKey: 'demo-key',
      templateId: 'project-sync',
      micDevice: 'USB microphone',
      transcriptionModel: 'whisper-1',
      liveTranscriptionLanguage: 'zh-CN',
      transcriptionEndpoint: 'https://audio.example.com/v1',
      transcriptionApiKey: 'transcribe-key',
      recordingsPath: 'D:/Meetings',
      allowDemoFallbacks: true,
    });

    await user.click(screen.getByRole('button', { name: /reset/i }));
    await user.click(screen.getByRole('button', { name: /summary/i }));

    expect(useSettingsStore.getState().settings).toEqual(defaultSettings);
    expect(screen.getByRole('textbox', { name: /model/i })).toHaveValue(defaultSettings.model);
  }, 15000);
});
