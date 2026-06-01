// @vitest-environment node

import path from 'node:path';
import {
  buildPreferredWhisperModelCandidates,
  getWhisperRuntimeProfile,
  resolvePreferredWhisperThreadCount,
} from './local-whisper-runtime-config.mjs';

describe('local whisper runtime config', () => {
  it('treats multilingual models as zh-CN and en-US capable', () => {
    expect(getWhisperRuntimeProfile('ggml-small.bin')).toEqual({
      modelName: 'ggml-small.bin',
      isEnglishOnly: false,
      supportedLanguages: ['zh-CN', 'en-US'],
    });
  });

  it('treats english-only models as en-US only', () => {
    expect(getWhisperRuntimeProfile('models/ggml-small.en.bin')).toEqual({
      modelName: 'ggml-small.en.bin',
      isEnglishOnly: true,
      supportedLanguages: ['en-US'],
    });
  });

  it('prefers multilingual models first and base.en before small.en for english-only fallback', () => {
    expect(buildPreferredWhisperModelCandidates(undefined)).toEqual([
      path.join('models', 'ggml-small.bin'),
      path.join('models', 'ggml-small-q5_1.bin'),
      path.join('models', 'ggml-small-q5_0.bin'),
      path.join('models', 'ggml-base.bin'),
      path.join('models', 'ggml-base.en.bin'),
      path.join('models', 'ggml-small.en.bin'),
      path.join('models', 'ggml-tiny.en.bin'),
    ]);
  });

  it('keeps an explicit override at the front of the candidate list', () => {
    expect(buildPreferredWhisperModelCandidates('models/custom.bin')[0]).toBe('models/custom.bin');
  });

  it('chooses a higher default whisper thread count on larger CPUs', () => {
    expect(resolvePreferredWhisperThreadCount(undefined, 20)).toBe(8);
    expect(resolvePreferredWhisperThreadCount(undefined, 8)).toBe(6);
    expect(resolvePreferredWhisperThreadCount(undefined, 4)).toBe(4);
  });

  it('honors an explicit whisper thread override when provided', () => {
    expect(resolvePreferredWhisperThreadCount('10', 20)).toBe(10);
  });
});
