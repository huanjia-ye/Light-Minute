import { getRecordingEngine } from './recordingEngine';

describe('recording engine selection', () => {
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

  it('prefers local whisper live transcription for the english preset when media recording is supported', () => {
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

    expect(getRecordingEngine('http://127.0.0.1:8178', 'en-US').mode).toBe('local-whisper-live');

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

  it('prefers browser speech for auto or chinese live transcription even when a local endpoint exists', () => {
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

    expect(getRecordingEngine('http://127.0.0.1:8178', 'auto').mode).toBe('browser-speech');
    expect(getRecordingEngine('http://127.0.0.1:8178', 'zh-CN').mode).toBe('browser-speech');

    window.SpeechRecognition = originalSpeechRecognition;
  });
});
