export function resolveWhisperInferenceLanguage(language?: string | null) {
  switch (language) {
    case 'en-US':
      return 'en';
    case 'zh-CN':
      return 'zh';
    default:
      return null;
  }
}

export function resolveWhisperInferenceParams(language?: string | null) {
  const whisperLanguage = resolveWhisperInferenceLanguage(language);

  return {
    detectLanguage: whisperLanguage ? 'false' : 'true',
    language: whisperLanguage,
  };
}
