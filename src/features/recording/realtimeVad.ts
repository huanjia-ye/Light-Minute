import { REALTIME_DEFAULT_CAPTURE } from './realtimeConstants';
import type { VoiceState } from './realtimeTypes';

const DEFAULT_NOISE_FLOOR = 0.0025;
const MIN_RMS_THRESHOLD = 0.008;
const MIN_PEAK_THRESHOLD = 0.045;
const RMS_THRESHOLD_OFFSET = 0.006;
const RMS_THRESHOLD_MULTIPLIER = 3.5;
const NOISE_FLOOR_SMOOTHING = 0.08;

export interface RealtimeVadOptions {
  frameMs?: number;
  calibrationMs?: number;
  speechStartMs?: number;
  silenceEndMs?: number;
  prerollMs?: number;
  hangoverMs?: number;
  maxUtteranceMs?: number;
}

export interface RealtimeVadFrameInput {
  rms: number;
  peak: number;
}

export interface RealtimeVadFrameResult {
  voiceState: VoiceState;
  rawSpeech: boolean;
  frameHasSpeech: boolean;
  speechStarted: boolean;
  speechStartFrameCount: number;
  utteranceBoundaryReason: 'force' | null;
  isCalibrating: boolean;
  noiseFloor: number;
  speechThreshold: number;
  peakThreshold: number;
}

interface NormalizedRealtimeVadOptions {
  frameMs: number;
  calibrationFrames: number;
  speechStartFrames: number;
  silenceEndFrames: number;
  prerollFrames: number;
  hangoverFrames: number;
  maxUtteranceFrames: number;
}

function toFrameCount(durationMs: number, frameMs: number) {
  return Math.max(1, Math.ceil(durationMs / frameMs));
}

function normalizeVadOptions(options: RealtimeVadOptions = {}): NormalizedRealtimeVadOptions {
  const frameMs = options.frameMs ?? REALTIME_DEFAULT_CAPTURE.frameMs;

  return {
    frameMs,
    calibrationFrames: toFrameCount(
      options.calibrationMs ?? REALTIME_DEFAULT_CAPTURE.calibrationMs,
      frameMs,
    ),
    speechStartFrames: toFrameCount(
      options.speechStartMs ?? REALTIME_DEFAULT_CAPTURE.speechStartMs,
      frameMs,
    ),
    silenceEndFrames: toFrameCount(
      options.silenceEndMs ?? REALTIME_DEFAULT_CAPTURE.silenceEndMs,
      frameMs,
    ),
    prerollFrames: toFrameCount(
      options.prerollMs ?? REALTIME_DEFAULT_CAPTURE.prerollMs,
      frameMs,
    ),
    hangoverFrames: toFrameCount(
      options.hangoverMs ?? REALTIME_DEFAULT_CAPTURE.hangoverMs,
      frameMs,
    ),
    maxUtteranceFrames: toFrameCount(
      options.maxUtteranceMs ?? REALTIME_DEFAULT_CAPTURE.maxUtteranceMs,
      frameMs,
    ),
  };
}

function clamp01(value: number) {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

type VadInternalState = 'calibrating' | 'silence' | 'speech';

export class RealtimeVad {
  private readonly options: NormalizedRealtimeVadOptions;
  private state: VadInternalState = 'calibrating';
  private voiceState: VoiceState = 'unknown';
  private calibrationFrameCount = 0;
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;
  private utteranceFrameCount = 0;
  private noiseFloor = DEFAULT_NOISE_FLOOR;

  constructor(options: RealtimeVadOptions = {}) {
    this.options = normalizeVadOptions(options);
  }

  reset() {
    this.state = 'calibrating';
    this.voiceState = 'unknown';
    this.calibrationFrameCount = 0;
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.utteranceFrameCount = 0;
    this.noiseFloor = DEFAULT_NOISE_FLOOR;
  }

  getCurrentVoiceState() {
    return this.voiceState;
  }

  consumeFrame(input: RealtimeVadFrameInput): RealtimeVadFrameResult {
    const rms = clamp01(input.rms);
    const peak = clamp01(input.peak);
    let speechStarted = false;
    let speechStartFrameCount = 0;
    let utteranceBoundaryReason: 'force' | null = null;

    if (this.state === 'calibrating') {
      this.calibrationFrameCount += 1;
      this.noiseFloor =
        this.calibrationFrameCount === 1
          ? Math.max(DEFAULT_NOISE_FLOOR, rms)
          : this.noiseFloor + ((rms - this.noiseFloor) / this.calibrationFrameCount);

      if (this.calibrationFrameCount >= this.options.calibrationFrames) {
        this.state = 'silence';
        this.voiceState = 'silence';
      }

      return {
        voiceState: this.voiceState,
        rawSpeech: false,
        frameHasSpeech: false,
        speechStarted,
        speechStartFrameCount,
        utteranceBoundaryReason,
        isCalibrating: this.state === 'calibrating',
        noiseFloor: this.noiseFloor,
        speechThreshold: this.getSpeechThreshold(),
        peakThreshold: this.getPeakThreshold(),
      };
    }

    const speechThreshold = this.getSpeechThreshold();
    const peakThreshold = this.getPeakThreshold();
    const rawSpeech = rms >= speechThreshold || peak >= peakThreshold;

    if (this.state !== 'speech' && !rawSpeech) {
      this.noiseFloor += (rms - this.noiseFloor) * NOISE_FLOOR_SMOOTHING;
    }

    if (rawSpeech) {
      this.consecutiveSpeechFrames += 1;
      this.consecutiveSilenceFrames = 0;
    } else {
      this.consecutiveSpeechFrames = 0;
      if (this.state === 'speech') {
        this.consecutiveSilenceFrames += 1;
      }
    }

    let frameHasSpeech = rawSpeech;

    if (this.state !== 'speech' && this.consecutiveSpeechFrames >= this.options.speechStartFrames) {
      this.state = 'speech';
      this.voiceState = 'speech';
      this.utteranceFrameCount = this.consecutiveSpeechFrames;
      this.consecutiveSilenceFrames = 0;
      speechStarted = true;
      speechStartFrameCount = this.consecutiveSpeechFrames;
      frameHasSpeech = true;
    } else if (this.state === 'speech') {
      this.utteranceFrameCount += 1;
      const withinHangover =
        rawSpeech || this.consecutiveSilenceFrames <= this.options.hangoverFrames;
      frameHasSpeech = withinHangover;

      if (
        this.consecutiveSilenceFrames >= this.options.silenceEndFrames ||
        this.utteranceFrameCount >= this.options.maxUtteranceFrames
      ) {
        utteranceBoundaryReason =
          this.utteranceFrameCount >= this.options.maxUtteranceFrames
            ? 'force'
            : null;
        this.state = 'silence';
        this.voiceState = 'silence';
        this.utteranceFrameCount = 0;
        this.consecutiveSpeechFrames = 0;
        this.consecutiveSilenceFrames = 0;
      }
    } else {
      this.voiceState = 'silence';
    }

    return {
      voiceState: this.voiceState,
      rawSpeech,
      frameHasSpeech,
      speechStarted,
      speechStartFrameCount,
      utteranceBoundaryReason,
      isCalibrating: false,
      noiseFloor: this.noiseFloor,
      speechThreshold,
      peakThreshold,
    };
  }

  private getSpeechThreshold() {
    return Math.max(
      MIN_RMS_THRESHOLD,
      this.noiseFloor * RMS_THRESHOLD_MULTIPLIER,
      this.noiseFloor + RMS_THRESHOLD_OFFSET,
    );
  }

  private getPeakThreshold() {
    return Math.max(MIN_PEAK_THRESHOLD, this.getSpeechThreshold() * 2.4);
  }
}

export function createRealtimeVad(options: RealtimeVadOptions = {}) {
  return new RealtimeVad(options);
}
