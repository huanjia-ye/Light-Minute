import {
  getRecordingEngine,
  resolveFallbackRecordingEngineForSession,
  resolveRecordingEngineForSession,
} from './recordingEngine';

describe('recording engine selection', () => {
  const originalNavigatorLanguage = navigator.language;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'language', {
      value: originalNavigatorLanguage,
      configurable: true,
    });
  });

  it('falls back to the mock engine when speech recognition is unavailable', () => {
    expect(getRecordingEngine().mode).toBe('mock');
  });

  it('prefers browser speech recognition when available', () => {
    const originalSpeechRecognition = window.SpeechRecognition;

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend = null;

      start() {}
      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeSpeechRecognition;

    expect(getRecordingEngine().mode).toBe('browser-speech');

    window.SpeechRecognition = originalSpeechRecognition;
  });

  it('prefers the local whisper chunk fallback for the english preset when media recording is supported', () => {
    const originalMediaRecorder = window.MediaRecorder;
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      state = 'inactive';
      ondataavailable = null;
      onerror = null;
      onstop = null;

      start() {
        this.state = 'recording';
      }

      pause() {
        this.state = 'paused';
      }

      resume() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      value: FakeMediaRecorder,
      configurable: true,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    expect(getRecordingEngine('http://127.0.0.1:8178', 'en-US').mode).toBe('local-whisper-chunk');

    Object.defineProperty(window, 'MediaRecorder', {
      value: originalMediaRecorder,
      configurable: true,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: originalGetUserMedia,
      },
      configurable: true,
    });
  });

  it('prefers the local whisper chunk fallback for auto when the browser language resolves to english', () => {
    const originalMediaRecorder = window.MediaRecorder;
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      state = 'inactive';
      ondataavailable = null;
      onerror = null;
      onstop = null;

      start() {
        this.state = 'recording';
      }

      pause() {
        this.state = 'paused';
      }

      resume() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      value: FakeMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      configurable: true,
    });

    expect(getRecordingEngine('http://127.0.0.1:8178', 'auto').mode).toBe('local-whisper-chunk');

    Object.defineProperty(window, 'MediaRecorder', {
      value: originalMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: originalGetUserMedia,
      },
      configurable: true,
    });
  });

  it('prefers browser speech for auto with chinese browser language or explicit chinese even when a local endpoint exists', () => {
    const originalSpeechRecognition = window.SpeechRecognition;

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'zh-CN';
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend = null;

      start() {}
      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeSpeechRecognition;
    Object.defineProperty(navigator, 'language', {
      value: 'zh-CN',
      configurable: true,
    });

    expect(getRecordingEngine('http://127.0.0.1:8178', 'auto').mode).toBe('browser-speech');
    expect(getRecordingEngine('http://127.0.0.1:8178', 'zh-CN').mode).toBe('browser-speech');

    window.SpeechRecognition = originalSpeechRecognition;
  });

  it('prefers the realtime whisper engine when adapter capabilities support the session language', async () => {
    const originalAudioContext = window.AudioContext;
    const originalWebSocket = window.WebSocket;
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          protocolVersion: 'v1',
          audioFormat: {
            encoding: 'pcm_s16le',
            sampleRate: 16000,
            channels: 1,
          },
          supportsPartials: true,
          supportsFinals: true,
          supportedLanguages: ['zh-CN', 'en-US'],
        }),
      }),
    );

    const selectedEngine = await resolveRecordingEngineForSession({
      transcriptionEndpoint: '',
      liveTranscriptionLanguage: 'zh-CN',
      sessionLanguage: 'zh-CN',
    });

    expect(selectedEngine.mode).toBe('local-whisper-live');

    Object.defineProperty(window, 'AudioContext', {
      value: originalAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: originalWebSocket,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: originalGetUserMedia,
      },
      configurable: true,
    });
  });

  it('falls back to browser speech when realtime capabilities do not support the session language', async () => {
    const originalSpeechRecognition = window.SpeechRecognition;

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend = null;

      start() {}
      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeSpeechRecognition;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          protocolVersion: 'v1',
          audioFormat: {
            encoding: 'pcm_s16le',
            sampleRate: 16000,
            channels: 1,
          },
          supportsPartials: true,
          supportsFinals: true,
          supportedLanguages: ['en-US'],
        }),
      }),
    );

    const selectedEngine = await resolveRecordingEngineForSession({
      transcriptionEndpoint: '',
      liveTranscriptionLanguage: 'zh-CN',
      sessionLanguage: 'zh-CN',
    });

    expect(selectedEngine.mode).toBe('browser-speech');

    window.SpeechRecognition = originalSpeechRecognition;
  });

  it('fails loudly in realtime-only mode when the realtime adapter cannot serve the requested language', async () => {
    const originalAudioContext = window.AudioContext;
    const originalWebSocket = window.WebSocket;
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;

    Object.defineProperty(window, 'AudioContext', {
      value: class FakeAudioContext {},
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: class FakeWebSocket {},
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          protocolVersion: 'v1',
          audioFormat: {
            encoding: 'pcm_s16le',
            sampleRate: 16000,
            channels: 1,
          },
          supportsPartials: true,
          supportsFinals: true,
          supportedLanguages: ['en-US'],
        }),
      }),
    );

    await expect(
      resolveRecordingEngineForSession({
        transcriptionEndpoint: '',
        liveTranscriptionLanguage: 'zh-CN',
        liveTranscriptionRoute: 'realtime-only',
        sessionLanguage: 'zh-CN',
      }),
    ).rejects.toThrow('Realtime-only mode is enabled');

    Object.defineProperty(window, 'AudioContext', {
      value: originalAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, 'WebSocket', {
      value: originalWebSocket,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: originalGetUserMedia,
      },
      configurable: true,
    });
  });

  it('uses fallback-only mode to skip realtime selection and choose the browser engine directly', async () => {
    const originalSpeechRecognition = window.SpeechRecognition;

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend = null;

      start() {}
      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeSpeechRecognition;

    const selectedEngine = await resolveRecordingEngineForSession({
      transcriptionEndpoint: '',
      liveTranscriptionLanguage: 'en-US',
      liveTranscriptionRoute: 'fallback-only',
      sessionLanguage: 'en-US',
    });

    expect(selectedEngine.mode).toBe('browser-speech');

    window.SpeechRecognition = originalSpeechRecognition;
  });

  it('keeps start-time fallback limited to real engines instead of mock', () => {
    const originalSpeechRecognition = window.SpeechRecognition;

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'zh-CN';
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend = null;

      start() {}
      stop() {}
      abort() {}
    }

    window.SpeechRecognition = FakeSpeechRecognition;

    const fallbackEngine = resolveFallbackRecordingEngineForSession({
      transcriptionEndpoint: '',
      liveTranscriptionLanguage: 'zh-CN',
      liveTranscriptionRoute: 'prefer-realtime',
      sessionLanguage: 'zh-CN',
    });

    expect(fallbackEngine?.mode).toBe('browser-speech');

    window.SpeechRecognition = originalSpeechRecognition;
  });
});
