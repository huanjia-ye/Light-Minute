const TARGET_SAMPLE_RATE = 16000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (TARGET_SAMPLE_RATE * FRAME_MS) / 1000;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processorCtor: new (options?: unknown) => AudioWorkletProcessor,
): void;

function clampSample(value: number) {
  if (value < -1) {
    return -1;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

class RealtimeCaptureProcessor extends AudioWorkletProcessor {
  private sourceBuffer: number[] = [];
  private frameBuffer: number[] = [];
  private resamplePosition = 0;

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const inputChannels = inputs[0] ?? [];
    const outputChannels = outputs[0] ?? [];

    outputChannels.forEach((channel) => {
      channel.fill(0);
    });

    if (inputChannels.length === 0 || inputChannels[0].length === 0) {
      return true;
    }

    const monoSamples = this.mixToMono(inputChannels);
    this.sourceBuffer.push(...monoSamples);
    this.pullResampledFrames();

    return true;
  }

  private mixToMono(channels: Float32Array[]) {
    const sampleCount = channels[0]?.length ?? 0;
    const monoSamples = new Array<number>(sampleCount);

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      let mixed = 0;

      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        mixed += channels[channelIndex]?.[sampleIndex] ?? 0;
      }

      monoSamples[sampleIndex] = clampSample(mixed / channels.length);
    }

    return monoSamples;
  }

  private pullResampledFrames() {
    const sourceStep = sampleRate / TARGET_SAMPLE_RATE;

    while (this.resamplePosition + 1 < this.sourceBuffer.length) {
      const leftIndex = Math.floor(this.resamplePosition);
      const fraction = this.resamplePosition - leftIndex;
      const leftSample = this.sourceBuffer[leftIndex] ?? 0;
      const rightSample = this.sourceBuffer[leftIndex + 1] ?? leftSample;
      const interpolatedSample = leftSample + ((rightSample - leftSample) * fraction);

      this.frameBuffer.push(clampSample(interpolatedSample));
      this.resamplePosition += sourceStep;

      if (this.frameBuffer.length >= FRAME_SAMPLES) {
        this.emitFrame(this.frameBuffer.splice(0, FRAME_SAMPLES));
      }
    }

    const consumedSamples = Math.floor(this.resamplePosition);
    if (consumedSamples > 0) {
      this.sourceBuffer.splice(0, consumedSamples);
      this.resamplePosition -= consumedSamples;
    }
  }

  private emitFrame(frameSamples: number[]) {
    const frame = new Float32Array(FRAME_SAMPLES);
    let sumSquares = 0;
    let peak = 0;

    for (let index = 0; index < FRAME_SAMPLES; index += 1) {
      const sample = clampSample(frameSamples[index] ?? 0);
      frame[index] = sample;
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    this.port.postMessage(
      {
        type: 'frame',
        samples: frame.buffer,
        rms: Math.sqrt(sumSquares / FRAME_SAMPLES),
        peak,
      },
      [frame.buffer],
    );
  }
}

registerProcessor('light-minute-realtime-capture', RealtimeCaptureProcessor);
