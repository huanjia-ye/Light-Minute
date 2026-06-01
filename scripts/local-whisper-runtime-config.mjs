import path from 'node:path';

export const MULTILINGUAL_SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'];
export const ENGLISH_ONLY_SUPPORTED_LANGUAGES = ['en-US'];

const DEFAULT_WHISPER_MODEL_CANDIDATES = [
  path.join('models', 'ggml-small.bin'),
  path.join('models', 'ggml-small-q5_1.bin'),
  path.join('models', 'ggml-small-q5_0.bin'),
  path.join('models', 'ggml-base.bin'),
  path.join('models', 'ggml-base.en.bin'),
  path.join('models', 'ggml-small.en.bin'),
  path.join('models', 'ggml-tiny.en.bin'),
];

export function buildPreferredWhisperModelCandidates(explicitModel) {
  return [explicitModel, ...DEFAULT_WHISPER_MODEL_CANDIDATES].filter(Boolean);
}

export function resolvePreferredWhisperThreadCount(explicitThreads, availableParallelism = 4) {
  const parsedExplicitThreads = Number.parseInt(String(explicitThreads ?? ''), 10);
  if (Number.isFinite(parsedExplicitThreads) && parsedExplicitThreads > 0) {
    return parsedExplicitThreads;
  }

  const normalizedParallelism = Math.max(1, Math.floor(Number(availableParallelism) || 1));
  return Math.min(8, Math.max(4, normalizedParallelism - 2));
}

export function getWhisperRuntimeProfile(modelName = '') {
  const normalizedModelName = path.basename(String(modelName || ''));
  const isEnglishOnly = /\.en(?=\.|-)/u.test(normalizedModelName);

  return {
    modelName: normalizedModelName,
    isEnglishOnly,
    supportedLanguages: isEnglishOnly
      ? ENGLISH_ONLY_SUPPORTED_LANGUAGES
      : MULTILINGUAL_SUPPORTED_LANGUAGES,
  };
}
