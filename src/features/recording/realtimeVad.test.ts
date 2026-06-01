import { RealtimeVad } from './realtimeVad';

function createSilenceFrame() {
  return {
    rms: 0.002,
    peak: 0.008,
  };
}

function createSpeechFrame() {
  return {
    rms: 0.045,
    peak: 0.18,
  };
}

describe('RealtimeVad', () => {
  it('keeps voice state unknown during calibration and then settles to silence', () => {
    const vad = new RealtimeVad();
    let lastResult = null;

    for (let index = 0; index < 15; index += 1) {
      lastResult = vad.consumeFrame(createSilenceFrame());
    }

    expect(lastResult?.voiceState).toBe('silence');
    expect(lastResult?.isCalibrating).toBe(false);
    expect(lastResult?.frameHasSpeech).toBe(false);
  });

  it('enters speech after the configured speech-start window', () => {
    const vad = new RealtimeVad();

    for (let index = 0; index < 15; index += 1) {
      vad.consumeFrame(createSilenceFrame());
    }

    for (let index = 0; index < 5; index += 1) {
      const result = vad.consumeFrame(createSpeechFrame());
      expect(result.voiceState).toBe('silence');
      expect(result.frameHasSpeech).toBe(true);
    }

    const speechStart = vad.consumeFrame(createSpeechFrame());
    expect(speechStart.voiceState).toBe('speech');
    expect(speechStart.frameHasSpeech).toBe(true);
    expect(speechStart.speechStarted).toBe(true);
    expect(speechStart.speechStartFrameCount).toBe(6);
  });

  it('returns to silence after the configured silence-end window', () => {
    const vad = new RealtimeVad();

    for (let index = 0; index < 15; index += 1) {
      vad.consumeFrame(createSilenceFrame());
    }

    for (let index = 0; index < 6; index += 1) {
      vad.consumeFrame(createSpeechFrame());
    }

    let lastResult = null;
    for (let index = 0; index < 25; index += 1) {
      lastResult = vad.consumeFrame(createSilenceFrame());
    }

    expect(lastResult?.voiceState).toBe('silence');
    expect(lastResult?.frameHasSpeech).toBe(true);

    const settledSilence = vad.consumeFrame(createSilenceFrame());
    expect(settledSilence.voiceState).toBe('silence');
    expect(settledSilence.frameHasSpeech).toBe(false);
  });

  it('resets back to unknown and recalibrates after reset', () => {
    const vad = new RealtimeVad();

    for (let index = 0; index < 15; index += 1) {
      vad.consumeFrame(createSilenceFrame());
    }

    for (let index = 0; index < 6; index += 1) {
      vad.consumeFrame(createSpeechFrame());
    }

    expect(vad.getCurrentVoiceState()).toBe('speech');

    vad.reset();

    const firstFrame = vad.consumeFrame(createSilenceFrame());
    expect(firstFrame.voiceState).toBe('unknown');
    expect(firstFrame.isCalibrating).toBe(true);
  });

  it('marks a force boundary when speech reaches maxUtteranceMs', () => {
    const vad = new RealtimeVad({
      calibrationMs: 20,
      speechStartMs: 20,
      silenceEndMs: 40,
      maxUtteranceMs: 100,
    });

    vad.consumeFrame(createSilenceFrame());

    let lastResult = null;
    for (let index = 0; index < 5; index += 1) {
      lastResult = vad.consumeFrame(createSpeechFrame());
    }

    expect(lastResult?.utteranceBoundaryReason).toBe('force');
    expect(lastResult?.voiceState).toBe('silence');
    expect(lastResult?.frameHasSpeech).toBe(true);
  });
});
