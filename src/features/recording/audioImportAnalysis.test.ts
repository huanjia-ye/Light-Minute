import { analyzeImportedAudio } from './audioImportAnalysis';
import { defaultSettings } from '../settings/store';

describe('audio import analysis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the local Light-Minute Parakeet helper for multilingual uploads without requiring an api key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '[MUSIC] First imported sentence. Second imported sentence.',
      }),
    } as Response);

    const file = new File(['audio'], 'sync.wav', { type: 'audio/wav' });
    const result = await analyzeImportedAudio(file, {
      ...defaultSettings,
      apiKey: '',
      transcriptionApiKey: '',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/__light_parakeet/transcribe',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result.mode).toBe('local-parakeet');
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments[0]?.text).toMatch(/First imported sentence/i);
  });

  it('falls back to the local whisper server when the local Parakeet helper is unavailable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new Error('proxy offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: '[MUSIC] First imported sentence. Second imported sentence.',
        }),
      } as Response);

    const file = new File(['audio'], 'sync.wav', { type: 'audio/wav' });
    const result = await analyzeImportedAudio(file, {
      ...defaultSettings,
      apiKey: '',
      transcriptionApiKey: '',
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      '/__light_whisper/inference',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:8178/inference',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result.mode).toBe('local-whisper');
  });

  it('tries the direct local Parakeet port when the dev proxy path is unavailable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('proxy offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'Direct local parakeet transcription works.',
        }),
      } as Response);

    const file = new File(['audio'], 'sync.wav', { type: 'audio/wav' });
    const result = await analyzeImportedAudio(file, {
      ...defaultSettings,
      apiKey: '',
      transcriptionApiKey: '',
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8179/transcribe',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result.mode).toBe('local-parakeet');
  });

  it('requires a real provider only when neither local runtime nor api settings are configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const file = new File(['audio'], 'sync.wav', { type: 'audio/wav' });

    await expect(
      analyzeImportedAudio(file, {
        ...defaultSettings,
        apiKey: '',
        endpoint: '',
        transcriptionApiKey: '',
        transcriptionEndpoint: '',
        allowDemoFallbacks: false,
      }),
    ).rejects.toThrow(/optional Light-Minute local transcription runtime is not reachable/i);
  });

  it('allows explicit demo fallback when the setting is turned on', async () => {
    const file = new File(['audio'], 'sync.wav', { type: 'audio/wav' });
    const result = await analyzeImportedAudio(file, {
      ...defaultSettings,
      apiKey: '',
      endpoint: '',
      transcriptionApiKey: '',
      transcriptionEndpoint: '',
      allowDemoFallbacks: true,
    });

    expect(result.mode).toBe('mock');
    expect(result.segments.length).toBeGreaterThan(0);
  });
});
