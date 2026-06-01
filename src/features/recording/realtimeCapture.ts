import { REALTIME_DEFAULT_AUDIO_FORMAT, REALTIME_DEFAULT_CAPTURE } from './realtimeConstants';
import type { AudioChunk, MicStatus, VoiceState } from './realtimeTypes';
import { RealtimeVad, type RealtimeVadOptions } from './realtimeVad';

const DEFAULT_MIC_DEVICE_LABEL = 'Default microphone';
const WORKLET_PROCESSOR_NAME = 'light-minute-realtime-capture';

export interface RealtimeCaptureChunk {
  chunk: AudioChunk;
  pcmBytes: Uint8Array;
  payloadBase64: string;
}

export interface RealtimeCaptureCallbacks {
  onChunk?: (chunk: RealtimeCaptureChunk) => void;
  onMicStatus?: (status: MicStatus) => void;
  onVoiceState?: (voiceState: VoiceState) => void;
  onError?: (error: Error) => void;
}

export interface RealtimeCaptureStartOptions extends RealtimeCaptureCallbacks {
  sessionId: string;
  micDevice?: string;
  vad?: RealtimeVadOptions;
}

export interface RealtimeAudioFrame {
  startMs: number;
  endMs: number;
  samples: Float32Array;
  rms: number;
  peak: number;
}

interface BufferedFrame extends RealtimeAudioFrame {
  hasSpeech: boolean;
}

interface RealtimeCaptureFrameMessage {
  type: 'frame';
  samples: ArrayBuffer;
  rms: number;
  peak: number;
}

interface RealtimeChunkAssemblerOptions {
  sessionId: string;
  vad?: RealtimeVadOptions;
}

function toFrameCount(durationMs: number, frameMs: number) {
  return Math.max(0, Math.ceil(durationMs / frameMs));
}

function createAudioContext() {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    throw new Error('Web Audio is not available in this browser.');
  }

  return new window.AudioContext({
    sampleRate: REALTIME_DEFAULT_AUDIO_FORMAT.sampleRate,
    latencyHint: 'interactive',
  });
}

function getFrameSamples() {
  return Math.round(
    (REALTIME_DEFAULT_AUDIO_FORMAT.sampleRate * REALTIME_DEFAULT_CAPTURE.frameMs) / 1000,
  );
}

function getChunkFrameCount() {
  return Math.max(
    1,
    Math.round(REALTIME_DEFAULT_AUDIO_FORMAT.clientChunkMs / REALTIME_DEFAULT_CAPTURE.frameMs),
  );
}

function normalizeSample(value: number) {
  if (value < -1) {
    return -1;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function concatFrameSamples(frames: BufferedFrame[]) {
  const totalSamples = frames.reduce((sum, frame) => sum + frame.samples.length, 0);
  const combined = new Float32Array(totalSamples);
  let offset = 0;

  frames.forEach((frame) => {
    combined.set(frame.samples, offset);
    offset += frame.samples.length;
  });

  return combined;
}

export function encodeFloat32ToPcm16(samples: Float32Array) {
  const pcmBytes = new Uint8Array(samples.length * 2);
  const view = new DataView(pcmBytes.buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const normalized = normalizeSample(samples[index]);
    const sampleValue =
      normalized < 0
        ? Math.round(normalized * 0x8000)
        : Math.round(normalized * 0x7fff);

    view.setInt16(index * 2, sampleValue, true);
  }

  return pcmBytes;
}

export function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';

  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary);
}

async function resolveMicDeviceId(micDevice?: string) {
  if (
    !micDevice ||
    micDevice === DEFAULT_MIC_DEVICE_LABEL ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return undefined;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const matchingDevice = devices.find(
      (device) =>
        device.kind === 'audioinput' &&
        device.label.trim() &&
        device.label === micDevice &&
        device.deviceId,
    );

    return matchingDevice?.deviceId || undefined;
  } catch {
    return undefined;
  }
}

async function createAudioConstraints(micDevice?: string): Promise<MediaStreamConstraints> {
  const deviceId = await resolveMicDeviceId(micDevice);

  return {
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };
}

function createEmptyFloat32Array() {
  return new Float32Array(0);
}

export class RealtimeChunkAssembler {
  private readonly sessionId: string;
  private readonly vad: RealtimeVad;
  private readonly chunkFrameCount = getChunkFrameCount();
  private readonly frameSamples = getFrameSamples();
  private readonly prerollFrameCount: number;
  private readonly bufferedFrames: BufferedFrame[] = [];
  private voiceState: VoiceState = 'unknown';
  private nextChunkSeq = 0;
  private elapsedMs = 0;

  constructor(options: RealtimeChunkAssemblerOptions) {
    this.sessionId = options.sessionId;
    this.vad = new RealtimeVad(options.vad);
    const frameMs = options.vad?.frameMs ?? REALTIME_DEFAULT_CAPTURE.frameMs;
    this.prerollFrameCount = toFrameCount(
      options.vad?.prerollMs ?? REALTIME_DEFAULT_CAPTURE.prerollMs,
      frameMs,
    );
  }

  getCurrentVoiceState() {
    return this.voiceState;
  }

  getElapsedMs() {
    return this.elapsedMs;
  }

  pushFrame(frame: RealtimeAudioFrame) {
    this.elapsedMs = frame.endMs;

    const vadResult = this.vad.consumeFrame({
      rms: frame.rms,
      peak: frame.peak,
    });

    this.voiceState = vadResult.voiceState;
    this.bufferedFrames.push({
      ...frame,
      hasSpeech: vadResult.frameHasSpeech,
    });

    if (vadResult.speechStarted) {
      this.backfillPrerollFrames(vadResult.speechStartFrameCount);
    }

    const chunks: RealtimeCaptureChunk[] = [];
    while (this.bufferedFrames.length >= this.chunkFrameCount + this.getHoldFrameCount()) {
      const nextFrames = this.bufferedFrames.splice(0, this.chunkFrameCount);
      chunks.push(this.buildChunk(nextFrames, false));
    }

    if (vadResult.utteranceBoundaryReason === 'force') {
      if (this.bufferedFrames.length > 0) {
        const remainingFrames = this.bufferedFrames.splice(0, this.bufferedFrames.length);
        chunks.push(this.buildChunk(remainingFrames, false, 'force'));
      } else if (chunks.length > 0) {
        chunks[chunks.length - 1] = this.withBoundaryReason(chunks[chunks.length - 1], 'force');
      }
    }

    return {
      voiceState: this.voiceState,
      chunks,
    };
  }

  flush(isLast: boolean) {
    if (this.bufferedFrames.length === 0) {
      if (!isLast) {
        return [];
      }

      return [this.buildChunk([], true)];
    }

    const remainingFrames = this.bufferedFrames.splice(0, this.bufferedFrames.length);
    return [this.buildChunk(remainingFrames, isLast)];
  }

  resetForResume() {
    this.bufferedFrames.splice(0, this.bufferedFrames.length);
    this.vad.reset();
    this.voiceState = 'unknown';
  }

  private getHoldFrameCount() {
    return this.voiceState === 'speech' ? 0 : this.prerollFrameCount;
  }

  private backfillPrerollFrames(speechStartFrameCount: number) {
    const framesToMark = Math.min(
      this.bufferedFrames.length,
      this.prerollFrameCount + Math.max(1, speechStartFrameCount),
    );

    for (
      let index = this.bufferedFrames.length - framesToMark;
      index < this.bufferedFrames.length;
      index += 1
    ) {
      if (index < 0) {
        continue;
      }

      this.bufferedFrames[index] = {
        ...this.bufferedFrames[index],
        hasSpeech: true,
      };
    }
  }

  private withBoundaryReason(chunk: RealtimeCaptureChunk, boundaryReason: 'force') {
    return {
      ...chunk,
      chunk: {
        ...chunk.chunk,
        boundaryReason,
      },
    };
  }

  private buildChunk(
    frames: BufferedFrame[],
    isLast: boolean,
    boundaryReason: 'force' | null = null,
  ): RealtimeCaptureChunk {
    const audioSamples = frames.length > 0 ? concatFrameSamples(frames) : createEmptyFloat32Array();
    const pcmBytes = encodeFloat32ToPcm16(audioSamples);
    const firstFrame = frames[0];
    const lastFrame = frames[frames.length - 1];
    const startMs = firstFrame?.startMs ?? this.elapsedMs;
    const endMs = lastFrame?.endMs ?? this.elapsedMs;
    const hasSpeech = frames.some((frame) => frame.hasSpeech);

    if (frames.some((frame) => frame.samples.length !== this.frameSamples)) {
      throw new Error('Realtime capture frame length mismatch detected.');
    }

    const chunk: AudioChunk = {
      sessionId: this.sessionId,
      seq: this.nextChunkSeq,
      startMs,
      endMs,
      hasSpeech,
      isLast,
      boundaryReason,
    };

    this.nextChunkSeq += 1;

    return {
      chunk,
      pcmBytes,
      payloadBase64: encodeBytesToBase64(pcmBytes),
    };
  }
}

export class RealtimeCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private muteNode: GainNode | null = null;
  private callbacks: RealtimeCaptureCallbacks = {};
  private assembler: RealtimeChunkAssembler | null = null;
  private frameCursor = 0;
  private isPaused = false;
  private isStarted = false;

  async start(options: RealtimeCaptureStartOptions) {
    if (this.isStarted) {
      throw new Error('Realtime capture has already been started.');
    }

    this.callbacks = {
      onChunk: options.onChunk,
      onMicStatus: options.onMicStatus,
      onVoiceState: options.onVoiceState,
      onError: options.onError,
    };
    this.assembler = new RealtimeChunkAssembler({
      sessionId: options.sessionId,
      vad: options.vad,
    });
    this.frameCursor = 0;
    this.isPaused = false;
    this.isStarted = true;

    try {
      this.callbacks.onMicStatus?.('requesting_permission');

      const constraints = await createAudioConstraints(options.micDevice);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioContext = createAudioContext();

      await audioContext.audioWorklet.addModule(
        new URL('./worklets/realtimeCapture.worklet.ts', import.meta.url).href,
      );

      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      const workletNode = new AudioWorkletNode(audioContext, WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: REALTIME_DEFAULT_AUDIO_FORMAT.channels,
      });
      const muteNode = audioContext.createGain();
      muteNode.gain.value = 0;

      workletNode.port.onmessage = (event: MessageEvent<RealtimeCaptureFrameMessage>) => {
        this.handleFrameMessage(event.data);
      };

      mediaStream.getTracks().forEach((track) => {
        track.onended = () => {
          this.callbacks.onMicStatus?.('ended');
        };
      });

      sourceNode.connect(workletNode);
      workletNode.connect(muteNode);
      muteNode.connect(audioContext.destination);

      this.mediaStream = mediaStream;
      this.audioContext = audioContext;
      this.sourceNode = sourceNode;
      this.workletNode = workletNode;
      this.muteNode = muteNode;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      this.callbacks.onMicStatus?.('ready');
      this.callbacks.onVoiceState?.('unknown');
    } catch (error) {
      this.cleanup().catch(() => {});

      const nextError =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? new Error('Microphone permission was denied.')
          : error instanceof Error
            ? error
            : new Error('Realtime capture could not be started.');

      const micStatus =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'denied'
          : 'error';
      this.callbacks.onMicStatus?.(micStatus);
      this.callbacks.onError?.(nextError);
      throw nextError;
    }
  }

  pause() {
    if (!this.isStarted || this.isPaused || !this.assembler) {
      return [];
    }

    this.isPaused = true;
    const chunks = this.assembler.flush(false);
    chunks.forEach((chunk) => this.callbacks.onChunk?.(chunk));
    return chunks;
  }

  resume() {
    if (!this.isStarted || !this.isPaused || !this.assembler) {
      return;
    }

    this.isPaused = false;
    this.assembler.resetForResume();
    this.callbacks.onVoiceState?.('unknown');
  }

  stop() {
    if (!this.assembler) {
      return Promise.resolve([]);
    }

    const chunks = this.assembler.flush(true);
    chunks.forEach((chunk) => this.callbacks.onChunk?.(chunk));

    return this.cleanup().then(() => chunks);
  }

  async dispose() {
    await this.cleanup();
  }

  private handleFrameMessage(message: RealtimeCaptureFrameMessage) {
    if (!this.assembler || this.isPaused || message.type !== 'frame') {
      return;
    }

    const frameSamples = new Float32Array(message.samples);
    const startMs = this.frameCursor * REALTIME_DEFAULT_CAPTURE.frameMs;
    const endMs = startMs + REALTIME_DEFAULT_CAPTURE.frameMs;
    this.frameCursor += 1;

    const update = this.assembler.pushFrame({
      startMs,
      endMs,
      samples: frameSamples,
      rms: message.rms,
      peak: message.peak,
    });

    this.callbacks.onVoiceState?.(update.voiceState);
    update.chunks.forEach((chunk) => this.callbacks.onChunk?.(chunk));
  }

  private async cleanup() {
    const audioContext = this.audioContext;
    const mediaStream = this.mediaStream;
    const sourceNode = this.sourceNode;
    const workletNode = this.workletNode;
    const muteNode = this.muteNode;

    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.muteNode = null;
    this.assembler = null;
    this.callbacks = {};
    this.frameCursor = 0;
    this.isPaused = false;
    this.isStarted = false;

    try {
      sourceNode?.disconnect();
    } catch {}

    try {
      workletNode?.disconnect();
    } catch {}

    try {
      muteNode?.disconnect();
    } catch {}

    mediaStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });

    if (audioContext && audioContext.state !== 'closed') {
      try {
        await audioContext.close();
      } catch {}
    }
  }
}
