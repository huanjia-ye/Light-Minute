import { createId } from '../../lib/storage';
import type { LiveTranscriptionLanguage } from '../../types/settings';
import { hasUsableTranscriptText, sanitizeTranscriptText } from './transcriptSanitizer';
import type { RecordingEngine, RecordingEngineCallbacks, RecordingEngineSnapshot } from './engineTypes';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionResultList {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

type EngineState = 'idle' | 'recording' | 'paused';

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function buildErrorMessage(error: string) {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Microphone permission was denied. Please allow microphone access and try again.';
  }

  if (error === 'audio-capture') {
    return 'No microphone could be found. Please check your audio input device.';
  }

  if (error === 'network') {
    return 'Speech recognition could not reach the browser service. Please check your connection and retry.';
  }

  if (error === 'language-not-supported') {
    return 'The current browser language is not supported by speech recognition.';
  }

  return 'Speech recognition stopped unexpectedly. Please try again.';
}

class BrowserSpeechEngine implements RecordingEngine {
  readonly mode = 'browser-speech' as const;

  private state: EngineState = 'idle';
  private elapsedSeconds = 0;
  private emittedCount = 0;
  private tickTimer: number | null = null;
  private callbacks: RecordingEngineCallbacks | null = null;
  private recognition: BrowserSpeechRecognition | null = null;
  private shouldContinue = false;
  private preferredLanguage: LiveTranscriptionLanguage;

  constructor(preferredLanguage: LiveTranscriptionLanguage = 'auto') {
    this.preferredLanguage = preferredLanguage;
  }

  isSupported() {
    return Boolean(getSpeechRecognitionConstructor());
  }

  start(callbacks: RecordingEngineCallbacks) {
    const Recognition = getSpeechRecognitionConstructor();

    if (!Recognition) {
      throw new Error('Speech recognition is not available in this browser.');
    }

    this.reset();
    this.state = 'recording';
    this.callbacks = callbacks;
    this.shouldContinue = true;
    this.startTicking();
    this.startRecognition(Recognition);
  }

  pause() {
    if (this.state !== 'recording') {
      return;
    }

    this.state = 'paused';
    this.shouldContinue = false;
    this.clearTickTimer();
    this.recognition?.stop();
  }

  resume() {
    const Recognition = getSpeechRecognitionConstructor();

    if (this.state !== 'paused' || !Recognition) {
      return;
    }

    this.state = 'recording';
    this.shouldContinue = true;
    this.startTicking();
    this.startRecognition(Recognition);
  }

  async stop(): Promise<RecordingEngineSnapshot> {
    const snapshot = {
      elapsedSeconds: this.elapsedSeconds,
      emittedCount: this.emittedCount,
      mode: this.mode,
    };

    this.shouldContinue = false;
    this.recognition?.stop();
    this.reset();

    return snapshot;
  }

  private startTicking() {
    this.clearTickTimer();
    this.tickTimer = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.callbacks?.onTick(this.elapsedSeconds);
    }, 1000);
  }

  private startRecognition(Recognition: BrowserSpeechRecognitionConstructor) {
    const recognition = new Recognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      this.preferredLanguage === 'auto'
        ? navigator.language || 'en-US'
        : this.preferredLanguage;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];

        if (!result.isFinal) {
          continue;
        }

        const text = sanitizeTranscriptText(result[0]?.transcript ?? '');
        if (!hasUsableTranscriptText(text)) {
          continue;
        }

        const endTime = Math.max(this.elapsedSeconds, 1);
        const startTime = Math.max(endTime - 4, 0);

        this.callbacks?.onSegment({
          id: createId('segment-live'),
          startTime,
          endTime,
          text,
          confidence: result[0]?.confidence || 0.92,
        });
        this.emittedCount += 1;
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        return;
      }

      this.callbacks?.onError?.(buildErrorMessage(event.error));
      this.shouldContinue = false;
      this.state = 'idle';
      this.clearTickTimer();
    };

    recognition.onend = () => {
      if (this.recognition !== recognition) {
        return;
      }

      this.recognition = null;

      if (this.state === 'recording' && this.shouldContinue) {
        this.startRecognition(Recognition);
      }
    };

    this.recognition = recognition;
    recognition.start();
  }

  private clearTickTimer() {
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private reset() {
    this.clearTickTimer();
    this.state = 'idle';
    this.elapsedSeconds = 0;
    this.emittedCount = 0;
    this.callbacks = null;
    this.recognition = null;
    this.shouldContinue = false;
  }
}

export function createBrowserSpeechEngine(preferredLanguage: LiveTranscriptionLanguage = 'auto') {
  return new BrowserSpeechEngine(preferredLanguage);
}

export const browserSpeechEngine = createBrowserSpeechEngine();
