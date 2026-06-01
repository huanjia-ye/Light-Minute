import {
  resolveWhisperInferenceLanguage,
  resolveWhisperInferenceParams,
} from './whisperLanguage';

describe('whisper language helpers', () => {
  it('maps app language codes to whisper language codes', () => {
    expect(resolveWhisperInferenceLanguage('en-US')).toBe('en');
    expect(resolveWhisperInferenceLanguage('zh-CN')).toBe('zh');
  });

  it('disables auto-detection when an explicit supported language is provided', () => {
    expect(resolveWhisperInferenceParams('en-US')).toEqual({
      detectLanguage: 'false',
      language: 'en',
    });
    expect(resolveWhisperInferenceParams('zh-CN')).toEqual({
      detectLanguage: 'false',
      language: 'zh',
    });
  });

  it('keeps auto-detection on for unsupported or empty language inputs', () => {
    expect(resolveWhisperInferenceParams('auto')).toEqual({
      detectLanguage: 'true',
      language: null,
    });
    expect(resolveWhisperInferenceParams(undefined)).toEqual({
      detectLanguage: 'true',
      language: null,
    });
  });
});
