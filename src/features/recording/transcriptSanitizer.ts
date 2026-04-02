const NON_SPEECH_TOKEN_PATTERN =
  /\[(music|applause|laughter|noise|silence|blank_audio)\]/giu;

export function sanitizeTranscriptText(text: string) {
  return text
    .replace(NON_SPEECH_TOKEN_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function hasUsableTranscriptText(text: string) {
  const sanitized = sanitizeTranscriptText(text);

  if (!sanitized) {
    return false;
  }

  return /[\p{L}\p{N}\p{Script=Han}]/u.test(sanitized);
}
